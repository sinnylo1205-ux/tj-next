import assert from "node:assert/strict";
import test from "node:test";
import {
  autoCancelCreatedBeforeIso,
  isEligibleForUserAutoCancel,
  isEligibleForUserPaymentSubmitted,
} from "../lib/order-status-eligibility.ts";

const basePending = {
  order_status: "awaiting_payment",
  payment_step: "pending",
  is_manual_order: false,
  auto_cancel_exempt: false,
  created_at: "2026-07-01T00:00:00.000Z",
};

test("auto-cancel allows expired unpaid awaiting website orders", () => {
  assert.equal(
    isEligibleForUserAutoCancel(basePending, "canceled", Date.parse("2026-07-03T00:00:00.000Z")),
    true,
  );
});

test("auto-cancel rejects paid or in-fulfillment orders", () => {
  assert.equal(
    isEligibleForUserAutoCancel(
      { ...basePending, payment_step: "verified", order_status: "processing" },
      "canceled",
      Date.parse("2026-07-03T00:00:00.000Z"),
    ),
    false,
  );
  assert.equal(
    isEligibleForUserAutoCancel(
      { ...basePending, order_status: "processing" },
      "canceled",
      Date.parse("2026-07-03T00:00:00.000Z"),
    ),
    false,
  );
});

test("auto-cancel rejects fresh, manual, or exempt orders", () => {
  assert.equal(
    isEligibleForUserAutoCancel(basePending, "canceled", Date.parse("2026-07-01T12:00:00.000Z")),
    false,
  );
  assert.equal(
    isEligibleForUserAutoCancel(
      { ...basePending, is_manual_order: true },
      "canceled",
      Date.parse("2026-07-03T00:00:00.000Z"),
    ),
    false,
  );
  assert.equal(
    isEligibleForUserAutoCancel(
      { ...basePending, auto_cancel_exempt: true },
      "canceled",
      Date.parse("2026-07-03T00:00:00.000Z"),
    ),
    false,
  );
});

test("payment submitted only from pending awaiting_payment", () => {
  assert.equal(isEligibleForUserPaymentSubmitted(basePending, "awaiting_payment"), true);
  assert.equal(
    isEligibleForUserPaymentSubmitted(
      { ...basePending, payment_step: "verified" },
      "awaiting_payment",
    ),
    false,
  );
  assert.equal(
    isEligibleForUserPaymentSubmitted(
      { ...basePending, order_status: "processing" },
      "awaiting_payment",
    ),
    false,
  );
});

test("autoCancelCreatedBeforeIso is 24h earlier", () => {
  const now = Date.parse("2026-07-30T12:00:00.000Z");
  assert.equal(autoCancelCreatedBeforeIso(now), "2026-07-29T12:00:00.000Z");
});
