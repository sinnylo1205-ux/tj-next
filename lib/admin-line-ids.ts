/** 管理員 LINE user id（手動／報價單訂單誤填時視同無 LINE） */
export const STATIC_ADMIN_LINE_USER_IDS = [
  "Ue6499ae132e994266ea500b976a3277c",
  "U7fb743a941f0e5574a21b4c5686585e8",
] as const;

const STATIC_ADMIN_LINE_SET = new Set<string>(STATIC_ADMIN_LINE_USER_IDS);

export function isAdminLineUserId(
  lineUserId: string | null | undefined,
  extraAdminIds?: ReadonlySet<string>,
): boolean {
  const id = lineUserId?.trim();
  if (!id) return false;
  if (STATIC_ADMIN_LINE_SET.has(id)) return true;
  return extraAdminIds?.has(id) ?? false;
}

export function mergeAdminLineUserIds(fromDb: Iterable<string>): Set<string> {
  const ids = new Set<string>(STATIC_ADMIN_LINE_USER_IDS);
  for (const raw of fromDb) {
    const id = raw?.trim();
    if (id) ids.add(id);
  }
  return ids;
}
