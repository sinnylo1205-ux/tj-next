import { isAdminLineUserId } from "@/lib/admin-line-ids";

export type WakeupChannel = "line" | "email";

/**
 * 觸發訂單自己的聯絡優先於 rollup 聚合。
 * rollup 對 name: 鍵使用 MAX(line/email)，同名手動單會把別人的 LINE 掛上來。
 */
export function mergeWakeupContactsFromOrderAndRollup(params: {
  orderEmail?: string | null;
  orderLineUserId?: string | null;
  rollupEmail?: string | null;
  rollupLineUserId?: string | null;
}): {
  primary_email: string | null;
  line_user_id: string | null;
  has_line: boolean;
  has_email: boolean;
} {
  const orderLine = params.orderLineUserId?.trim() || null;
  const orderEmail = params.orderEmail?.trim() || null;
  const rollupLine = params.rollupLineUserId?.trim() || null;
  const rollupEmail = params.rollupEmail?.trim() || null;
  const line_user_id = orderLine || rollupLine;
  const primary_email = orderEmail || rollupEmail;
  return {
    line_user_id,
    primary_email,
    has_line: Boolean(line_user_id),
    has_email: Boolean(primary_email),
  };
}

/** 使用草稿凍結的 channel／聯絡，避免核准發送時被 rollup MAX 改寄給別人 */
export function resolveWakeupChannelFromDraft(draft: {
  channel?: string | null;
  line_user_id?: string | null;
  email?: string | null;
}): { channel: WakeupChannel; line_user_id: string | null; email: string | null } | null {
  const channel = draft.channel === "line" || draft.channel === "email" ? draft.channel : null;
  if (!channel) return null;
  if (channel === "line") {
    const line = draft.line_user_id?.trim() || null;
    if (!line || isAdminLineUserId(line)) return null;
    return { channel: "line", line_user_id: line, email: draft.email?.trim() || null };
  }
  const email = draft.email?.trim() || null;
  if (!email) return null;
  return { channel: "email", line_user_id: null, email };
}
