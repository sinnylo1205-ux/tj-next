import assert from "node:assert/strict";
import test from "node:test";
import {
  createLineOAuthState,
  parseAndVerifyLineOAuthState,
  LINE_OAUTH_STATE_TTL_MS,
} from "../lib/line-oauth-state.ts";

const SECRET = "test-line-channel-secret";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORDER_ID = "22222222-2222-4222-8222-222222222222";
const NOW = 1_700_000_000_000;

test("signed state round-trips", async () => {
  const state = await createLineOAuthState(SECRET, USER_ID, ORDER_ID, NOW);
  const parsed = await parseAndVerifyLineOAuthState(SECRET, state, NOW + 1000);
  assert.deepEqual(parsed, {
    userId: USER_ID,
    orderId: ORDER_ID,
    exp: NOW + LINE_OAUTH_STATE_TTL_MS,
  });
});

test("rejects unsigned legacy userId|orderId state", async () => {
  const legacy = `${USER_ID}|${ORDER_ID}`;
  assert.equal(await parseAndVerifyLineOAuthState(SECRET, legacy, NOW), null);
});

test("rejects tampered order id", async () => {
  const state = await createLineOAuthState(SECRET, USER_ID, ORDER_ID, NOW);
  const parts = state.split("|");
  parts[1] = "33333333-3333-4333-8333-333333333333";
  assert.equal(await parseAndVerifyLineOAuthState(SECRET, parts.join("|"), NOW), null);
});

test("rejects tampered user id (LINE hijack attempt)", async () => {
  const state = await createLineOAuthState(SECRET, USER_ID, ORDER_ID, NOW);
  const parts = state.split("|");
  parts[0] = "44444444-4444-4444-8444-444444444444";
  assert.equal(await parseAndVerifyLineOAuthState(SECRET, parts.join("|"), NOW), null);
});

test("rejects expired state", async () => {
  const state = await createLineOAuthState(SECRET, USER_ID, ORDER_ID, NOW, 1000);
  assert.equal(await parseAndVerifyLineOAuthState(SECRET, state, NOW + 1001), null);
});

test("accepts URI-encoded state", async () => {
  const state = await createLineOAuthState(SECRET, USER_ID, ORDER_ID, NOW);
  const encoded = encodeURIComponent(state);
  const parsed = await parseAndVerifyLineOAuthState(SECRET, encoded, NOW);
  assert.ok(parsed);
  assert.equal(parsed.userId, USER_ID);
  assert.equal(parsed.orderId, ORDER_ID);
});

test("rejects wrong secret", async () => {
  const state = await createLineOAuthState(SECRET, USER_ID, ORDER_ID, NOW);
  assert.equal(await parseAndVerifyLineOAuthState("other-secret", state, NOW), null);
});
