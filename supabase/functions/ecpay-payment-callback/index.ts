import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const N8N_WEBHOOK_URL = "https://tjcookies.app.n8n.cloud/webhook/line";
const N8N_CALENDAR_WEBHOOK_URL = "https://tjcookies.app.n8n.cloud/webhook/order-processing-to-calendar";

async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

async function generateCheckMacValueAsync(
  params: Record<string, string>,
  hashKey: string,
  hashIV: string,
): Promise<string> {
  const sortedKeys = Object.keys(params).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  let rawString = `HashKey=${hashKey}`;
  for (const key of sortedKeys) {
    rawString += `&${key}=${params[key]}`;
  }
  rawString += `&HashIV=${hashIV}`;

  let encoded = encodeURIComponent(rawString);
  encoded = encoded.toLowerCase();

  encoded = encoded
    .replace(/%2d/g, "-")
    .replace(/%5f/g, "_")
    .replace(/%2e/g, ".")
    .replace(/%21/g, "!")
    .replace(/%2a/g, "*")
    .replace(/%28/g, "(")
    .replace(/%29/g, ")")
    .replace(/%20/g, "+");

  return await sha256(encoded);
}

/** PostgREST `.single()` with 0 rows. Keep in sync with `lib/ecpay-callback-ack.ts`. */
function isPostgrestMissingRow(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return true;
  if (error.code === "PGRST116") return true;
  return /0 rows/i.test(error.message ?? "");
}

function ecpayRetryResponse(): Response {
  return new Response("0|Error", {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const params: Record<string, string> = {};

    for (const [key, value] of formData.entries()) {
      params[key] = String(value);
    }

    console.log("ECPay callback received:", JSON.stringify(params));

    const hashKey = Deno.env.get("ECPAY_HASH_KEY")!;
    const hashIV = Deno.env.get("ECPAY_HASH_IV")!;
    const expectedMerchantId = Deno.env.get("ECPAY_MERCHANT_ID")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const receivedCheckMac = params.CheckMacValue;
    delete params.CheckMacValue;

    const calculatedCheckMac = await generateCheckMacValueAsync(params, hashKey, hashIV);

    if (receivedCheckMac !== calculatedCheckMac) {
      console.error("CheckMacValue 驗證失敗");
      console.error("Received:", receivedCheckMac);
      console.error("Calculated:", calculatedCheckMac);
      return new Response("0|CheckMacValue Error", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }

    const rtnCode = params.RtnCode;
    const orderId = params.CustomField1; // 從 CustomField1 取得完整 order_id
    const merchantTradeNo = params.MerchantTradeNo;

    console.log("RtnCode:", rtnCode, "OrderId:", orderId, "MerchantTradeNo:", merchantTradeNo);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (rtnCode !== "1") {
      // 付款失敗 - 記錄到 system_events
      console.log("付款失敗，RtnCode:", rtnCode, "RtnMsg:", params.RtnMsg);

      if (orderId) {
        await supabase.from("system_events").insert({
          event_type: "payment_failed",
          source: "ecpay-payment-callback",
          ref_id: orderId,
          payload: {
            action_type: "credit_card_failed",
            status_message: `信用卡付款失敗: ${params.RtnMsg}`,
            payment_method: "credit_card",
            ecpay: {
              TradeNo: params.TradeNo,
              MerchantTradeNo: merchantTradeNo,
              RtnCode: rtnCode,
              RtnMsg: params.RtnMsg,
            },
          },
          sent_to_n8n: false,
        });
      }

      return new Response("1|OK", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }

    // 付款成功
    if (!orderId) {
      console.error("CustomField1 (order_id) 為空");
      return new Response("1|OK", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }

    // 取得訂單資訊（含之前狀態）
    const { data: order, error: findError } = await supabase
      .from("orders")
      .select(
        "id, user_id, total_amount, who_receive, expected_pickup_date, shipping_way, notes, order_status, payment_step, TAX_id, TAX_title, Email, shipping_fee",
      )
      .eq("id", orderId)
      .single();

    if (!order) {
      // Transient DB/network errors must not ACK — ECPay would stop retrying and the charge is lost.
      if (!isPostgrestMissingRow(findError)) {
        console.error("查詢訂單失敗，請綠界重試:", orderId, findError);
        return ecpayRetryResponse();
      }
      console.error("找不到訂單:", orderId, findError);
      return new Response("1|OK", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }

    const callbackMerchantId = String(params.MerchantID || "");
    if (callbackMerchantId !== expectedMerchantId) {
      console.error("❌ MerchantID mismatch:", { orderId, callbackMerchantId, expectedMerchantId });
      await supabase.from("system_events").insert({
        event_type: "payment_mismatch",
        source: "ecpay-payment-callback",
        ref_id: order.id,
        payload: {
          action_type: "merchant_id_mismatch",
          status_message: "綠界回傳 MerchantID 與系統設定不一致",
          expected_merchant_id: expectedMerchantId,
          callback_merchant_id: callbackMerchantId,
          ecpay: {
            TradeNo: params.TradeNo,
            MerchantTradeNo: merchantTradeNo,
            RtnCode: rtnCode,
            RtnMsg: params.RtnMsg,
          },
        },
        sent_to_n8n: false,
      });
      return new Response("1|OK", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }

    const callbackTradeAmt = Number(params.TradeAmt);
    const orderTotal = Math.round(Number(order.total_amount));
    if (!Number.isFinite(callbackTradeAmt) || callbackTradeAmt !== orderTotal) {
      console.error("❌ TradeAmt mismatch:", { orderId, callbackTradeAmt, orderTotal });
      await supabase.from("system_events").insert({
        event_type: "payment_mismatch",
        source: "ecpay-payment-callback",
        ref_id: order.id,
        payload: {
          action_type: "trade_amount_mismatch",
          status_message: "綠界回傳付款金額與訂單金額不一致",
          callback_trade_amt: params.TradeAmt,
          expected_trade_amt: orderTotal,
          ecpay: {
            TradeNo: params.TradeNo,
            MerchantTradeNo: merchantTradeNo,
            RtnCode: rtnCode,
            RtnMsg: params.RtnMsg,
          },
        },
        sent_to_n8n: false,
      });
      return new Response("1|OK", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }

    // ========== 冪等性檢查：防止重複處理 ==========
    if (order.payment_step === "verified") {
      console.log("⚠️ 訂單已完成付款，跳過重複處理:", orderId);
      return new Response("1|OK", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }

    // 記錄之前的狀態
    const previousStatus = order.order_status;
    const previousPaymentStep = order.payment_step;

    // 更新訂單狀態
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        payment_step: "verified",
        order_status: "processing",
        payment_method: "credit_card",
        admin_verified_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    if (updateError) {
      console.error("更新訂單狀態失敗:", updateError);
      return ecpayRetryResponse();
    }
    console.log("訂單狀態更新成功:", order.id);

    // 取得用戶資訊
    const { data: userInfo } = await supabase
      .from("user_log_in")
      .select("name, email, line_user_id")
      .eq("id", order.user_id)
      .single();

    // 取得訂單項目 + 產品名稱
    const { data: orderItems } = await supabase
      .from("order_items")
      .select("product_id, product_name, quantity, unit_price")
      .eq("order_id", order.id);

    // 取得產品中文名稱
    let productSummary = "";
    if (orderItems && orderItems.length > 0) {
      const productIds = [...new Set(orderItems.map((item: any) => item.product_id))];
      const { data: products } = await supabase.from("products").select("id, name").in("id", productIds);

      const productNameMap: Record<string, string> = {};
      if (products) {
        products.forEach((p: any) => {
          productNameMap[p.id] = p.name || p.id;
        });
      }

      productSummary = orderItems
        .map((item: any) => {
          const displayName = productNameMap[item.product_id] || item.product_name;
          return `${displayName} x${item.quantity}`;
        })
        .join("、");
    }

    // 組裝 eventPayload（與 update-order-status 對齊）
    const eventPayload = {
      action_type: "verify_payment",
      status_message: "信用卡付款成功，訂單處理中",
      payment_method: "credit_card",
      order_id: order.id,
      order_status: "processing",
      previous_status: previousStatus,
      previous_payment_step: previousPaymentStep,
      user_id: order.user_id,
      line_user_id: userInfo?.line_user_id || null,
      user_name: userInfo?.name || null,
      user_email: userInfo?.email || null,
      customer_email: userInfo?.email || null,
      recipient_name: order.who_receive,
      total_amount: order.total_amount,
      expected_pickup_date: order.expected_pickup_date,
      shipping_way: order.shipping_way,
      notes: order.notes,
      product_summury: productSummary, // 保持與現有格式一致
      ecpay: {
        TradeNo: params.TradeNo,
        MerchantTradeNo: merchantTradeNo,
        PaymentDate: params.PaymentDate,
        PaymentType: params.PaymentType,
        TradeAmt: params.TradeAmt,
      },
    };

    // 寫入 system_events
    const { data: eventData, error: eventError } = await supabase
      .from("system_events")
      .insert({
        event_type: "order_status_update",
        source: "ecpay-payment-callback",
        ref_id: order.id,
        payload: eventPayload,
        sent_to_n8n: false,
      })
      .select()
      .single();

    if (eventError) {
      console.error("寫入 system_events 失敗:", eventError);
    }

    // 發送 n8n webhook（使用與其他 function 一致的格式）
    try {
      const n8nPayload = {
        source: "system",
        event_type: "order_status_update",
        ref_id: order.id,
        payload: eventPayload,
      };

      const webhookResponse = await fetch(N8N_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(n8nPayload),
      });

      console.log("n8n webhook response status:", webhookResponse.status);

      // 更新 system_events
      if (eventData) {
        await supabase
          .from("system_events")
          .update({
            sent_to_n8n: true,
            n8n_response_status: webhookResponse.status,
          })
          .eq("id", eventData.id);
      }
    } catch (webhookError) {
      console.error("n8n webhook 失敗:", webhookError);
    }

    // ========== 信用卡付款成功，發送到 Google 日曆 ==========
    try {
      console.log("[ecpay-payment-callback] Sending to Google Calendar webhook...");

      const calendarPayload = {
        order_id: order.id,
        order_status: "processing",
        member_name: userInfo?.name || null,
        recipient_name: order.who_receive || null,
        pickup_date: order.expected_pickup_date,
        order_items_text: productSummary,
        pickup_method: order.shipping_way || null,
      };

      console.log("[ecpay-payment-callback] Calendar payload:", JSON.stringify(calendarPayload));

      const calendarResponse = await fetch(N8N_CALENDAR_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(calendarPayload),
      });

      console.log("[ecpay-payment-callback] Calendar webhook status:", calendarResponse.status);
    } catch (calendarError) {
      console.error("[ecpay-payment-callback] Calendar webhook error:", calendarError);
    }

    // ========== 信用卡付款成功，發送發票/統編 webhook ==========
    try {
      console.log("[ecpay-payment-callback] Sending tax invoice webhook...");

      const { data: taxItems } = await supabase
        .from("order_items")
        .select("product_name, quantity, unit_price")
        .eq("order_id", order.id);

      const itemsPayload = (taxItems ?? []).map((item: any) => ({
        product_name: item.product_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        subtotal: item.quantity * item.unit_price,
      }));

      // toChineseUppercase helper
      const toChineseUppercase = (num: number): string => {
        const units = ["", "拾", "佰", "仟"];
        const bigUnits = ["", "萬", "億"];
        const nums = ["零", "壹", "貳", "參", "肆", "伍", "陸", "柒", "捌", "玖"];
        let str = Math.floor(num).toString();
        let result = "";
        let bigUnitPos = 0;
        let zero = false;
        while (str.length > 0) {
          const section = str.slice(-4);
          str = str.slice(0, -4);
          let sectionStr = "";
          for (let i = 0; i < section.length; i++) {
            const digit = parseInt(section[section.length - 1 - i]);
            if (digit === 0) {
              if (!zero) { zero = true; sectionStr = nums[0] + sectionStr; }
            } else {
              zero = false;
              sectionStr = nums[digit] + units[i] + sectionStr;
            }
          }
          if (sectionStr !== "") { sectionStr += bigUnits[bigUnitPos]; }
          result = sectionStr + result;
          bigUnitPos++;
        }
        result = result.replace(/零+/g, "零").replace(/零$/, "");
        return result + "元整";
      };

      const taxPayload = {
        "updated_at(status.processing)": new Date().toISOString().slice(0, 10),
        tax_title: order.TAX_title || null,
        tax_id: order.TAX_id ? String(order.TAX_id) : null,
        items: itemsPayload,
        total_amount: order.total_amount,
        total_amount_chinese: toChineseUppercase(order.total_amount || 0),
        email: order.Email || userInfo?.email || null,
        line_user_id: userInfo?.line_user_id || null,
        shipping_fee: order.shipping_fee || 0,
      };

      console.log("[ecpay-payment-callback] Tax payload:", JSON.stringify(taxPayload));

      const taxResponse = await fetch("https://tjcookies.app.n8n.cloud/webhook/TAX_id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(taxPayload),
      });

      console.log("[ecpay-payment-callback] Tax webhook status:", taxResponse.status);
    } catch (taxError) {
      console.error("[ecpay-payment-callback] Tax webhook error:", taxError);
    }

    return new Response("1|OK", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  } catch (error) {
    console.error("ECPay callback error:", error);
    return new Response("0|Error", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
});
