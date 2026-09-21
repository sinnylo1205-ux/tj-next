/**
 * Admin「未匯款，先出貨」：進入履約（processing）且豁免 24h 未付款自動取消。
 * payment_step 刻意維持不變（通常仍為 pending）。
 */
export function buildForceProcessingOrderPatch(): {
  order_status: "processing";
  auto_cancel_exempt: true;
} {
  return {
    order_status: "processing",
    auto_cancel_exempt: true,
  };
}
