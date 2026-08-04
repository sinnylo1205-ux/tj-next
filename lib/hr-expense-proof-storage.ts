/**
 * HR expense proof files must not live in the public `custom_asset` bucket.
 * Public bucket GETs bypass storage RLS, so permanent public URLs leak receipts.
 */

export const HR_EXPENSE_PROOF_BUCKET = "hr_expense_proofs";
/** Legacy uploads (pre-fix) under the public website bucket */
export const HR_EXPENSE_PROOF_LEGACY_BUCKET = "custom_asset";
export const HR_EXPENSE_PROOF_PATH_PREFIX = "hr-expenses/";
export const HR_EXPENSE_PROOF_SIGNED_URL_SECONDS = 5 * 60;

export type HrExpenseProofRef = {
  bucket: string;
  path: string;
};

/** Build a storage object key: hr-expenses/{yyyy-MM}/{employeeId}/{unique}{ext} */
export function buildHrExpenseProofObjectPath(input: {
  yearMonth: string;
  employeeId: string;
  uniqueSuffix: string;
  fileName: string;
}): string {
  const yearMonth = input.yearMonth.trim();
  const employeeId = input.employeeId.trim();
  const uniqueSuffix = input.uniqueSuffix.trim();
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    throw new Error("invalid yearMonth");
  }
  if (!employeeId || employeeId.includes("/") || employeeId.includes("..")) {
    throw new Error("invalid employeeId");
  }
  if (!uniqueSuffix || uniqueSuffix.includes("/") || uniqueSuffix.includes("..")) {
    throw new Error("invalid uniqueSuffix");
  }

  const extMatch = input.fileName.match(/(\.[a-zA-Z0-9]{1,8})$/);
  const ext = extMatch ? extMatch[1].toLowerCase() : "";
  return `${HR_EXPENSE_PROOF_PATH_PREFIX}${yearMonth}/${employeeId}/${uniqueSuffix}${ext}`;
}

export function parseLegacyPublicHrExpenseProofUrl(
  proofUrl: string | null | undefined,
): HrExpenseProofRef | null {
  const raw = (proofUrl ?? "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    const marker = `/storage/v1/object/public/${HR_EXPENSE_PROOF_LEGACY_BUCKET}/`;
    const idx = parsed.pathname.indexOf(marker);
    if (idx < 0) return null;
    const objectPath = decodeURIComponent(parsed.pathname.slice(idx + marker.length));
    if (
      !objectPath ||
      objectPath.includes("..") ||
      !objectPath.startsWith(HR_EXPENSE_PROOF_PATH_PREFIX)
    ) {
      return null;
    }
    return { bucket: HR_EXPENSE_PROOF_LEGACY_BUCKET, path: objectPath };
  } catch {
    return null;
  }
}

function pushUnique(refs: HrExpenseProofRef[], next: HrExpenseProofRef) {
  if (refs.some((r) => r.bucket === next.bucket && r.path === next.path)) return;
  refs.push(next);
}

/**
 * Ordered bucket+path candidates for download/delete.
 * New rows: private bucket only (proof_url left null).
 * Legacy rows: public custom_asset path/URL first, then private in case migrated.
 */
export function resolveHrExpenseProofRefCandidates(input: {
  proofPath: string | null | undefined;
  proofUrl: string | null | undefined;
}): HrExpenseProofRef[] {
  const refs: HrExpenseProofRef[] = [];
  const path = (input.proofPath ?? "").trim().replace(/^\/+/, "");
  const legacyFromUrl = parseLegacyPublicHrExpenseProofUrl(input.proofUrl);

  if (path && !path.includes("..") && path.startsWith(HR_EXPENSE_PROOF_PATH_PREFIX)) {
    if (legacyFromUrl) {
      pushUnique(refs, { bucket: HR_EXPENSE_PROOF_LEGACY_BUCKET, path });
      pushUnique(refs, { bucket: HR_EXPENSE_PROOF_BUCKET, path });
    } else {
      pushUnique(refs, { bucket: HR_EXPENSE_PROOF_BUCKET, path });
      pushUnique(refs, { bucket: HR_EXPENSE_PROOF_LEGACY_BUCKET, path });
    }
  }

  if (legacyFromUrl) pushUnique(refs, legacyFromUrl);
  return refs;
}

export function resolveHrExpenseProofRef(input: {
  proofPath: string | null | undefined;
  proofUrl: string | null | undefined;
}): HrExpenseProofRef | null {
  return resolveHrExpenseProofRefCandidates(input)[0] ?? null;
}

/**
 * Value safe to put in payroll Excel exports — never a permanent public URL.
 * Prefer bucket/path; blank when neither path nor usable legacy URL exists.
 */
export function hrExpenseProofExportLabel(input: {
  proofPath: string | null | undefined;
  proofUrl: string | null | undefined;
}): string | null {
  const ref = resolveHrExpenseProofRef(input);
  if (ref) return `${ref.bucket}/${ref.path}`;
  const url = (input.proofUrl ?? "").trim();
  // Do not re-export public custom_asset HR URLs (they are the leak vector).
  if (parseLegacyPublicHrExpenseProofUrl(url)) return null;
  return url || null;
}
