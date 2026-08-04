import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HR_EXPENSE_PROOF_BUCKET,
  HR_EXPENSE_PROOF_LEGACY_BUCKET,
  buildHrExpenseProofObjectPath,
  hrExpenseProofExportLabel,
  parseLegacyPublicHrExpenseProofUrl,
  resolveHrExpenseProofRef,
  resolveHrExpenseProofRefCandidates,
} from "../lib/hr-expense-proof-storage";

describe("buildHrExpenseProofObjectPath", () => {
  it("builds ascii-safe paths with extension", () => {
    assert.equal(
      buildHrExpenseProofObjectPath({
        yearMonth: "2026-08",
        employeeId: "betty",
        uniqueSuffix: "1700000000000-abcd1234",
        fileName: "收據.PDF",
      }),
      "hr-expenses/2026-08/betty/1700000000000-abcd1234.pdf",
    );
  });

  it("rejects path traversal in employeeId", () => {
    assert.throws(() =>
      buildHrExpenseProofObjectPath({
        yearMonth: "2026-08",
        employeeId: "../betty",
        uniqueSuffix: "x",
        fileName: "a.png",
      }),
    );
  });

  it("rejects invalid yearMonth", () => {
    assert.throws(() =>
      buildHrExpenseProofObjectPath({
        yearMonth: "2026/08",
        employeeId: "betty",
        uniqueSuffix: "x",
        fileName: "a.png",
      }),
    );
  });
});

describe("resolveHrExpenseProofRefCandidates", () => {
  it("prefers private bucket for new path-only rows", () => {
    assert.deepEqual(
      resolveHrExpenseProofRefCandidates({
        proofPath: "hr-expenses/2026-08/betty/1-aaaaaaaa.png",
        proofUrl: null,
      }),
      [
        {
          bucket: HR_EXPENSE_PROOF_BUCKET,
          path: "hr-expenses/2026-08/betty/1-aaaaaaaa.png",
        },
        {
          bucket: HR_EXPENSE_PROOF_LEGACY_BUCKET,
          path: "hr-expenses/2026-08/betty/1-aaaaaaaa.png",
        },
      ],
    );
  });

  it("prefers legacy public bucket when proof_url is a custom_asset public URL", () => {
    const path = "hr-expenses/2026-07/xinyi/2-bbbbbbbb.pdf";
    const url = `https://example.supabase.co/storage/v1/object/public/custom_asset/${path}`;
    assert.deepEqual(resolveHrExpenseProofRef({ proofPath: path, proofUrl: url }), {
      bucket: HR_EXPENSE_PROOF_LEGACY_BUCKET,
      path,
    });
  });

  it("parses legacy URL when proof_path is missing", () => {
    const path = "hr-expenses/2026-07/betty/3-cccccccc.jpg";
    const url = `https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/${path}`;
    assert.deepEqual(parseLegacyPublicHrExpenseProofUrl(url), {
      bucket: HR_EXPENSE_PROOF_LEGACY_BUCKET,
      path,
    });
  });

  it("rejects non-hr public URLs", () => {
    assert.equal(
      parseLegacyPublicHrExpenseProofUrl(
        "https://example.supabase.co/storage/v1/object/public/custom_asset/website_img/logo.png",
      ),
      null,
    );
  });
});

describe("hrExpenseProofExportLabel", () => {
  it("exports bucket/path instead of permanent public URL", () => {
    const path = "hr-expenses/2026-07/betty/4-dddddddd.pdf";
    const url = `https://example.supabase.co/storage/v1/object/public/custom_asset/${path}`;
    assert.equal(
      hrExpenseProofExportLabel({ proofPath: path, proofUrl: url }),
      `${HR_EXPENSE_PROOF_LEGACY_BUCKET}/${path}`,
    );
  });

  it("does not re-export a bare public custom_asset HR URL without path", () => {
    const url =
      "https://example.supabase.co/storage/v1/object/public/custom_asset/hr-expenses/2026-07/betty/5-eeeeeeee.pdf";
    // Path is recovered from URL, so label becomes bucket/path (not the http URL).
    assert.equal(
      hrExpenseProofExportLabel({ proofPath: null, proofUrl: url }),
      `${HR_EXPENSE_PROOF_LEGACY_BUCKET}/hr-expenses/2026-07/betty/5-eeeeeeee.pdf`,
    );
  });
});
