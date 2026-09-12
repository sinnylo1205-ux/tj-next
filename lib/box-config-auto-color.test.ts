import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isSyntheticVirtualColor,
  makeVirtualColor,
  pickAutoColor,
} from "./box-config-auto-color.ts";

const capacity = {
  option_id: 7038,
  option_name_zh: "四入",
  price_modifier: 40,
  capacity: 4,
  item_image_url: "https://example.com/box.png",
};

const pink = {
  option_id: 7056,
  option_name_zh: "粉色",
  price_modifier: 15,
  box_capacity: 4,
  item_image_url: "https://example.com/pink.png",
  sort_order: 1,
};

const blue = {
  option_id: 7057,
  option_name_zh: "藍色",
  price_modifier: 15,
  box_capacity: 4,
  item_image_url: "https://example.com/blue.png",
  sort_order: 2,
};

describe("pickAutoColor", () => {
  it("does not synthesize a virtual color while the capacity is still missing from the map", () => {
    const empty = new Map();
    assert.equal(pickAutoColor(capacity, empty), null);
  });

  it("auto-selects the only real color after load", () => {
    const map = new Map([[7038, [pink]]]);
    assert.deepEqual(pickAutoColor(capacity, map), pink);
  });

  it("requires a manual choice when multiple colors exist", () => {
    const map = new Map([[7038, [pink, blue]]]);
    assert.equal(pickAutoColor(capacity, map), null);
  });

  it("synthesizes a virtual color only after load confirms there are no colors", () => {
    const map = new Map([[7038, []]]);
    const virtual = pickAutoColor(capacity, map);
    assert.ok(virtual);
    assert.equal(virtual.option_id, 70380000);
    assert.equal(virtual.price_modifier, 40);
    assert.equal(isSyntheticVirtualColor(virtual, capacity), true);
  });
});

describe("makeVirtualColor", () => {
  it("uses a sentinel option_id that calculate-price filters out (>= 100000)", () => {
    const virtual = makeVirtualColor(capacity);
    assert.equal(virtual.option_id, 7038 * 10000);
    assert.ok(virtual.option_id >= 100000);
  });
});
