import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildForceProcessingOrderPatch } from "../lib/force-processing";

describe("buildForceProcessingOrderPatch", () => {
  it("moves to processing and exempts 24h auto-cancel", () => {
    const patch = buildForceProcessingOrderPatch();
    assert.equal(patch.order_status, "processing");
    assert.equal(patch.auto_cancel_exempt, true);
    assert.deepEqual(Object.keys(patch).sort(), ["auto_cancel_exempt", "order_status"]);
  });
});
