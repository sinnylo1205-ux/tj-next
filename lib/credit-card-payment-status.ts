import { supabase } from "@/lib/supabase";

export const CREDIT_CARD_ORDER_ID_KEY = "last_creditcard_order_id";
export const CREDIT_CARD_STARTED_AT_KEY = "last_creditcard_started_at";

const CREDIT_CARD_PENDING_TTL_MS = 30 * 60 * 1000;
const VERIFIED_ORDER_STATUSES = new Set(["processing", "shipped", "delivered"]);

export type CreditCardReturnSignal = "success" | "failed";

type SearchParamsLike = Pick<URLSearchParams, "get">;

interface PendingCreditCardPayment {
  orderId: string;
  startedAt: number;
  isFresh: boolean;
}

export function getCreditCardReturnSignal(params: SearchParamsLike): CreditCardReturnSignal | null {
  const creditCardPayment = params.get("creditCardPayment");
  if (creditCardPayment === "success" || creditCardPayment === "failed") return creditCardPayment;

  // Backward compatibility for existing ECPay return URLs that still expose RtnCode.
  const rtnCode = params.get("RtnCode");
  if (!rtnCode) return null;
  return rtnCode === "1" ? "success" : "failed";
}

export function savePendingCreditCardPayment(orderId: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CREDIT_CARD_ORDER_ID_KEY, orderId);
    localStorage.setItem(CREDIT_CARD_STARTED_AT_KEY, String(Date.now()));
  } catch {}
}

export function readPendingCreditCardPayment(): PendingCreditCardPayment | null {
  if (typeof window === "undefined") return null;
  try {
    const orderId = localStorage.getItem(CREDIT_CARD_ORDER_ID_KEY);
    const startedAtRaw = localStorage.getItem(CREDIT_CARD_STARTED_AT_KEY);
    const startedAt = startedAtRaw ? Number(startedAtRaw) : NaN;
    if (!orderId || !Number.isFinite(startedAt)) return null;
    return {
      orderId,
      startedAt,
      isFresh: Date.now() - startedAt < CREDIT_CARD_PENDING_TTL_MS,
    };
  } catch {
    return null;
  }
}

export function clearPendingCreditCardPayment() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(CREDIT_CARD_ORDER_ID_KEY);
    localStorage.removeItem(CREDIT_CARD_STARTED_AT_KEY);
  } catch {}
}

export async function isCreditCardOrderVerified(orderId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("orders")
    .select("payment_step, order_status")
    .eq("id", orderId)
    .maybeSingle();

  if (error || !data) return false;
  return data.payment_step === "verified" && VERIFIED_ORDER_STATUSES.has(String(data.order_status ?? ""));
}

export async function waitForCreditCardOrderVerification(
  orderId: string,
  { attempts = 6, delayMs = 1500 }: { attempts?: number; delayMs?: number } = {},
): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await isCreditCardOrderVerified(orderId)) return true;
    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return false;
}
