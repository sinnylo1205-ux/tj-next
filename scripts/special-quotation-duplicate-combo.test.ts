/**
 * Locks the critical path: duplicate valid UUID combos[].id must not silently
 * collapse into one order (wrong pickup / missing split).
 *
 * Run: node --experimental-strip-types --test scripts/special-quotation-duplicate-combo.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

function readRepo(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

describe("source guards: duplicate combo id cannot silently collapse", () => {
  it("validateSpecialQuotationRoot rejects duplicate combos[].id", () => {
    const src = readRepo("../lib/special-quotation.ts");
    const start = src.indexOf("export function validateSpecialQuotationRoot");
    assert.ok(start >= 0);
    const fn = src.slice(start, start + 1200);
    assert.match(fn, /seenComboIds\.has\(comboId\)/);
    assert.match(fn, /訂單組合 id 重複/);
  });

  it("AI normalize drops duplicate valid UUID combo rows without idMap remap", () => {
    const src = readRepo("../lib/quotation-draft-ai.ts");
    assert.match(src, /seenComboIds\.has\(id\)/);
    assert.match(src, /也不可寫入 idMap/);
    const dupBlockStart = src.indexOf("else if (seenComboIds.has(id))");
    assert.ok(dupBlockStart >= 0);
    const dupBlock = src.slice(dupBlockStart, dupBlockStart + 800);
    assert.doesNotMatch(dupBlock, /idMap\.set\(/);
    assert.match(dupBlock, /return null;/);
  });

  it("commit validates special quotation before insert", () => {
    const src = readRepo("../lib/quotation-draft-commit.ts");
    assert.match(src, /validateSpecialQuotationRoot\(root, byComboId\)/);
    assert.match(src, /特殊報價：寫入前攔截重複 combo id/);
  });

  it("process-quotation rejects duplicate combo meta instead of Map overwrite", () => {
    const src = readRepo("../supabase/functions/process-quotation/index.ts");
    assert.match(src, /seenComboMetaIds\.has\(cid\)/);
    assert.match(src, /特殊報價訂單組合 id 重複/);
    const start = src.indexOf("seenComboMetaIds");
    assert.ok(start >= 0);
    const block = src.slice(start, start + 900);
    assert.match(block, /status:\s*400/);
  });
});
