import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeAppPath,
  withResumeAiRender,
  resolveAuthNextPath,
  buildAuthCallbackUrl,
} from "../lib/pending-ai-render.ts";

describe("sanitizeAppPath blocks open redirects", () => {
  it("documents Next.js resolving backslash login redirects off-site", () => {
    const decoded = new URLSearchParams("redirect=/%5C//evil.com").get("redirect");
    assert.equal(decoded, "/\\//evil.com");
    assert.equal(new URL(decoded!, "https://shop.example/login").origin, "https://evil.com");
  });

  it("allows normal in-app paths", () => {
    assert.equal(sanitizeAppPath("/customize/cupcake_cream"), "/customize/cupcake_cream");
    assert.equal(
      sanitizeAppPath("/customize/cookie?foo=1#bar"),
      "/customize/cookie?foo=1#bar",
    );
    assert.equal(sanitizeAppPath("/"), "/");
  });

  it("rejects protocol-relative and scheme URLs", () => {
    assert.equal(sanitizeAppPath("//evil.com"), null);
    assert.equal(sanitizeAppPath("https://evil.com"), null);
    assert.equal(sanitizeAppPath("/https://evil.com"), null);
  });

  it("rejects backslash host confusion used after login redirect", () => {
    const decoded = new URLSearchParams("redirect=/%5C//evil.com").get("redirect");
    assert.equal(decoded, "/\\//evil.com");
    assert.equal(sanitizeAppPath(decoded), null);
    assert.equal(sanitizeAppPath("/\\//evil.com"), null);
    assert.equal(sanitizeAppPath("/\\n//evil.com"), null);
    assert.equal(sanitizeAppPath("/\\evil.com"), null);
  });

  it("rejects control characters", () => {
    assert.equal(sanitizeAppPath("/\n//evil.com"), null);
    assert.equal(sanitizeAppPath("/\t//evil.com"), null);
    assert.equal(sanitizeAppPath("/\r//evil.com"), null);
  });
});

describe("withResumeAiRender never emits protocol-relative URLs", () => {
  it("keeps a safe customizer path", () => {
    const out = withResumeAiRender("/customize/macaron");
    assert.equal(out, "/customize/macaron?resumeAiRender=1");
    assert.ok(out.startsWith("/") && !out.startsWith("//"));
  });

  it("does not turn backslash paths into //evil.com", () => {
    const out = withResumeAiRender("/\\n//evil.com");
    assert.ok(out.startsWith("/") && !out.startsWith("//"));
    assert.equal(new URL(out, "https://shop.example").origin, "https://shop.example");
  });
});

describe("resolveAuthNextPath", () => {
  it("drops a malicious login redirect query", () => {
    const decoded = new URLSearchParams("redirect=/%5C//evil.com").get("redirect");
    assert.equal(resolveAuthNextPath(decoded), "/");
  });

  it("keeps a legitimate redirect", () => {
    assert.equal(resolveAuthNextPath("/cart"), "/cart");
  });
});

describe("buildAuthCallbackUrl", () => {
  it("does not embed an off-site next", () => {
    const url = buildAuthCallbackUrl("/\\//evil.com");
    const parsed = new URL(url, "https://placeholder.local");
    assert.equal(parsed.searchParams.get("next"), "/");
  });
});
