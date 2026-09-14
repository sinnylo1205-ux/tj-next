import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getCapacityFromName,
  getCapacityFromOption,
  isSyntheticBoxColor,
  resolvePackedCapacity,
} from "./box-capacity.ts";

describe("getCapacityFromName", () => {
  it("parses standard boxed SKU names", () => {
    assert.equal(getCapacityFromName("單入"), 1);
    assert.equal(getCapacityFromName("二入禮盒"), 2);
    assert.equal(getCapacityFromName("四入"), 4);
    assert.equal(getCapacityFromName("六入牛皮"), 6);
  });

  it("parses numeric and extra Chinese names", () => {
    assert.equal(getCapacityFromName("5入"), 5);
    assert.equal(getCapacityFromName("八入"), 8);
  });
});

describe("getCapacityFromOption", () => {
  it("prefers metadata capacity", () => {
    assert.equal(getCapacityFromOption({ capacity: 4, option_name_zh: "單入" }), 4);
  });

  it("falls back to name when metadata is missing", () => {
    assert.equal(getCapacityFromOption({ option_name_zh: "四入" }), 4);
    assert.equal(getCapacityFromOption({ capacity: 0, option_name_zh: "六入" }), 6);
  });
});

describe("resolvePackedCapacity", () => {
  const four = { option_id: 7039, option_name_zh: "四入" };

  it("does not let synthetic color box_capacity=1 override 四入", () => {
    const virtual = {
      option_id: 7039 * 10000,
      option_name_zh: "預設",
      box_capacity: 1,
    };
    assert.equal(isSyntheticBoxColor(virtual, four), true);
    assert.equal(resolvePackedCapacity(four, virtual), 4);
    assert.equal(resolvePackedCapacity(four, virtual) * 3, 12);
  });

  it("uses capacity SKU even when a real color also has box_capacity=1", () => {
    const pink = { option_id: 7056, option_name_zh: "粉色", box_capacity: 1 };
    assert.equal(isSyntheticBoxColor(pink, four), false);
    assert.equal(resolvePackedCapacity(four, pink), 4);
  });

  it("uses capacity metadata when present", () => {
    const six = { option_id: 7041, option_name_zh: "六入", capacity: 6 };
    const pink = { option_id: 7056, option_name_zh: "粉色", box_capacity: 1 };
    assert.equal(resolvePackedCapacity(six, pink), 6);
  });
});
