import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildEcpayVerifiedOrderPatch,
  evaluateEcpayPaymentClaim,
} from "../lib/ecpay-payment-claim.ts";

describe("evaluateEcpayPaymentClaim", () => {
  it("allows pending awaiting_payment orders", () => {
    assert.deepEqual(
      evaluateEcpayPaymentClaim({
        payment_step: "pending",
        order_status: "awaiting_payment",
        is_hide: false,
      }),
      { action: "claim" },
    );
  });

  it("allows submitted payment_step (bank transfer mid-flight edge)", () => {
    assert.deepEqual(
      evaluateEcpayPaymentClaim({
        payment_step: "submitted",
        order_status: "awaiting_payment",
      }),
      { action: "claim" },
    );
  });

  it("skips already verified orders", () => {
    assert.deepEqual(
      evaluateEcpayPaymentClaim({
        payment_step: "verified",
        order_status: "canceled",
        is_hide: true,
      }),
      { action: "already_verified" },
    );
  });

  it("rejects canceled orders that still have pending payment_step", () => {
    const decision = evaluateEcpayPaymentClaim({
      payment_step: "pending",
      order_status: "canceled",
      is_hide: true,
    });
    assert.equal(decision.action, "ineligible");
    if (decision.action === "ineligible") {
      assert.match(decision.reason, /order_status=canceled/);
    }
  });

  it("rejects soft-hidden orders even if status looks payable", () => {
    const decision = evaluateEcpayPaymentClaim({
      payment_step: "pending",
      order_status: "awaiting_payment",
      is_hide: true,
    });
    assert.equal(decision.action, "ineligible");
    if (decision.action === "ineligible") {
      assert.equal(decision.reason, "is_hide=true");
    }
  });

  it("rejects terminal closed/completed/refunded statuses", () => {
    for (const order_status of ["closed", "completed", "refunded", "cancelled"]) {
      const decision = evaluateEcpayPaymentClaim({
        payment_step: "pending",
        order_status,
      });
      assert.equal(decision.action, "ineligible", order_status);
    }
  });
});

describe("buildEcpayVerifiedOrderPatch", () => {
  it("moves awaiting_payment into processing", () => {
    assert.deepEqual(buildEcpayVerifiedOrderPatch("awaiting_payment", "2026-08-01T11:00:00.000Z"), {
      payment_step: "verified",
      payment_method: "credit_card",
      admin_verified_at: "2026-08-01T11:00:00.000Z",
      order_status: "processing",
    });
  });

  it("preserves processing/shipped/delivered fulfillment status", () => {
    for (const order_status of ["processing", "shipped", "delivered"]) {
      assert.deepEqual(buildEcpayVerifiedOrderPatch(order_status, "2026-08-01T11:00:00.000Z"), {
        payment_step: "verified",
        payment_method: "credit_card",
        admin_verified_at: "2026-08-01T11:00:00.000Z",
      });
    }
  });
});
