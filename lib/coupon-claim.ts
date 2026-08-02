/**
 * Checkout coupon one-time claim helpers.
 * Keep in sync with supabase/functions/_shared/coupon-claim.ts
 */

export function normalizeCouponCode(code: unknown): string | null {
  if (typeof code !== "string") return null;
  const normalized = code.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

export function couponAlreadyUsed(
  code: unknown,
  usedCoupons: unknown,
): boolean {
  const normalized = normalizeCouponCode(code);
  if (!normalized) return false;
  if (!Array.isArray(usedCoupons)) return false;
  return usedCoupons.some(
    (entry) => typeof entry === "string" && entry.trim().toUpperCase() === normalized,
  );
}

export type CouponClaimPlan =
  | { action: "none" }
  | { action: "reject_used"; code: string }
  | { action: "preview_ok"; code: string }
  | { action: "claim"; code: string };

/**
 * Decide whether a successfully applied coupon should be previewed or atomically claimed.
 * `appliedCouponCode` must already be the code that calculate-checkout intends to grant.
 */
export function planCouponClaim(args: {
  appliedCouponCode: unknown;
  claimCoupon: boolean;
  usedCoupons: unknown;
}): CouponClaimPlan {
  const code = normalizeCouponCode(args.appliedCouponCode);
  if (!code) return { action: "none" };

  if (args.claimCoupon) {
    // Atomic DB claim is the authority; skip the racy pre-read reject path.
    return { action: "claim", code };
  }

  if (couponAlreadyUsed(code, args.usedCoupons)) {
    return { action: "reject_used", code };
  }

  return { action: "preview_ok", code };
}

/** True when NEW used_coupons is a superset of OLD (append-only / no clears). */
export function isUsedCouponsMonotonicAppend(
  previous: unknown,
  next: unknown,
): boolean {
  const prev = Array.isArray(previous)
    ? previous.filter((v): v is string => typeof v === "string").map((v) => v.trim().toUpperCase()).filter(Boolean)
    : [];
  const nxt = Array.isArray(next)
    ? next.filter((v): v is string => typeof v === "string").map((v) => v.trim().toUpperCase()).filter(Boolean)
    : [];

  if (prev.length === 0) return true;
  const nextSet = new Set(nxt);
  return prev.every((code) => nextSet.has(code));
}
