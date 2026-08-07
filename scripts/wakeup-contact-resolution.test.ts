/**
 * Source-guard tests for wakeup contact / customer_key resolution.
 * Run: node --experimental-strip-types --test scripts/wakeup-contact-resolution.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

function readRepo(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

describe("wakeup-draft-cron config", () => {
  it("disables gateway JWT verify so pg_cron x-cron-secret can reach the function", () => {
    const toml = readRepo("../supabase/config.toml");
    assert.match(
      toml,
      /\[functions\.wakeup-draft-cron\]\s*\nverify_jwt\s*=\s*false/,
    );
  });
});

describe("wakeup contact helpers", () => {
  it("customerKeyForWakeupOrder documents no-trim SQL parity", () => {
    const src = readRepo("../lib/wakeup-contact.ts");
    assert.match(src, /export function customerKeyForWakeupOrder/);
    assert.match(src, /不做 trim/);
    const start = src.indexOf("export function customerKeyForWakeupOrder");
    const end = src.indexOf("export function mergeWakeupContactsFromOrderAndRollup");
    const fn = src.slice(start, end);
    assert.match(fn, /const name = row\.who_receive \|\| row\.orderer_name \|\| ""/);
    assert.doesNotMatch(fn, /\.trim\(\)/);
  });

  it("mergeWakeupContactsFromOrderAndRollup prefers order LINE/email over rollup", () => {
    const src = readRepo("../lib/wakeup-contact.ts");
    assert.match(src, /export function mergeWakeupContactsFromOrderAndRollup/);
    assert.match(src, /const line_user_id = orderLine \|\| rollupLine/);
    assert.match(src, /const primary_email = orderEmail \|\| rollupEmail/);
  });

  it("resolveWakeupChannelFromDraft freezes draft channel", () => {
    const src = readRepo("../lib/wakeup-contact.ts");
    assert.match(src, /export function resolveWakeupChannelFromDraft/);
    assert.match(src, /draft\.channel === "line" \|\| draft\.channel === "email"/);
  });
});

describe("wakeup creation / send paths", () => {
  it("listEligibleRollupCustomers uses exact key + order-first contacts", () => {
    const src = readRepo("../lib/customer-wakeup.ts");
    assert.match(src, /customerKeyForWakeupOrder\(raw,/);
    assert.match(src, /mergeWakeupContactsFromOrderAndRollup\(/);
    assert.doesNotMatch(
      src,
      /const primary_email = rollup\?\.primary_email[\s\S]{0,40}\|\| orderEmail/,
    );
  });

  it("sendWakeupMessage loads frozen contacts from draft id", () => {
    const src = readRepo("../lib/customer-wakeup.ts");
    const fnStart = src.indexOf("export async function sendWakeupMessage");
    assert.ok(fnStart >= 0);
    const fn = src.slice(fnStart, fnStart + 3500);
    assert.match(fn, /contactSourceDraftId/);
    assert.match(fn, /resolveWakeupChannelFromDraft/);
    assert.match(fn, /草稿與客戶不一致/);
    assert.doesNotMatch(fn, /一律以 rollup 為準/);
  });

  it("cron edge function matches SQL keys and prefers order contacts", () => {
    const src = readRepo("../supabase/functions/wakeup-draft-cron/index.ts");
    assert.match(src, /function customerKeyForOrderExact/);
    assert.match(src, /COALESCE 不做 trim/);
    assert.match(src, /customerKeyForOrderExact\(o, adminUserIds\)/);
    assert.match(src, /function mergeContacts/);
    assert.match(src, /const line_user_id = orderLine \|\| rollupLine/);
    assert.doesNotMatch(src, /return `name:\$\{\(o\.who_receive \|\| o\.orderer_name \|\| ""\)\.trim\(\)\}`/);
  });

  it("review route cannot dismiss/edit non-pending drafts and resend freezes contacts", () => {
    const src = readRepo("../app/api/admin/wakeup-review/route.ts");
    assert.match(src, /\.eq\("status", "pending_review"\)/);
    assert.match(src, /contactSourceDraftId/);
    assert.match(src, /僅待審草稿可略過/);
  });
});
