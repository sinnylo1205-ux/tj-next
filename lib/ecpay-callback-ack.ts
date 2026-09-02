/**
 * Green World (ECPay) AIO server-to-server notify ACK.
 * `1|OK` = accepted, do not retry. Any other body (commonly `0|Error`) = please retry.
 *
 * Only retry when this callback has not yet persisted the paid state.
 * Business rejections (unknown order, amount mismatch) must stay `1|OK`.
 */

export type EcpayNotifyAck = "1|OK" | "0|Error";
export type EcpayNotifyDecision = EcpayNotifyAck | "continue";
export type PostgrestLikeError = { code?: string; message?: string } | null | undefined;

export function isPostgrestMissingRow(error: PostgrestLikeError): boolean {
  if (!error) return true;
  if (error.code === "PGRST116") return true;
  return /0 rows/i.test(error.message ?? "");
}

export function ecpayNotifyAckForOrderLookup(
  error: PostgrestLikeError,
  order: unknown,
): EcpayNotifyDecision {
  if (order) return "continue";
  return isPostgrestMissingRow(error) ? "1|OK" : "0|Error";
}

export function ecpayNotifyAckForPaidUpdate(updateError: unknown): EcpayNotifyDecision {
  return updateError ? "0|Error" : "continue";
}
