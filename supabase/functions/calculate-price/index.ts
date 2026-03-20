// ======================================================================
// calculate-price Edge Function — 統一價格計算後端
// ======================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.22.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ========== Zod Schema 驗證 ==========
const BoxConfigSchema = z.object({
  capacity_option_id: z.number().int().positive(),
  color_option_id: z.number().int().positive(),
  quantity: z.number().int().min(1),
});

const PriceRequestSchema = z.object({
  product_id: z.string().min(1, "產品 ID 不能為空"),
  quantity: z.number().int().min(1, "數量至少為 1"),
  selected_option_ids: z.array(z.number().int()).default([]),
  package_style_id: z.number().int().optional(),
  box_configs: z.array(BoxConfigSchema).default([]),
  package_decoration_ids: z.array(z.number().int()).default([]),
  package_decoration_quantity: z.number().int().min(0).optional(),
  has_photo_uploaded: z.boolean().default(false),
  decoration_option_ids: z.array(z.number().int()).default([]),
  text_input_price: z.number().min(0).default(0),
  // 馬卡龍專用：指定顏色模式
  macaron_custom_mode: z.boolean().default(false),
});

interface ConditionalFeeDetail {
  option_id: number;
  option_name_zh: string;
  fee: number;
}

interface PriceBreakdown {
  base_price: number;
  option_modifiers: Array<{
    option_id: number;
    option_name: string;
    price_modifier: number;
  }>;
  unit_price: number;
  dessert_total: number;
  package_style_total: number;
  package_box_total: number;
  package_decoration_total: number;
  package_total: number;
  conditional_fee: number;
  conditional_fee_reason?: string;
  conditional_fee_details?: ConditionalFeeDetail[];
  macaron_custom_fee: number; // 馬卡龍指定顏色費（10% of dessert_total）
  grand_total: number;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

interface PriceResponse {
  success: boolean;
  data?: {
    breakdown: PriceBreakdown;
    validation: ValidationResult;
  };
  error?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ========== 輸入驗證 ==========
    const rawData = await req.json();
    const parseResult = PriceRequestSchema.safeParse(rawData);

    if (!parseResult.success) {
      console.error("❌ Validation error:", parseResult.error.flatten());
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "參數驗證失敗",
          details: parseResult.error.flatten().fieldErrors
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const requestData = parseResult.data;
    console.log("📥 Price calculation request:", JSON.stringify(requestData, null, 2));

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const {
      product_id,
      quantity,
      selected_option_ids,
      package_style_id,
      box_configs,
      package_decoration_ids,
      has_photo_uploaded,
      decoration_option_ids,
      macaron_custom_mode,
    } = requestData;

    // ========== 爆米花專用常數 ==========
    const POPCORN_DESIGN_OPTION_ID = 7299;
    const isPopcornDesign = product_id === "popcorn" && selected_option_ids.includes(POPCORN_DESIGN_OPTION_ID);

    // ========== 1. 載入產品基礎價格 ==========
    let basePrice = 0;
    let minOrderQty = 1;

    const { data: productNotice } = await supabase
      .from("product_notice")
      .select("price_min, min_order_qty")
      .eq("product_id", product_id)
      .maybeSingle();

    if (productNotice?.price_min) {
      basePrice = productNotice.price_min;
      minOrderQty = productNotice.min_order_qty || 1;
      console.log("📦 Using price from product_notice:", basePrice);
    } else {
      const { data: productData, error: productError } = await supabase
        .from("products")
        .select("price")
        .eq("id", product_id)
        .single();

      if (productError || !productData) {
        console.error("❌ Product not found in both tables:", productError);
        return new Response(JSON.stringify({ success: false, error: `找不到產品: ${product_id}` }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
      }

      basePrice = productData.price || 0;
      console.log("📦 Using price from products table:", basePrice);
    }

    // ========== 2. 載入選項價格修正（顏色/口味/尺寸） ==========
    let optionModifiers: Array<{ option_id: number; option_name: string; price_modifier: number; parent_id: number | null }> = [];

    if (selected_option_ids.length > 0) {
      const { data: optionsData, error: optionsError } = await supabase
        .from("master_options")
        .select("option_id, option_name_zh, price_modifier, parent_id")
        .in("option_id", selected_option_ids);

      if (optionsError) {
        console.error("❌ Options query error:", optionsError);
      } else if (optionsData) {
        optionModifiers = optionsData.map((opt) => ({
          option_id: opt.option_id,
          option_name: opt.option_name_zh,
          price_modifier: opt.price_modifier || 0,
          parent_id: opt.parent_id ?? null,
        }));
      }
    }

    // ========== 2b. 載入甜點裝飾品價格修正 ==========
    let decorationModifiers: Array<{ option_id: number; option_name: string; price_modifier: number }> = [];

    if (decoration_option_ids.length > 0) {
      const { data: decoData, error: decoError } = await supabase
        .from("master_options")
        .select("option_id, option_name_zh, price_modifier")
        .in("option_id", decoration_option_ids);

      if (decoError) {
        console.error("❌ Decoration options query error:", decoError);
      } else if (decoData) {
        decorationModifiers = decoData.map((opt) => ({
          option_id: opt.option_id,
          option_name: opt.option_name_zh,
          price_modifier: opt.price_modifier || 0,
        }));
      }
    }

    // ========== 3. 條件費用選項定義 ==========
    const conditionalFeeOptionIds = [3006, 3007, 7300, 7301];
    const conditionalFeeMap: Record<number, { fee: number; name_zh: string }> = {
      3006: { fee: 1000, name_zh: "" },
      3007: { fee: 3000, name_zh: "" },
      7300: { fee: 1000, name_zh: "" },
      // 與 3006 相同：未達 100 個 + 已上傳照片時的條件加價
      7301: { fee: 1000, name_zh: "" },
    };

    const { data: conditionalOptionsData } = await supabase
      .from("master_options")
      .select("option_id, option_name_zh")
      .in("option_id", conditionalFeeOptionIds);

    if (conditionalOptionsData) {
      for (const opt of conditionalOptionsData) {
        if (conditionalFeeMap[opt.option_id]) {
          conditionalFeeMap[opt.option_id].name_zh = opt.option_name_zh;
        }
      }
    }

    // ========== 4. 計算單價 ==========
    let totalOptionModifier = 0;
    let popcornDesignPrice = 0; // 爆米花 7299 設計費（不計入單價）
    const POPCORN_SIZE_ROOT_ID = 5000;

    for (const opt of optionModifiers) {
      // 爆米花 7299 特殊處理：不計入單價，改計入 packageStyleTotal
      if (isPopcornDesign && opt.option_id === POPCORN_DESIGN_OPTION_ID) {
        popcornDesignPrice = opt.price_modifier;
        console.log(`🍿 Popcorn design option 7299 price: ${popcornDesignPrice} (will be added to package_style_total)`);
        continue;
      }
      // 爆米花尺寸（root=5000）不計入甜點單價，避免與包裝款式重複加價
      if (product_id === "popcorn" && opt.parent_id === POPCORN_SIZE_ROOT_ID) {
        console.log(
          `🍿 Skipping popcorn size modifier in unit_price: option_id=${opt.option_id}, parent_id=${opt.parent_id}, price_modifier=${opt.price_modifier}`,
        );
        continue;
      }
      totalOptionModifier += opt.price_modifier;
    }

    let totalDecorationModifier = 0;
    for (const opt of decorationModifiers) {
      if (quantity < 100 && conditionalFeeOptionIds.includes(opt.option_id)) {
        console.log(`⚠️ Skipping decoration modifier for option ${opt.option_id} (quantity < 100)`);
        continue;
      }
      totalDecorationModifier += opt.price_modifier;
    }

    const textInputModifier = requestData.text_input_price || 0;
    const unitPrice = basePrice + totalOptionModifier + totalDecorationModifier + textInputModifier;
    console.log(`💰 Unit price: base=${basePrice} + options=${totalOptionModifier} + decorations=${totalDecorationModifier} + text=${textInputModifier} = ${unitPrice}`);

    // ========== 5. 計算甜點總價 ==========
    const dessertTotal = unitPrice * quantity;

    // ========== 6. 計算非盒裝包裝款式價格 ==========
    let packageStyleTotal = 0;

    // 爆米花 7299 設計費計入 packageStyleTotal
    if (isPopcornDesign && popcornDesignPrice > 0) {
      packageStyleTotal = popcornDesignPrice * quantity;
      console.log(`🍿 Popcorn design 7299 added to packageStyleTotal: ${popcornDesignPrice} × ${quantity} = ${packageStyleTotal}`);
    } else if (package_style_id && package_style_id !== 7030) {
      const { data: pkgStyleData, error: pkgStyleError } = await supabase
        .from("product_options")
        .select("price_modifier")
        .eq("product_id", product_id)
        .eq("option_id", package_style_id)
        .maybeSingle();

      if (!pkgStyleError && pkgStyleData) {
        packageStyleTotal = (pkgStyleData.price_modifier || 0) * quantity;
        console.log(`📦 Non-box package style ${package_style_id} price: ${pkgStyleData.price_modifier} × ${quantity} = ${packageStyleTotal}`);
      }
    }

    // ========== 7. 計算盒裝價格 ==========
    let packageBoxTotal = 0;

    if (box_configs && box_configs.length > 0) {
      console.log(`📦 Processing box_configs:`, JSON.stringify(box_configs));
      
      const capacityOptionIds = box_configs.map((c) => c.capacity_option_id);
      const colorOptionIds = box_configs.map((c) => c.color_option_id).filter(id => id < 100000);
      const allBoxOptionIds = [...capacityOptionIds, ...colorOptionIds];
      
      const { data: boxOptionsData, error: boxOptionsError } = await supabase
        .from("master_options")
        .select("option_id, price_modifier")
        .in("option_id", allBoxOptionIds);

      const { data: poPriceData, error: poPriceError } = await supabase
        .from("product_options")
        .select("option_id, price_modifier")
        .eq("product_id", product_id)
        .in("option_id", capacityOptionIds);

      if (boxOptionsError) {
        console.error("❌ Box options query error:", boxOptionsError);
      }
      if (poPriceError) {
        console.error("❌ Product options price query error:", poPriceError);
      }

      const masterPriceMap = new Map((boxOptionsData || []).map((c) => [c.option_id, c.price_modifier || 0]));
      const poPriceMap = new Map((poPriceData || []).map((c) => [c.option_id, c.price_modifier]));

      console.log(`📦 Master options data:`, JSON.stringify(boxOptionsData || []));
      console.log(`📦 Product options price data:`, JSON.stringify(poPriceData || []));

      for (const config of box_configs) {
        const poCapacityPrice = poPriceMap.get(config.capacity_option_id);
        const capacityPrice = (poCapacityPrice !== null && poCapacityPrice !== undefined) 
          ? poCapacityPrice 
          : (masterPriceMap.get(config.capacity_option_id) || 0);
        
        const colorPrice = masterPriceMap.get(config.color_option_id) || 0;
        
        const boxUnitPrice = capacityPrice + colorPrice;
        const configTotal = boxUnitPrice * config.quantity;
        packageBoxTotal += configTotal;
        console.log(`📦 Box config: capacity_id=${config.capacity_option_id}(${capacityPrice}), color_id=${config.color_option_id}(${colorPrice}), qty=${config.quantity}, total=${configTotal}`);
      }
      console.log(`📦 Total packageBoxTotal: ${packageBoxTotal}`);
    }

    // ========== 8. 計算包裝裝飾價格 ==========
    let packageDecorationTotal = 0;
    let decorationQuantity = requestData.package_decoration_quantity ?? quantity;

    if (package_style_id === 7030 && box_configs.length > 0 && !requestData.package_decoration_quantity) {
      decorationQuantity = box_configs.reduce((sum, c) => sum + c.quantity, 0);
    }

    if (package_decoration_ids && package_decoration_ids.length > 0) {
      const { data: decoData, error: decoError } = await supabase
        .from("master_options")
        .select("option_id, price_modifier")
        .in("option_id", package_decoration_ids);

      if (!decoError && decoData) {
        for (const deco of decoData) {
          packageDecorationTotal += (deco.price_modifier || 0) * decorationQuantity;
        }
      }
      console.log(`🎀 Package decoration total: ${packageDecorationTotal} (qty: ${decorationQuantity})`);
    }

    const packageTotal = packageStyleTotal + packageBoxTotal + packageDecorationTotal;

    // ========== 8. 條件式費用檢查 ==========
    let conditionalFee = 0;
    let conditionalFeeReason = "";
    const conditionalFeeDetails: ConditionalFeeDetail[] = [];

    if (quantity < 100 && has_photo_uploaded) {
      for (const optionId of conditionalFeeOptionIds) {
        if (decoration_option_ids.includes(optionId)) {
          const feeInfo = conditionalFeeMap[optionId];
          conditionalFee += feeInfo.fee;
          conditionalFeeDetails.push({
            option_id: optionId,
            option_name_zh: feeInfo.name_zh,
            fee: feeInfo.fee,
          });
        }
      }

      if (conditionalFeeDetails.length > 0) {
        const feeDescriptions = conditionalFeeDetails.map(
          (d) => `「${d.option_name_zh}」費用 NT$${d.fee.toLocaleString()}`
        );
        conditionalFeeReason = `包含${feeDescriptions.join("、")}`;
      }
    }

    // ========== 9. 計算馬卡龍指定顏色費 ==========
    let macaronCustomFee = 0;
    if (product_id === "macaron" && macaron_custom_mode) {
      macaronCustomFee = Math.round(dessertTotal * 0.1);
      console.log(`🎨 Macaron custom fee (10%): ${dessertTotal} × 0.1 = ${macaronCustomFee}`);
    }

    // ========== 10. 計算總價 ==========
    const grandTotal = dessertTotal + packageTotal + conditionalFee + macaronCustomFee;

    // ========== 11. 驗證 ==========
    const validation: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    if (quantity < minOrderQty) {
      validation.valid = false;
      validation.errors.push(`最小訂購量為 ${minOrderQty}`);
    }

    if (conditionalFee > 0) {
      validation.warnings.push(conditionalFeeReason);
    }

    // ========== 12. 組合回應 ==========
    const breakdown: PriceBreakdown = {
      base_price: basePrice,
      option_modifiers: optionModifiers,
      unit_price: unitPrice,
      dessert_total: dessertTotal,
      package_style_total: packageStyleTotal,
      package_box_total: packageBoxTotal,
      package_decoration_total: packageDecorationTotal,
      package_total: packageTotal,
      conditional_fee: conditionalFee,
      conditional_fee_reason: conditionalFeeReason || undefined,
      conditional_fee_details: conditionalFeeDetails.length > 0 ? conditionalFeeDetails : undefined,
      macaron_custom_fee: macaronCustomFee,
      grand_total: grandTotal,
    };

    console.log("✅ Price calculation result:", JSON.stringify(breakdown, null, 2));

    const response: PriceResponse = {
      success: true,
      data: {
        breakdown,
        validation,
      },
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("❌ Price calculation error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "伺服器處理請求時發生錯誤",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
