/**
 * Locks wakeup send claim / email delivery-ack contracts.
 * Run: node --experimental-strip-types --test scripts/wakeup-send-guards.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  escapeHtmlForEmail,
  interpretWakeupEmailN8nResponse,
  WAKEUP_SEND_CLAIMABLE_STATUSES,
  WAKEUP_SEND_IN_FLIGHT_STATUS,
} from "../lib/wakeup-send-guards.ts";

function readRepo(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

describe("interpretWakeupEmailN8nResponse", () => {
  it("rejects empty 200 (legacy onReceived false-ack)", () => {
    const r = interpretWakeupEmailN8nResponse({ httpStatus: 200, bodyText: "" });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /onReceived|發送確認/);
  });

  it("rejects skip:true even with HTTP 200", () => {
    const r = interpretWakeupEmailN8nResponse({
      httpStatus: 200,
      bodyText: JSON.stringify({ skip: true, reason: "missing email or text" }),
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /missing email/);
  });

  it("requires ok:true for success", () => {
    const bad = interpretWakeupEmailN8nResponse({
      httpStatus: 200,
      bodyText: JSON.stringify({ delivered: true }),
    });
    assert.equal(bad.ok, false);

    const good = interpretWakeupEmailN8nResponse({
      httpStatus: 200,
      bodyText: JSON.stringify({ ok: true, delivered: true }),
    });
    assert.equal(good.ok, true);
  });

  it("surfaces HTTP errors", () => {
    const r = interpretWakeupEmailN8nResponse({
      httpStatus: 400,
      bodyText: JSON.stringify({ ok: false, skip: true, reason: "unauthorized" }),
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /unauthorized/);
  });
});

describe("escapeHtmlForEmail", () => {
  it("escapes markup that would otherwise become HTML in Gmail body", () => {
    assert.equal(
      escapeHtmlForEmail(`Hi <script>alert(1)</script> & "x"`),
      "Hi &lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;",
    );
  });
});

describe("source guards: claim before external send", () => {
  it("exposes sending as in-flight claim status", () => {
    assert.equal(WAKEUP_SEND_IN_FLIGHT_STATUS, "sending");
    assert.deepEqual([...WAKEUP_SEND_CLAIMABLE_STATUSES], ["pending_review", "approved", "failed"]);
  });

  it("sendWakeupMessage claims draft before LINE/email side effects", () => {
    const src = readRepo("../lib/customer-wakeup.ts");
    const claimFnStart = src.indexOf("async function claimWakeupDraftForSend");
    assert.ok(claimFnStart >= 0);
    const claimFn = src.slice(claimFnStart, claimFnStart + 1800);
    assert.match(claimFn, /WAKEUP_SEND_IN_FLIGHT_STATUS/);
    assert.match(claimFn, /WAKEUP_SEND_CLAIMABLE_STATUSES/);
    assert.match(claimFn, /草稿狀態已變更或正在發送中/);

    const fnStart = src.indexOf("export async function sendWakeupMessage");
    assert.ok(fnStart >= 0);
    const fn = src.slice(fnStart, fnStart + 4500);
    const claimAt = fn.indexOf("claimWakeupDraftForSend");
    const lineAt = fn.indexOf("sendLineMessageViaAdminReply");
    const emailAt = fn.indexOf("sendEmailViaN8n");
    assert.ok(claimAt >= 0, "must claim draft");
    assert.ok(lineAt > claimAt, "LINE send must follow claim");
    assert.ok(emailAt > claimAt, "email send must follow claim");
  });

  it("migration allows sending status", () => {
    const sql = readRepo("../supabase/migrations/20260809120000_wakeup_draft_sending_status.sql");
    assert.match(sql, /'sending'/);
    assert.match(sql, /customer_wakeup_drafts_status_check/);
  });

  it("n8n wakeup email uses responseNode and HTML escape", () => {
    const n8n = readRepo("../n8n-crm-wakeup-email.json");
    assert.match(n8n, /"responseMode": "responseNode"/);
    assert.doesNotMatch(n8n, /"responseMode": "onReceived"/);
    assert.match(n8n, /Respond OK/);
    assert.match(n8n, /Respond Skip/);
    assert.match(n8n, /escapeHtml|replace\(\/&\/g/);
    assert.match(n8n, /ok:\s*true/);
  });

  it("detail sheet ignores stale loadDetail responses", () => {
    const src = readRepo("../components/admin/AdminOrderCustomerDetailSheet.tsx");
    assert.match(src, /loadSeqRef/);
    assert.match(src, /activeCustomerKeyRef/);
    assert.match(src, /草稿與目前客戶不一致/);
  });

  it("review route only dismisses pending_review", () => {
    const src = readRepo("../app/api/admin/wakeup-review/route.ts");
    assert.match(src, /僅待審草稿可略過/);
    assert.match(src, /\.eq\("status", "pending_review"\)/);
  });
});
