/**
 * Pure helpers for wakeup send claim / n8n email delivery ack.
 * Kept free of Supabase so unit tests can lock the contract.
 */

export const WAKEUP_SEND_CLAIMABLE_STATUSES = ["pending_review", "approved", "failed"] as const;
export const WAKEUP_SEND_IN_FLIGHT_STATUS = "sending" as const;
/** Stale sending rows may be reclaimed after this window (crash mid-send). */
export const WAKEUP_SEND_CLAIM_STALE_MS = 5 * 60 * 1000;

export function wakeupSendClaimStaleBefore(now = Date.now()): string {
  return new Date(now - WAKEUP_SEND_CLAIM_STALE_MS).toISOString();
}

/** Escape plain text before embedding into HTML email bodies. */
export function escapeHtmlForEmail(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type WakeupEmailN8nAck =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Interpret crm-wakeup-email webhook response.
 * Requires an explicit delivery ack (`ok: true`) so `onReceived` empty 200
 * or Normalize `skip: true` cannot mark drafts as sent.
 */
export function interpretWakeupEmailN8nResponse(params: {
  httpStatus: number;
  bodyText: string;
}): WakeupEmailN8nAck {
  const { httpStatus, bodyText } = params;
  const trimmed = bodyText.trim();

  if (!trimmed) {
    if (httpStatus >= 200 && httpStatus < 300) {
      return {
        ok: false,
        error:
          "Email webhook 未回傳發送確認（可能仍使用 onReceived）。請重新匯入 n8n-crm-wakeup-email 工作流",
      };
    }
    return { ok: false, error: `Email 發送失敗 (${httpStatus})` };
  }

  let json: { ok?: unknown; skip?: unknown; reason?: unknown; error?: unknown } = {};
  try {
    json = JSON.parse(trimmed) as typeof json;
  } catch {
    return {
      ok: false,
      error: `Email webhook 回應不是 JSON (${httpStatus}): ${trimmed.slice(0, 200)}`,
    };
  }

  if (json.skip === true || json.ok === false) {
    const reason =
      (typeof json.reason === "string" && json.reason) ||
      (typeof json.error === "string" && json.error) ||
      "skipped";
    return { ok: false, error: `Email 未送出：${reason}` };
  }

  if (httpStatus < 200 || httpStatus >= 300) {
    const detail =
      (typeof json.error === "string" && json.error) ||
      (typeof json.reason === "string" && json.reason) ||
      trimmed.slice(0, 200);
    return { ok: false, error: `Email 發送失敗 (${httpStatus}): ${detail}` };
  }

  if (json.ok !== true) {
    return {
      ok: false,
      error: "Email webhook 缺少 ok:true 發送確認，拒絕標記為已送出",
    };
  }

  return { ok: true };
}
