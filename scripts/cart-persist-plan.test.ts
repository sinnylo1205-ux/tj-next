import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { planCartPersist } from "../lib/cart-persist-plan.ts";

describe("planCartPersist", () => {
  it("does not soft-delete peer rows missing from a stale tab snapshot", () => {
    const plan = planCartPersist([{ id: "A" }, { id: "B" }], [{ id: "A" }]);
    assert.deepEqual(plan.updateIds, ["A"]);
    assert.deepEqual(plan.insertIds, []);
    assert.deepEqual(plan.softDeleteIds, []);
  });

  it("does not wipe a newly inserted row when in-memory ids are still temp", () => {
    const plan = planCartPersist([{ id: "A" }, { id: "B-real" }], [{ id: "A" }, { id: "B-temp" }]);
    assert.deepEqual(plan.updateIds, ["A"]);
    assert.deepEqual(plan.insertIds, ["B-temp"]);
    assert.deepEqual(plan.softDeleteIds, []);
  });

  it("updates owned rows and inserts only unseen ids", () => {
    const plan = planCartPersist([{ id: "A" }], [{ id: "A" }, { id: "C-temp" }]);
    assert.deepEqual(plan.updateIds, ["A"]);
    assert.deepEqual(plan.insertIds, ["C-temp"]);
    assert.deepEqual(plan.softDeleteIds, []);
  });

  it("inserts every row when the db snapshot is empty", () => {
    const plan = planCartPersist([], [{ id: "temp-1" }, { id: "temp-2" }]);
    assert.deepEqual(plan.updateIds, []);
    assert.deepEqual(plan.insertIds, ["temp-1", "temp-2"]);
    assert.deepEqual(plan.softDeleteIds, []);
  });
});
