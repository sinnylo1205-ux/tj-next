import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLineOAuthState } from "../_shared/line-oauth-state.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LINE_CHANNEL_ID = "2008793012";
const LINE_REDIRECT_URI = "https://akrxbdoxiopiubksgcrl.supabase.co/functions/v1/line-auth-callback";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "未登入，請先登入" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const orderId = typeof body?.order_id === "string" ? body.order_id.trim() : "";
    if (!orderId) {
      return new Response(JSON.stringify({ error: "缺少 order_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lineChannelSecret = Deno.env.get("LINE_CHANNEL_SECRET");

    if (!lineChannelSecret) {
      console.error("[line-auth-start] LINE_CHANNEL_SECRET not configured");
      return new Response(JSON.stringify({ error: "伺服器設定錯誤" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: authUser },
      error: authError,
    } = await supabaseAuth.auth.getUser();
    if (authError || !authUser) {
      return new Response(JSON.stringify({ error: "身分驗證失敗，請重新登入" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, user_id")
      .eq("id", orderId)
      .eq("user_id", authUser.id)
      .maybeSingle();

    if (orderError || !order) {
      console.error("[line-auth-start] Order ownership check failed:", orderError);
      return new Response(JSON.stringify({ error: "找不到屬於您的訂單" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const state = await createLineOAuthState(lineChannelSecret, authUser.id, order.id);
    const authorizeUrl =
      `https://access.line.me/oauth2/v2.1/authorize` +
      `?response_type=code` +
      `&client_id=${encodeURIComponent(LINE_CHANNEL_ID)}` +
      `&redirect_uri=${encodeURIComponent(LINE_REDIRECT_URI)}` +
      `&state=${encodeURIComponent(state)}` +
      `&scope=${encodeURIComponent("profile openid")}`;

    return new Response(JSON.stringify({ authorize_url: authorizeUrl }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[line-auth-start] Unexpected error:", error);
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
