"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import {
  fetchRecentLineLogUsers,
  toggleChatStateReplyMode,
  type RecentLineLogUser,
} from "@/lib/recent-line-log-users";

/** 後台全域浮動快捷：最近 LINE 對話用戶，點名稱切換 AI（綠）／真人（紅） */
export function AdminReplyModeFab() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [users, setUsers] = useState<RecentLineLogUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchRecentLineLogUsers(supabase, 24);
      setUsers(rows);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "載入失敗";
      setError(msg);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadUsers();
  }, [open, loadUsers]);

  const handleToggle = async (user: RecentLineLogUser) => {
    if (togglingId) return;
    setTogglingId(user.line_user_id);
    try {
      const nextMode = await toggleChatStateReplyMode(supabase, user.line_user_id, user.reply_mode);
      setUsers((prev) =>
        prev.map((r) => (r.line_user_id === user.line_user_id ? { ...r, reply_mode: nextMode } : r)),
      );
    } catch {
      /* 靜默失敗，不顯示多餘資訊 */
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <>
      {open ? (
        <>
          <button
            type="button"
            aria-label="關閉"
            className="fixed inset-0 z-[58] bg-black/20 md:bg-transparent"
            onClick={() => setOpen(false)}
          />
          <div
            className={cn(
              "fixed z-[59] right-4 w-[min(17rem,calc(100vw-2rem))]",
              "max-h-[min(22rem,45vh)] overflow-y-auto rounded-2xl border border-border bg-white shadow-2xl p-2 space-y-1.5",
              "bottom-[calc(6.75rem+4.25rem)] md:bottom-[calc(1.5rem+4.25rem)]",
            )}
          >
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <p className="text-center text-sm text-muted-foreground py-8">無法載入</p>
            ) : users.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">尚無對話</p>
            ) : (
              users.map((user) => {
                const isAi = user.reply_mode === "ai";
                const busy = togglingId === user.line_user_id;
                return (
                  <button
                    key={user.line_user_id}
                    type="button"
                    disabled={busy}
                    onClick={() => void handleToggle(user)}
                    className={cn(
                      "w-full rounded-xl px-3 py-2.5 text-sm font-medium text-white text-left truncate transition-opacity",
                      isAi ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700",
                      busy && "opacity-60",
                    )}
                  >
                    {busy ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                        {user.display_name}
                      </span>
                    ) : (
                      user.display_name
                    )}
                  </button>
                );
              })
            )}
          </div>
        </>
      ) : null}

      <button
        type="button"
        aria-label="最近 LINE 對話"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "fixed z-[60] right-4 h-14 min-w-14 px-4 rounded-full shadow-lg",
          "bg-green-600 text-white font-semibold text-sm",
          "flex items-center justify-center",
          "hover:bg-green-700 active:scale-95 transition-transform",
          "bottom-[6.75rem] md:bottom-6",
        )}
      >
        Line
      </button>
    </>
  );
}
