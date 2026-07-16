"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchRecentLineUsers, type RecentLineUser } from "@/lib/recent-line-users";

export function useRecentLineUsers(limit = 12, enabled = true) {
  const [users, setUsers] = useState<RecentLineUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchRecentLineUsers(supabase, limit);
      setUsers(rows);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "載入 LINE 用戶失敗";
      setError(msg);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [enabled, limit]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { users, loading, error, reload };
}
