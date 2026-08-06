import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

describe("CRM company clear preserves wakeup_opt_out", () => {
  it("patch helper only nulls company_name", () => {
    const path = fileURLToPath(new URL("../lib/crm-company-name-patch.ts", import.meta.url));
    const src = readFileSync(path, "utf8");
    const returnBlock = src.match(/return \{[\s\S]*?\};/);
    assert.ok(returnBlock, "expected return object");
    assert.match(returnBlock[0], /company_name:\s*null/);
    assert.doesNotMatch(returnBlock[0], /wakeup_opt_out/);
    assert.match(src, /不可 DELETE 整列/);
  });

  it("upsertCustomerCompanyName clear path UPDATEs via helper and never DELETEs", () => {
    const path = fileURLToPath(new URL("../lib/order-customer-contact.ts", import.meta.url));
    const src = readFileSync(path, "utf8");
    const clearBlock = src.match(/if \(!trimmed\) \{[\s\S]*?\n  \}/);
    assert.ok(clearBlock, "expected clear-company branch");
    assert.match(clearBlock[0], /buildClearCustomerCompanyNamePatch/);
    assert.match(clearBlock[0], /\.update\(/);
    assert.doesNotMatch(
      clearBlock[0],
      /\.delete\(/,
      "clearing company_name must not DELETE order_customer_crm (would wipe wakeup_opt_out)",
    );
  });
});
