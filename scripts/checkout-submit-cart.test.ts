import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOrderItemInsertFromCartRow,
  cartRowQuantity,
  cartRowUnitPrice,
  matchCheckoutCartRows,
  normalizeSelectedCartIds,
  type CheckoutCartRow,
} from "../lib/checkout-submit-cart";

const row = (id: string, overrides: Partial<CheckoutCartRow> = {}): CheckoutCartRow => ({
  id,
  product_id: "prod-a",
  quantity: 1,
  total_price: 100,
  preview_url: null,
  customizations_json: null,
  is_package_design: false,
  linked_item_id: null,
  expected_pickup_date: null,
  ...overrides,
});

test("normalizeSelectedCartIds dedupes and drops empties", () => {
  assert.deepEqual(
    normalizeSelectedCartIds(["a", " a ", "", "b", "a", null, 1]),
    ["a", "b"],
  );
});

test("matchCheckoutCartRows rejects fabricated extra selected ids", () => {
  const result = matchCheckoutCartRows(
    ["real-1", "fake-extra"],
    [row("real-1")],
  );
  assert.equal(result.ok, false);
});

test("matchCheckoutCartRows rejects missing db rows for selection", () => {
  const result = matchCheckoutCartRows(["real-1", "real-2"], [row("real-1")]);
  assert.equal(result.ok, false);
});

test("matchCheckoutCartRows accepts exact owned selection in selected order", () => {
  const result = matchCheckoutCartRows(
    ["b", "a"],
    [row("a", { total_price: 50 }), row("b", { total_price: 80 })],
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.rows.map((r) => r.id),
    ["b", "a"],
  );
  assert.deepEqual(result.cartItemIds, ["b", "a"]);
});

test("buildOrderItemInsertFromCartRow uses DB quantity and total_price, not client fields", () => {
  const insert = buildOrderItemInsertFromCartRow(
    row("cart-1", {
      product_id: "cookie",
      quantity: 2,
      total_price: 600,
      preview_url: "https://example.com/p.webp",
      customizations_json: [{ group: "口味", option_name_zh: "原味" }],
    }),
    "order-1",
    "手工餅乾",
  );
  assert.equal(insert.order_id, "order-1");
  assert.equal(insert.product_id, "cookie");
  assert.equal(insert.quantity, 2);
  assert.equal(insert.unit_price, 300);
  assert.equal(insert.preview_url, "https://example.com/p.webp");
  assert.deepEqual(insert.customizations_json, [{ group: "口味", option_name_zh: "原味" }]);
});

test("cartRow helpers guard invalid quantity", () => {
  assert.equal(cartRowQuantity(row("x", { quantity: 0 })), 1);
  assert.equal(cartRowQuantity(row("x", { quantity: -3 })), 1);
  assert.equal(cartRowUnitPrice(row("x", { quantity: 0, total_price: 90 })), 90);
});
