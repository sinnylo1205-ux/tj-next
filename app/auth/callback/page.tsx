"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  loadPendingAiRender,
  sanitizeAppPath,
  withResumeAiRender,
} from "@/lib/pending-ai-render";

/**
 * OAuth／Email 驗證落地頁：交換 session 後導回 next（或 pending AI 的編輯器路徑）。
 * Google 登入不需驗證信，也會經由此頁以統一導回邏輯。
 */
function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("正在完成登入…");

  useEffect(() => {
    let cancelled = false;

    const finish = (path: string) => {
      if (cancelled) return;
      router.replace(path);
    };

    const run = async () => {
      try {
        const code = searchParams.get("code");
        const nextFromQuery = sanitizeAppPath(searchParams.get("next"));

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            console.error("[auth/callback] exchangeCodeForSession", error);
            setMessage("登入連結已失效，請重新登入");
            finish(`/login?redirect=${encodeURIComponent(nextFromQuery || "/")}`);
            return;
          }
        } else {
          // hash fragment（部分 Email 驗證流程）由 supabase-js 處理
          await supabase.auth.getSession();
        }

        const pending = loadPendingAiRender();
        let next = nextFromQuery || "/";
        if (pending?.return_path) {
          next = withResumeAiRender(pending.return_path);
        } else if (nextFromQuery && pending) {
          next = withResumeAiRender(nextFromQuery);
        }

        setMessage(pending ? "正在回到您的設計並繼續 AI 渲染…" : "登入成功，正在導向…");
        finish(next);
      } catch (e) {
        console.error("[auth/callback]", e);
        setMessage("登入處理失敗，請重新登入");
        const pending = loadPendingAiRender();
        const fallback = pending?.return_path
          ? `/login?redirect=${encodeURIComponent(withResumeAiRender(pending.return_path))}`
          : "/login";
        finish(fallback);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <p className="text-muted-foreground animate-pulse text-center">{message}</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-muted-foreground animate-pulse">載入中…</p>
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
