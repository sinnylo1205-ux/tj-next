/**
 * 定時清理 customizer_uploads bucket — 刪除建立超過 60 天的檔案
 * - 由 pg_cron 透過 pg_net 觸發，需傳入 x-cron-secret 與 CRON_SECRET 一致
 * - 使用 Storage API 列出與刪除，不直接操作 storage.objects
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const BUCKET = "customizer_uploads";
const DAYS_OLD = 60;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = Deno.env.get("CRON_SECRET");
  if (!expectedSecret || cronSecret !== expectedSecret) {
    console.error("[cleanup-customizer-uploads] Invalid or missing x-cron-secret");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const cutoff = new Date(Date.now() - DAYS_OLD * 24 * 60 * 60 * 1000);

  async function listOldFiles(path: string): Promise<string[]> {
    const toDelete: string[] = [];
    const { data: items, error } = await supabase.storage.from(BUCKET).list(path, { limit: 1000 });
    if (error) {
      console.error("[cleanup-customizer-uploads] list error:", path, error);
      return toDelete;
    }
    if (!items?.length) return toDelete;

    for (const item of items) {
      const fullPath = path ? `${path}/${item.name}` : item.name;
      if (item.created_at) {
        const createdAt = new Date(item.created_at);
        if (createdAt < cutoff) toDelete.push(fullPath);
      }
      // 若 list(fullPath) 有回傳內容則視為資料夾，遞迴
      const { data: children } = await supabase.storage.from(BUCKET).list(fullPath);
      if (children?.length) {
        const nested = await listOldFiles(fullPath);
        toDelete.push(...nested);
      }
    }
    return toDelete;
  }

  try {
    const pathsToDelete = await listOldFiles("");
    if (pathsToDelete.length === 0) {
      return new Response(
        JSON.stringify({ success: true, deleted: 0, message: "No files older than 60 days" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const BATCH = 100;
    let deleted = 0;
    for (let i = 0; i < pathsToDelete.length; i += BATCH) {
      const batch = pathsToDelete.slice(i, i + BATCH);
      const { error } = await supabase.storage.from(BUCKET).remove(batch);
      if (error) {
        console.error("[cleanup-customizer-uploads] remove error:", error);
      } else {
        deleted += batch.length;
      }
    }

    console.log("[cleanup-customizer-uploads] Deleted", deleted, "files");
    return new Response(
      JSON.stringify({ success: true, deleted, total: pathsToDelete.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[cleanup-customizer-uploads] Error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
