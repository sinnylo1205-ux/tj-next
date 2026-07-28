/**
 * LINE Login OAuth `state` 簽章（與 lib/line-oauth-state.ts 保持同步）。
 */

export const LINE_OAUTH_STATE_TTL_MS = 15 * 60 * 1000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type LineOAuthStatePayload = {
  userId: string;
  orderId: string;
  exp: number;
};

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return toHex(sig);
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function createLineOAuthState(
  secret: string,
  userId: string,
  orderId: string,
  nowMs = Date.now(),
  ttlMs = LINE_OAUTH_STATE_TTL_MS,
): Promise<string> {
  if (!secret) throw new Error("LINE OAuth state secret is required");
  if (!UUID_RE.test(userId) || !UUID_RE.test(orderId)) {
    throw new Error("userId and orderId must be UUIDs");
  }
  const exp = nowMs + ttlMs;
  const body = `${userId}|${orderId}|${exp}`;
  const sig = await hmacHex(secret, body);
  return `${body}|${sig}`;
}

export async function parseAndVerifyLineOAuthState(
  secret: string,
  rawState: string,
  nowMs = Date.now(),
): Promise<LineOAuthStatePayload | null> {
  if (!secret || !rawState) return null;

  let state = rawState;
  try {
    state = decodeURIComponent(rawState);
  } catch {
    // already decoded or malformed — use as-is
  }

  const parts = state.split("|");
  // Legacy unsigned format was userId|orderId (2 parts) — reject.
  if (parts.length !== 4) return null;

  const [userId, orderId, expStr, sig] = parts;
  if (!userId || !orderId || !expStr || !sig) return null;
  if (!/^[0-9a-f]{64}$/i.test(sig)) return null;
  if (!UUID_RE.test(userId) || !UUID_RE.test(orderId)) return null;

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || nowMs > exp) return null;

  const body = `${userId}|${orderId}|${expStr}`;
  const expected = await hmacHex(secret, body);
  if (!timingSafeEqualHex(expected.toLowerCase(), sig.toLowerCase())) return null;

  return { userId, orderId, exp };
}
