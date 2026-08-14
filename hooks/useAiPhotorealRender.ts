"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { useToast } from "@/hooks/use-toast";
import type { PreparedCustomizerCartItem } from "@/components/universal-customizer/AddToCartButton";
import {
  buildAiRenderLoginRedirect,
  clearPendingAiRender,
  loadPendingAiRender,
  savePendingAiRender,
  type PendingAiRender,
  type PendingAiRenderCartItem,
} from "@/lib/pending-ai-render";

const AI_RENDER_LOADING_MSG = "AI 擬真渲染中，請勿關閉分頁…";
const AI_RENDER_LOADING_HINT =
  "渲染一開始即扣除今日額度（每日 3 次）；關閉分頁或中斷也會算一次。";

export type AiRenderConfirmState = {
  open: boolean;
  compositeUrl: string;
  aiUrl: string;
  cartItem: PendingAiRenderCartItem;
};

function withAiRenderCustomization(
  customizations: unknown[],
  aiUrl: string,
  originalPreviewUrl: string,
): unknown[] {
  const withoutAi = customizations.filter((c) => {
    if (!c || typeof c !== "object") return true;
    return (c as { group?: string }).group !== "ai_render";
  });
  return [
    ...withoutAi,
    {
      group: "ai_render",
      group_name_zh: "AI 擬真渲染",
      summary: "已生成 AI 擬真圖",
      value: { url: aiUrl },
      details: { original_preview_url: originalPreviewUrl },
    },
  ];
}

async function callAiRenderApi(sourceImageUrl: string): Promise<{ result_url: string }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("請先登入會員");

  const res = await fetch("/api/customizer/ai-render", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ source_image_url: sourceImageUrl }),
  });

  const json = (await res.json().catch(() => null)) as { result_url?: string; error?: string } | null;
  if (!res.ok) {
    throw new Error(json?.error || `AI 渲染失敗（HTTP ${res.status}）`);
  }
  if (!json?.result_url) throw new Error("AI 渲染未回傳圖片");
  return { result_url: json.result_url };
}

export function useAiPhotorealRender() {
  const { user } = useAuth();
  const { addToCartCustom } = useCart();
  const { toast } = useToast();
  const router = useRouter();
  const [isRendering, setIsRendering] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState(AI_RENDER_LOADING_MSG);
  const [confirmState, setConfirmState] = useState<AiRenderConfirmState>({
    open: false,
    compositeUrl: "",
    aiUrl: "",
    cartItem: {
      product_id: "",
      name: "",
      category: "",
      quantity: 1,
      price: 0,
      total_price: 0,
      preview_url: "",
      temp_id: "",
      customizations: [],
    },
  });
  const [showLoginRequired, setShowLoginRequired] = useState(false);

  // 渲染中離開／重新整理時跳出瀏覽器原生確認（並提醒額度已扣）
  useEffect(() => {
    if (!isRendering) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = AI_RENDER_LOADING_HINT;
      return AI_RENDER_LOADING_HINT;
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isRendering]);

  const finishAddToCart = useCallback(
    (cartItem: PendingAiRenderCartItem, previewUrl: string, aiUrl: string, compositeUrl: string) => {
      const customizations = withAiRenderCustomization(
        Array.isArray(cartItem.customizations) ? cartItem.customizations : [],
        aiUrl,
        compositeUrl,
      );
      addToCartCustom({
        ...cartItem,
        preview_url: previewUrl,
        customizations,
      });
      clearPendingAiRender();
      setConfirmState((s) => ({ ...s, open: false }));
      toast({
        title: "✅ 已加入購物車",
        description: previewUrl === aiUrl ? "已使用 AI 擬真圖作為預覽" : "已沿用合成圖作為預覽",
      });
      router.push("/cart");
    },
    [addToCartCustom, router, toast],
  );

  const runRenderFromPrepared = useCallback(
    async (prepared: PreparedCustomizerCartItem | PendingAiRenderCartItem, returnPath: string) => {
      const compositeUrl = prepared.preview_url?.trim();
      if (!compositeUrl || !/^https?:\/\//i.test(compositeUrl)) {
        throw new Error("尚未取得合成預覽圖，請稍後再試");
      }

      const cartItem: PendingAiRenderCartItem = {
        product_id: prepared.product_id,
        name: prepared.name,
        category: prepared.category,
        quantity: prepared.quantity,
        price: prepared.price ?? 0,
        total_price: prepared.total_price ?? 0,
        preview_url: compositeUrl,
        temp_id: prepared.temp_id,
        customizations: Array.isArray(prepared.customizations) ? prepared.customizations : [],
      };

      savePendingAiRender({
        v: 1,
        created_at: Date.now(),
        return_path: returnPath,
        composite_preview_url: compositeUrl,
        cart_item: cartItem,
      });

      if (!user) {
        setShowLoginRequired(true);
        return;
      }

      setIsRendering(true);
      setLoadingMessage(AI_RENDER_LOADING_MSG);
      try {
        const { result_url } = await callAiRenderApi(compositeUrl);
        setConfirmState({
          open: true,
          compositeUrl,
          aiUrl: result_url,
          cartItem,
        });
      } finally {
        setIsRendering(false);
      }
    },
    [user],
  );

  const continueAfterLoginChoice = useCallback(() => {
    setShowLoginRequired(false);
    const pending = loadPendingAiRender();
    if (!pending) {
      toast({ title: "找不到待續跑的設計", variant: "destructive" });
      return;
    }
    router.push(buildAiRenderLoginRedirect(pending.return_path || window.location.pathname));
  }, [router, toast]);

  const resumePendingAiRender = useCallback(async () => {
    const pending = loadPendingAiRender();
    if (!pending) return false;
    if (!user) {
      setShowLoginRequired(true);
      return true;
    }

    setIsRendering(true);
    setLoadingMessage(AI_RENDER_LOADING_MSG);
    try {
      const { result_url } = await callAiRenderApi(pending.composite_preview_url);
      const next: PendingAiRender = { ...pending, ai_result_url: result_url };
      savePendingAiRender(next);
      setConfirmState({
        open: true,
        compositeUrl: pending.composite_preview_url,
        aiUrl: result_url,
        cartItem: pending.cart_item,
      });
      return true;
    } finally {
      setIsRendering(false);
    }
  }, [user]);

  const confirmUseAiPreview = useCallback(
    (useAi: boolean) => {
      const { cartItem, aiUrl, compositeUrl } = confirmState;
      if (!aiUrl || !cartItem.product_id) return;
      finishAddToCart(cartItem, useAi ? aiUrl : compositeUrl, aiUrl, compositeUrl);
    },
    [confirmState, finishAddToCart],
  );

  const closeConfirm = useCallback(() => {
    setConfirmState((s) => ({ ...s, open: false }));
  }, []);

  return {
    isRendering,
    loadingMessage,
    loadingHint: AI_RENDER_LOADING_HINT,
    confirmState,
    showLoginRequired,
    setShowLoginRequired,
    runRenderFromPrepared,
    resumePendingAiRender,
    continueAfterLoginChoice,
    confirmUseAiPreview,
    closeConfirm,
  };
}
