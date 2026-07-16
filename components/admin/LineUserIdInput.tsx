"use client";

import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRecentLineUsers } from "@/hooks/use-recent-line-users";
import { Loader2 } from "lucide-react";

type LineUserIdInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** 顯示幾位最近 LINE 用戶 */
  recentLimit?: number;
  className?: string;
  inputClassName?: string;
  /** 輸入框下方額外說明（例如訂單綁定狀態） */
  footer?: ReactNode;
};

function displayLabel(name: string, lineUserId: string): string {
  if (name.trim()) return name.trim();
  return `${lineUserId.slice(0, 8)}…`;
}

export function LineUserIdInput({
  value,
  onChange,
  placeholder = "Uxxxxxxxx...",
  recentLimit = 12,
  className,
  inputClassName,
  footer,
}: LineUserIdInputProps) {
  const { users, loading, error } = useRecentLineUsers(recentLimit);

  return (
    <div className={cn("space-y-2", className)}>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputClassName}
      />
      {footer}
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">最近 LINE 對話（依更新時間，點選帶入 ID）</p>
        {loading ? (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            載入中…
          </p>
        ) : error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : users.length === 0 ? (
          <p className="text-xs text-muted-foreground">尚無 LINE 對話紀錄</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {users.map((u) => {
              const selected = value.trim() === u.line_user_id;
              return (
                <Button
                  key={u.line_user_id}
                  type="button"
                  variant={selected ? "default" : "outline"}
                  size="sm"
                  className="h-7 max-w-[12rem] truncate px-2 text-xs font-normal"
                  title={u.line_user_id}
                  onClick={() => onChange(u.line_user_id)}
                >
                  {displayLabel(u.display_name, u.line_user_id)}
                </Button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
