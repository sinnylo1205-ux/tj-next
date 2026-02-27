/**
 * 價格計算 API — 呼叫 Supabase Edge Function「calculate-price」，
 * 依選項（顏色/口味/尺寸/包裝等）與數量計算單價與總價。
 */
import { supabase } from "@/lib/supabase";

export interface PriceBreakdown {
  unit_price: number;
  grand_total: number;
  /** 甜點小計（不含包裝、插卡） */
  dessert_total?: number;
  /** 包裝費用總計（款式+盒裝+裝飾） */
  package_total?: number;
  /** 包裝款式小計（Edge Function 回傳） */
  package_style_total?: number;
  /** 盒裝小計（Edge Function 回傳） */
  package_box_total?: number;
  /** 包裝裝飾小計（Edge Function 回傳） */
  package_decoration_total?: number;
  conditional_fee?: number;
  conditional_fee_details?: ConditionalFeeDetail[];
}

export interface PriceValidation {
  valid: boolean;
  message?: string;
  errors?: string[];
  warnings?: string[];
}

export interface ConditionalFeeDetail {
  label: string;
  amount: number;
}

export interface CalculatePriceRequest {
  product_id: string;
  quantity: number;
  selected_option_ids?: number[];
  decoration_option_ids?: number[];
  has_photo_uploaded?: boolean;
  text_input_price?: number;
  package_style_id?: number;
  box_configs?: { capacity_option_id: number; color_option_id: number; quantity: number }[];
  package_decoration_ids?: number[];
  package_decoration_quantity?: number;
  macaron_custom_mode?: boolean;
}

export interface CalculatePriceResponse {
  success: boolean;
  data?: {
    breakdown: PriceBreakdown;
    validation: PriceValidation;
  };
  error?: string;
}

export async function calculatePrice(req: CalculatePriceRequest): Promise<CalculatePriceResponse> {
  const body = {
    product_id: req.product_id,
    quantity: req.quantity,
    selected_option_ids: req.selected_option_ids ?? [],
    decoration_option_ids: req.decoration_option_ids ?? [],
    has_photo_uploaded: req.has_photo_uploaded ?? false,
    text_input_price: req.text_input_price ?? 0,
    package_style_id: req.package_style_id,
    box_configs: req.box_configs ?? [],
    package_decoration_ids: req.package_decoration_ids ?? [],
    package_decoration_quantity: req.package_decoration_quantity,
    macaron_custom_mode: req.macaron_custom_mode ?? false,
  };

  if (typeof window !== "undefined") {
    console.log("[calculatePrice] 請求:", body);
  }

  try {
    const { data, error } = await supabase.functions.invoke("calculate-price", { body });

    if (error) {
      if (typeof window !== "undefined") console.error("[calculatePrice] Edge Function 錯誤:", error);
      return { success: false, error: error.message };
    }

    if (data?.success && data?.data?.breakdown) {
      const b = data.data.breakdown as {
        unit_price: number;
        grand_total: number;
        dessert_total?: number;
        package_total?: number;
        conditional_fee?: number;
        conditional_fee_details?: Array<{ option_name_zh?: string; fee?: number }>;
      };
      const breakdown: PriceBreakdown = {
        unit_price: b.unit_price,
        grand_total: b.grand_total,
        dessert_total: b.dessert_total,
        package_total: b.package_total,
        conditional_fee: b.conditional_fee ?? 0,
        conditional_fee_details:
          b.conditional_fee_details?.map((d) => ({ label: d.option_name_zh ?? "", amount: d.fee ?? 0 })) ?? [],
      };
      const validation = data.data.validation as PriceValidation | undefined;
      if (typeof window !== "undefined") {
        console.log("[calculatePrice] 結果:", { unit_price: breakdown.unit_price, grand_total: breakdown.grand_total });
      }
      return {
        success: true,
        data: {
          breakdown,
          validation: validation ?? { valid: true },
        },
      };
    }

    const errMsg = (data as { error?: string })?.error ?? "價格計算無回傳資料";
    if (typeof window !== "undefined") console.warn("[calculatePrice] 無有效回傳:", data);
    return { success: false, error: errMsg };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "價格計算失敗";
    if (typeof window !== "undefined") console.error("[calculatePrice] 例外:", e);
    return { success: false, error: msg };
  }
}

export function debounce<T extends (...args: unknown[]) => unknown>(fn: T, ms: number): T {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return ((...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      timeout = null;
      fn(...args);
    }, ms);
  }) as T;
}
