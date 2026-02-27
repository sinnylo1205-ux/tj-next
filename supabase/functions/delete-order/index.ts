/**
 * ⚠️ 管理員專用 Function — 已停用
 * 此 function 僅供後台管理員隱藏訂單使用，前端用戶流程不依賴。
 * 若需啟用，請移除下方 early return。
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.22.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ========== 已停用：管理員專用 ==========
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _DISABLED_DELETE_ORDER = true;

// ========== Zod Schema 驗證 ==========
const DeleteOrderRequestSchema = z.object({
  order_id: z.string().uuid("訂單 ID 格式錯誤"),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ⚠️ 管理員專用 — 已停用，直接回傳 403
  if (_DISABLED_DELETE_ORDER) {
    return new Response(
      JSON.stringify({ error: "此功能為管理員專用，已停用" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // 1. 驗證身份
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "未授權" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // 用戶客戶端 - 驗證身份
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // 管理員客戶端 - 執行刪除操作
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 2. 驗證用戶
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "用戶驗證失敗" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. 檢查管理員權限
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (roleError || !roleData) {
      return new Response(JSON.stringify({ error: "權限不足，需要管理員權限" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. 輸入驗證
    const rawData = await req.json();
    const parseResult = DeleteOrderRequestSchema.safeParse(rawData);

    if (!parseResult.success) {
      console.error("❌ Validation error:", parseResult.error.flatten());
      return new Response(
        JSON.stringify({ error: "參數驗證失敗", details: parseResult.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { order_id } = parseResult.data;
    console.log(`🙈 開始隱藏訂單: ${order_id}`);

    // 5. 軟刪除：只設 is_hide = true，不刪除任何資料
    const { error: hideError } = await supabaseAdmin
      .from("orders")
      .update({ is_hide: true })
      .eq("id", order_id);

    if (hideError) {
      console.error("隱藏訂單失敗:", hideError);
      return new Response(JSON.stringify({ error: "隱藏訂單失敗" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`✅ 訂單 ${order_id} 已成功隱藏`);

    return new Response(
      JSON.stringify({ success: true, message: "訂單已成功隱藏" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("刪除訂單錯誤:", err);
    return new Response(
      JSON.stringify({ error: "伺服器處理請求時發生錯誤" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
