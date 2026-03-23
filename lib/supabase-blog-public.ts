import { createClient } from "@supabase/supabase-js";

/**
 * 部落格等「必須即時反映 DB」的公開頁專用。
 * Next.js 可能快取對 Supabase REST 的 fetch，導致 is_published 更新後仍看到舊內容；
 * 此 client 強制 cache: 'no-store'。
 */
export function createSupabasePublicUncached() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            cache: "no-store",
          }),
      },
    },
  );
}
