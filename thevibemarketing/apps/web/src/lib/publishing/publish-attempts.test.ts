import assert from "node:assert/strict";

import {
  buildContentRevisionKey,
  buildPublishIdempotencyKey,
  buildPublishRequestHash,
  canTransitionOutboxJob,
  canTransitionPublishAttempt,
  calculateNextRetryAt,
  classifyPublishFailure,
  contentFingerprint,
} from "./publish-attempts";

const seedPost = {
  platform: "x" as const,
  title: "Launch notes",
  body: "  first draft body  ",
  rationale: "core message",
  media_url: "https://example.com/image.png",
};

const revisionA = buildContentRevisionKey(seedPost);
const revisionB = buildContentRevisionKey({
  ...seedPost,
  body: "  first draft body changed  ",
});

assert.equal(revisionA, buildContentRevisionKey(seedPost), "same input keeps same revision key");
assert.notEqual(revisionA, revisionB, "changed body changes revision key");

const idempotencyA = buildPublishIdempotencyKey({
  ownerId: "owner-1",
  postId: "post-1",
  provider: "x",
  providerAccountId: "acct-1",
  contentRevisionKey: revisionA,
});
const idempotencyARepeat = buildPublishIdempotencyKey({
  ownerId: "owner-1",
  postId: "post-1",
  provider: "x",
  providerAccountId: "acct-1",
  contentRevisionKey: revisionA,
});
const idempotencyB = buildPublishIdempotencyKey({
  ownerId: "owner-1",
  postId: "post-1",
  provider: "x",
  providerAccountId: "acct-2",
  contentRevisionKey: revisionA,
});
const idempotencyC = buildPublishIdempotencyKey({
  ownerId: "owner-2",
  postId: "post-1",
  provider: "x",
  providerAccountId: "acct-1",
  contentRevisionKey: revisionA,
});

assert.equal(idempotencyA, idempotencyARepeat, "idempotency key is stable for same logical inputs");
assert.notEqual(idempotencyA, idempotencyB, "provider account changes idempotency key");
assert.notEqual(idempotencyA, idempotencyC, "owner changes idempotency key");

const requestHashA = buildPublishRequestHash({
  post: {
    platform: seedPost.platform,
    title: seedPost.title,
    body: seedPost.body,
    rationale: seedPost.rationale,
    media_url: seedPost.media_url,
  },
  provider: "x",
  providerAccountId: "acct-1",
  contentRevisionKey: revisionA,
});
const requestHashARepeat = buildPublishRequestHash({
  post: {
    platform: seedPost.platform,
    title: seedPost.title,
    body: seedPost.body,
    rationale: seedPost.rationale,
    media_url: seedPost.media_url,
  },
  provider: "x",
  providerAccountId: "acct-1",
  contentRevisionKey: revisionA,
});
const requestHashB = buildPublishRequestHash({
  post: {
    platform: seedPost.platform,
    title: seedPost.title,
    body: "completely changed body",
    rationale: seedPost.rationale,
    media_url: seedPost.media_url,
  },
  provider: "x",
  providerAccountId: "acct-1",
  contentRevisionKey: revisionA,
});

assert.equal(requestHashA, requestHashARepeat, "request hash is deterministic");
assert.notEqual(requestHashA, requestHashB, "changed content changes request hash");
assert.equal(revisionA, buildContentRevisionKey(seedPost), "revision key unchanged by repeated input");

const now = new Date("2026-01-01T00:00:00.000Z");
const retry0 = calculateNextRetryAt(0, now);
const retry1 = calculateNextRetryAt(1, now);
const retry2 = calculateNextRetryAt(2, now);
assert.equal(typeof retry0, "string");
assert.equal(typeof retry1, "string");
assert.equal(typeof retry2, "string");
assert.ok(new Date(retry0).getTime() > now.getTime());
assert.ok(new Date(retry1).getTime() >= new Date(retry0).getTime());
assert.ok(new Date(retry2).getTime() >= new Date(retry1).getTime());

assert.equal(canTransitionPublishAttempt("pending", "executing"), true);
assert.equal(canTransitionPublishAttempt("pending", "outcome_unknown"), true);
assert.equal(canTransitionPublishAttempt("pending", "retryable_failure"), true);
assert.equal(canTransitionPublishAttempt("provider_succeeded", "pending"), false);
assert.equal(canTransitionPublishAttempt("retryable_failure", "published"), true);
assert.equal(canTransitionPublishAttempt("published", "provider_succeeded"), false);
assert.equal(canTransitionPublishAttempt("outcome_unknown", "retryable_failure"), false);
assert.equal(canTransitionPublishAttempt("published", "published"), true);

assert.equal(canTransitionOutboxJob("pending", "leased"), true);
assert.equal(canTransitionOutboxJob("leased", "completed"), true);
assert.equal(canTransitionOutboxJob("completed", "pending"), false);

assert.equal(classifyPublishFailure("request timed out waiting for provider response"), "unknown");
assert.equal(classifyPublishFailure("connection reset while contacting provider"), "retryable");
assert.equal(classifyPublishFailure("account invalid or permissions denied"), "permanent");

assert.equal(contentFingerprint("hello"), contentFingerprint("hello"));
assert.notEqual(contentFingerprint("hello"), contentFingerprint("hello "));

console.log("publish-attempts.test: ok");
