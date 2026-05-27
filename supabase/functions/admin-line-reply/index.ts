/**
 * 管理員手動回覆 LINE 客戶 — 經 n8n webhook 推送訊息
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.22.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const N8N_WEBHOOK_URL = "https://tjcookies.app.n8n.cloud/webhook/admin-reply";

const AdminLineReplySchema = z.object({
  line_user_id: z.string().min(1, "缺少 line_user_id"),
  message_text: z.string().min(1, "訊息不可為空").max(5000, "訊息過長"),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
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
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleData, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (roleError || !roleData) {
      return new Response(JSON.stringify({ error: "Forbidden - Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawData = await req.json();
    const parseResult = AdminLineReplySchema.safeParse(rawData);
    if (!parseResult.success) {
      return new Response(
        JSON.stringify({ error: "參數驗證失敗", details: parseResult.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { line_user_id, message_text } = parseResult.data;

    const { data: chatRow } = await supabaseAdmin
      .from("chat_state")
      .select("display_name, reply_mode")
      .eq("line_user_id", line_user_id)
      .maybeSingle();

    const payload = {
      line_user_id,
      status_message: message_text,
      action_type: "admin_reply",
      user_name: chatRow?.display_name || "顧客",
      reply_mode: chatRow?.reply_mode || "human",
      notification_channel: "line",
      // 兼容 n8n 直接呼叫 LINE Push API 的欄位
      to: line_user_id,
      messages: [
        {
          type: "text",
          text: message_text,
        },
      ],
    };

    const n8nPayload = {
      source: "admin",
      event_type: "admin_reply",
      ref_id: line_user_id,
      payload,
      ...payload,
    };

    console.log("[admin-line-reply] Sending n8n webhook for:", line_user_id);

    const n8nResponse = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(n8nPayload),
    });

    const responseStatus = n8nResponse.status;
    if (!n8nResponse.ok) {
      const body = await n8nResponse.text().catch(() => "");
      console.error("[admin-line-reply] n8n failed:", responseStatus, body);
      return new Response(
        JSON.stringify({ error: "LINE 推送失敗", status: responseStatus, body: body.slice(0, 500) }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const receivedAt = new Date().toISOString();
    const { data: logRow, error: logError } = await supabaseAdmin
      .from("line_log")
      .insert({
        user_id: line_user_id,
        admin_reply: message_text,
        received_at: receivedAt,
        message_type: "text",
        status: "admin_sent",
        event_id: `admin-reply-${crypto.randomUUID()}`,
      })
      .select("id")
      .single();

    if (logError) {
      console.error("[admin-line-reply] line_log insert failed:", logError);
      return new Response(
        JSON.stringify({
          success: true,
          line_user_id,
          n8n_status: responseStatus,
          warning: "LINE 已送出，但寫入 line_log 失敗",
          log_error: logError.message,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, line_user_id, n8n_status: responseStatus, line_log_id: logRow?.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[admin-line-reply] Unexpected error:", error);
    return new Response(JSON.stringify({ error: "伺服器處理請求時發生錯誤" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
