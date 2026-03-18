import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.22.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RequestSchema = z.object({
  order_id: z.string().uuid("訂單 ID 格式錯誤"),
  patch: z.record(z.any()),
});

// 僅允許更新 orders；明確不提供 order_items 更新
const ALLOWED_KEYS = new Set([
  "user_id",
  "Email",
  "who_receive",
  "phone",
  "shipping_way",
  "shipping_address_text",
  "expected_pickup_date",
  "notes",
  "subtotal",
  "shipping_fee",
  "total_amount",
  "payment_method",
  "payment_step",
  "order_status",
  "transfer_last5",
  "admin_note",
  "line_user_id",
  "TAX_title",
  "TAX_id",
  "is_hide",
  "is_manual_order",
  "is_from_quotation",
  "auto_cancel_exempt",
  "admin_verified_at",
  "shipped_at",
  "delivered_at",
]);

const FORBIDDEN_KEYS = new Set(["id", "created_at", "updated_at"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "未授權" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "認證失敗" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleRow, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (roleError || !roleRow) {
      return new Response(JSON.stringify({ error: "權限不足" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const raw = await req.json();
    const parsed = RequestSchema.safeParse(raw);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "參數驗證失敗", details: parsed.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { order_id, patch } = parsed.data;
    const updateData: Record<string, any> = {};

    for (const [k, v] of Object.entries(patch)) {
      if (FORBIDDEN_KEYS.has(k)) continue;
      if (!ALLOWED_KEYS.has(k)) continue;
      updateData[k] = v;
    }

    if (Object.keys(updateData).length === 0) {
      return new Response(JSON.stringify({ error: "沒有可更新的欄位" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[admin-update-order] Updating:", JSON.stringify({ order_id, keys: Object.keys(updateData) }));

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("orders")
      .update(updateData)
      .eq("id", order_id)
      .select("*")
      .single();

    if (updateError || !updated) {
      console.error("[admin-update-order] Update failed:", updateError);
      return new Response(JSON.stringify({ error: "更新失敗", details: updateError?.message || null }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, order: updated }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[admin-update-order] Error:", e);
    return new Response(JSON.stringify({ error: "伺服器錯誤" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

