import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AUTO_CANCEL_ELIGIBLE_ORDER_STATUS,
  AUTO_CANCEL_ELIGIBLE_PAYMENT_STEP,
  buildAutoCancelOrderPatch,
  isStillEligibleForAutoCancel,
} from "../lib/auto-cancel-expired-orders.ts";

describe("isStillEligibleForAutoCancel", () => {
  const base = {
    payment_step: AUTO_CANCEL_ELIGIBLE_PAYMENT_STEP,
    order_status: AUTO_CANCEL_ELIGIBLE_ORDER_STATUS,
    is_manual_order: false,
    auto_cancel_exempt: false,
  };

  it("allows classic unpaid website awaiting_payment orders", () => {
    assert.equal(isStillEligibleForAutoCancel(base), true);
  });

  it("rejects after payment verified (TOCTOU vs ECPay/admin)", () => {
    assert.equal(isStillEligibleForAutoCancel({ ...base, payment_step: "verified" }), false);
    assert.equal(isStillEligibleForAutoCancel({ ...base, payment_step: "submitted" }), false);
  });

  it("rejects force-ship / in-fulfillment unpaid orders", () => {
    assert.equal(isStillEligibleForAutoCancel({ ...base, order_status: "processing" }), false);
    assert.equal(isStillEligibleForAutoCancel({ ...base, order_status: "shipped" }), false);
  });

  it("rejects manual and exempt orders", () => {
    assert.equal(isStillEligibleForAutoCancel({ ...base, is_manual_order: true }), false);
    assert.equal(isStillEligibleForAutoCancel({ ...base, auto_cancel_exempt: true }), false);
  });
});

describe("buildAutoCancelOrderPatch", () => {
  it("only hides and cancels without touching payment_step", () => {
    assert.deepEqual(buildAutoCancelOrderPatch(), {
      is_hide: true,
      order_status: "canceled",
    });
  });
});
