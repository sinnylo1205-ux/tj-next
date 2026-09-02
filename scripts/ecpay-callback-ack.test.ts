/**
 * Locks ECPay paid-notify ACK: DB failures must not return 1|OK (Green World
 * would stop retrying and the customer stays charged with an unpaid order).
 *
 * Run: node --experimental-strip-types --test scripts/ecpay-callback-ack.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ecpayNotifyAckForOrderLookup,
  ecpayNotifyAckForPaidUpdate,
} from "../lib/ecpay-callback-ack.ts";

function readRepo(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

describe("ecpay notify ACK policy", () => {
  it("retries when order lookup fails for a reason other than missing row", () => {
    assert.equal(
      ecpayNotifyAckForOrderLookup({ code: "PGRST301", message: "JWT expired" }, null),
      "0|Error",
    );
    assert.equal(
      ecpayNotifyAckForOrderLookup({ message: "TypeError: fetch failed" }, null),
      "0|Error",
    );
  });

  it("does not retry forever for a genuinely missing order", () => {
    assert.equal(ecpayNotifyAckForOrderLookup({ code: "PGRST116" }, null), "1|OK");
    assert.equal(
      ecpayNotifyAckForOrderLookup({ message: "JSON object requested, 0 rows returned" }, null),
      "1|OK",
    );
    assert.equal(ecpayNotifyAckForOrderLookup(null, null), "1|OK");
  });

  it("continues when the order row was loaded", () => {
    assert.equal(ecpayNotifyAckForOrderLookup(null, { id: "order-1" }), "continue");
  });

  it("retries when marking the order paid fails, and continues when it succeeds", () => {
    assert.equal(ecpayNotifyAckForPaidUpdate({ message: "connection reset" }), "0|Error");
    assert.equal(ecpayNotifyAckForPaidUpdate(null), "continue");
  });
});

describe("source guards: ecpay-payment-callback must not ACK a failed paid write", () => {
  const src = readRepo("../supabase/functions/ecpay-payment-callback/index.ts");

  it("returns 0|Error (retry) on paid-status update failure instead of falling through", () => {
    const start = src.indexOf("if (updateError)");
    assert.ok(start >= 0, "updateError branch missing");
    const block = src.slice(start, start + 350);
    assert.match(block, /更新訂單狀態失敗/);
    assert.match(block, /return ecpayRetryResponse\(\)/);
    assert.doesNotMatch(block, /1\|OK/);
  });

  it("does not fire fulfillment webhooks before a successful paid update", () => {
    const updateErr = src.indexOf("if (updateError)");
    const retryReturn = src.indexOf("return ecpayRetryResponse()", updateErr);
    const webhook = src.indexOf("N8N_WEBHOOK_URL", updateErr);
    assert.ok(updateErr >= 0 && retryReturn >= 0 && webhook >= 0);
    assert.ok(
      retryReturn < webhook,
      "retry return must precede n8n/calendar/tax side effects",
    );
  });

  it("retries order lookup when PostgREST returns a non-missing-row error", () => {
    const start = src.indexOf("if (!order)");
    assert.ok(start >= 0);
    const block = src.slice(start, start + 700);
    assert.match(block, /isPostgrestMissingRow\(findError\)/);
    assert.match(block, /return ecpayRetryResponse\(\)/);
    assert.match(block, /找不到訂單/);
  });

  it("still ACKs amount mismatch and already-verified so ECPay does not retry those", () => {
    const mismatchStart = src.indexOf("TradeAmt mismatch");
    assert.ok(mismatchStart >= 0);
    const mismatchBlock = src.slice(mismatchStart, mismatchStart + 900);
    assert.match(mismatchBlock, /return new Response\("1\|OK"/);

    const verifiedStart = src.indexOf('order.payment_step === "verified"');
    assert.ok(verifiedStart >= 0);
    const verifiedBlock = src.slice(verifiedStart, verifiedStart + 350);
    assert.match(verifiedBlock, /return new Response\("1\|OK"/);
  });
});
