import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  couponAlreadyUsed,
  isUsedCouponsMonotonicAppend,
  normalizeCouponCode,
  planCouponClaim,
} from "../lib/coupon-claim.ts";

describe("normalizeCouponCode", () => {
  it("trims and uppercases", () => {
    assert.equal(normalizeCouponCode("  tj88888888 "), "TJ88888888");
  });

  it("rejects empty / non-string", () => {
    assert.equal(normalizeCouponCode(""), null);
    assert.equal(normalizeCouponCode("   "), null);
    assert.equal(normalizeCouponCode(null), null);
    assert.equal(normalizeCouponCode(1), null);
  });
});

describe("couponAlreadyUsed", () => {
  it("matches case-insensitively against used list", () => {
    assert.equal(couponAlreadyUsed("tj88888888", ["TJ88888888"]), true);
    assert.equal(couponAlreadyUsed("TJ9992011", ["TJ88888888"]), false);
    assert.equal(couponAlreadyUsed("TJ88888888", null), false);
  });
});

describe("planCouponClaim", () => {
  it("returns none when no applied coupon", () => {
    assert.deepEqual(
      planCouponClaim({ appliedCouponCode: null, claimCoupon: true, usedCoupons: [] }),
      { action: "none" },
    );
  });

  it("rejects already-used coupons on preview", () => {
    assert.deepEqual(
      planCouponClaim({
        appliedCouponCode: "TJ88888888",
        claimCoupon: false,
        usedCoupons: ["TJ88888888"],
      }),
      { action: "reject_used", code: "TJ88888888" },
    );
  });

  it("allows preview when unused", () => {
    assert.deepEqual(
      planCouponClaim({
        appliedCouponCode: "TJ8582011",
        claimCoupon: false,
        usedCoupons: [],
      }),
      { action: "preview_ok", code: "TJ8582011" },
    );
  });

  it("plans atomic claim on submit even if pre-read list looks unused", () => {
    assert.deepEqual(
      planCouponClaim({
        appliedCouponCode: "TJNOSHIP2011",
        claimCoupon: true,
        usedCoupons: [],
      }),
      { action: "claim", code: "TJNOSHIP2011" },
    );
  });

  it("still plans claim on submit when list already contains code (RPC is authority)", () => {
    assert.deepEqual(
      planCouponClaim({
        appliedCouponCode: "TJ88888888",
        claimCoupon: true,
        usedCoupons: ["TJ88888888"],
      }),
      { action: "claim", code: "TJ88888888" },
    );
  });
});

describe("isUsedCouponsMonotonicAppend", () => {
  it("allows append and no-op growth from empty", () => {
    assert.equal(isUsedCouponsMonotonicAppend([], ["TJ88888888"]), true);
    assert.equal(isUsedCouponsMonotonicAppend(["A"], ["A", "B"]), true);
    assert.equal(isUsedCouponsMonotonicAppend(["A"], ["A"]), true);
  });

  it("rejects clear / shrink / replace-away", () => {
    assert.equal(isUsedCouponsMonotonicAppend(["TJ88888888"], []), false);
    assert.equal(isUsedCouponsMonotonicAppend(["A", "B"], ["A"]), false);
    assert.equal(isUsedCouponsMonotonicAppend(["TJ88888888"], ["OTHER"]), false);
  });
});
