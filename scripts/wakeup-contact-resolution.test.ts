/**
 * Source-guard tests for wakeup contact / customer_key resolution.
 * Run: node --experimental-strip-types --test scripts/wakeup-contact-resolution.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { customerKeyForOrderExact } from "../lib/order-customer-contact.ts";
import {
  mergeWakeupContactsFromOrderAndRollup,
  resolveWakeupChannelFromDraft,
} from "../lib/wakeup-contact.ts";

describe("customerKeyForOrderExact", () => {
  const admins = new Set<string>(["admin-1"]);

  it("matches SQL COALESCE without trim for manual orders", () => {
    assert.equal(
      customerKeyForOrderExact(
        {
          is_manual_order: true,
          is_from_quotation: false,
          user_id: null,
          who_receive: "林小姐 ",
          orderer_name: null,
        },
        admins,
      ),
      "name:林小姐 ",
    );
  });

  it("keeps trailing spaces so padded names do not collide", () => {
    const a = customerKeyForOrderExact(
      {
        is_manual_order: true,
        is_from_quotation: false,
        user_id: null,
        who_receive: "林小姐",
        orderer_name: null,
      },
      admins,
    );
    const b = customerKeyForOrderExact(
      {
        is_manual_order: true,
        is_from_quotation: false,
        user_id: null,
        who_receive: "林小姐 ",
        orderer_name: null,
      },
      admins,
    );
    assert.notEqual(a, b);
  });

  it("uses user: keys for non-admin members", () => {
    assert.equal(
      customerKeyForOrderExact(
        {
          is_manual_order: false,
          is_from_quotation: false,
          user_id: "user-abc",
          who_receive: "X",
          orderer_name: null,
        },
        admins,
      ),
      "user:user-abc",
    );
  });
});

describe("mergeWakeupContactsFromOrderAndRollup", () => {
  it("prefers trigger-order LINE over rollup MAX LINE", () => {
    const contacts = mergeWakeupContactsFromOrderAndRollup({
      orderEmail: null,
      orderLineUserId: "U-order-owner",
      rollupEmail: "other@example.com",
      rollupLineUserId: "U-rollup-max-other-person",
    });
    assert.equal(contacts.line_user_id, "U-order-owner");
    assert.equal(contacts.primary_email, "other@example.com");
  });

  it("falls back to rollup when order has no contact", () => {
    const contacts = mergeWakeupContactsFromOrderAndRollup({
      orderEmail: null,
      orderLineUserId: null,
      rollupEmail: "member@example.com",
      rollupLineUserId: "U-member",
    });
    assert.equal(contacts.line_user_id, "U-member");
    assert.equal(contacts.primary_email, "member@example.com");
    assert.equal(contacts.has_line, true);
    assert.equal(contacts.has_email, true);
  });
});

describe("resolveWakeupChannelFromDraft", () => {
  it("freezes line channel from draft even if email also present", () => {
    const channel = resolveWakeupChannelFromDraft({
      channel: "line",
      line_user_id: "U-frozen",
      email: "later@example.com",
    });
    assert.deepEqual(channel, {
      channel: "line",
      line_user_id: "U-frozen",
      email: "later@example.com",
    });
  });

  it("does not upgrade an email draft to a different LINE", () => {
    const channel = resolveWakeupChannelFromDraft({
      channel: "email",
      line_user_id: "U-should-ignore",
      email: "draft@example.com",
    });
    assert.deepEqual(channel, {
      channel: "email",
      line_user_id: null,
      email: "draft@example.com",
    });
  });

  it("rejects empty / admin LINE drafts", () => {
    assert.equal(
      resolveWakeupChannelFromDraft({
        channel: "line",
        line_user_id: "Ue6499ae132e994266ea500b976a3277c",
        email: null,
      }),
      null,
    );
    assert.equal(
      resolveWakeupChannelFromDraft({
        channel: "line",
        line_user_id: null,
        email: "x@y.com",
      }),
      null,
    );
  });
});
