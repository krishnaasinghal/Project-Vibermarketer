import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import {
  MarketingStore,
  MarketingStoreError,
  type PostStatus,
  canTransitionPostStatus,
} from "./marketing-store";

const rootTmp = join(process.cwd(), "tmp", "marketing-lifecycle-tests");
process.env.MARKETING_STORE_BACKEND = "local";

function assertStoreCode(error: unknown, code: MarketingStoreError["code"]) {
  if (!(error instanceof MarketingStoreError)) {
    throw error;
  }
  assert.equal(error.code, code);
}

async function assertRejectsCode<T>(fn: () => Promise<T>, code: MarketingStoreError["code"]) {
  await assert.rejects(
    fn,
    (error: unknown) => {
      assertStoreCode(error, code);
      return true;
    },
  );
}

const statusChecks: Array<[PostStatus, PostStatus, boolean]> = [
  ["pending", "queued", true],
  ["pending", "rejected", true],
  ["pending", "pending", true],
  ["queued", "pending", true],
  ["rejected", "pending", true],
  ["published", "pending", false],
  ["published", "queued", false],
  ["published", "rejected", false],
  ["published", "published", true],
];

for (const [from, to, expected] of statusChecks) {
  assert.equal(canTransitionPostStatus(from, to), expected);
}

async function runLifecycleTests() {
  try {
    await mkdir(rootTmp, { recursive: true });
    const path = join(rootTmp, `${randomUUID()}.json`);
    const pendingSeed = new MarketingStore(path, "owner");

    const pending = await pendingSeed.upsertPost({
      platform: "x",
      body: "Original draft",
      title: "Draft title",
      status: "pending",
      autonomy: "L1",
      rationale: "seed",
    });

    const edited = await pendingSeed.updatePendingPostContent(pending.id, {
      title: "Edited",
      body: "Edited draft",
    });
    assert.equal(edited.title, "Edited");
    assert.equal(edited.body, "Edited draft");

    const rejected = await pendingSeed.rejectPost(pending.id, "bad tone");
    assert.ok(rejected);
    assert.equal(rejected.status, "rejected");
    await assertRejectsCode(
      () => pendingSeed.updatePendingPostContent(pending.id, { body: "nope" }),
      "POST_IMMUTABLE",
    );

    const restored = await pendingSeed.restoreRejectedPost(pending.id);
    assert.ok(restored);
    assert.equal(restored.status, "pending");

    const queued = await pendingSeed.queuePost(pending.id, "hitl_approve");
    assert.ok(queued);
    assert.equal(queued.status, "queued");
    await assertRejectsCode(
      () => pendingSeed.updatePendingPostContent(pending.id, { title: "blocked" }),
      "POST_IMMUTABLE",
    );
    const cancelled = await pendingSeed.cancelQueuedPost(pending.id);
    assert.ok(cancelled);
    assert.equal(cancelled.status, "pending");

    const queuedAgain = await pendingSeed.queuePost(pending.id, "hitl_approve");
    assert.ok(queuedAgain);
    assert.equal(queuedAgain.status, "queued");
    const published = await pendingSeed.confirmPublished(pending.id, {
      providerPostId: "1234567890123456789",
      providerUrl: "https://x.com/status/1",
      note: "published by test",
    });
    assert.ok(published);
    assert.equal(published.status, "published");
    assert.equal(published.provider_post_id, "1234567890123456789");
    assert.equal(published.provider_url, "https://x.com/status/1");

    const readBack = await pendingSeed.listPosts("published");
    assert.equal(readBack[0].provider_post_id, "1234567890123456789");
    assert.equal(readBack[0].provider_url, "https://x.com/status/1");

    await assertRejectsCode(
      () =>
        pendingSeed.confirmPublished(pending.id, {
          providerPostId: "",
        }),
      "POST_PROVIDER_ID_REQUIRED",
    );

    const sameReplay = await pendingSeed.confirmPublished(pending.id, {
      providerPostId: "1234567890123456789",
    });
    assert.ok(sameReplay);
    assert.equal(sameReplay.provider_post_id, "1234567890123456789");
    assert.equal(sameReplay.status, "published");

    await assertRejectsCode(
      () =>
        pendingSeed.confirmPublished(pending.id, {
          providerPostId: "different-provider-id",
        }),
      "POST_PROVIDER_CONFLICT",
    );

    await assertRejectsCode(
      () => pendingSeed.updatePendingPostContent(pending.id, { body: "forbidden" }),
      "POST_IMMUTABLE",
    );
    await assertRejectsCode(
      () => pendingSeed.rejectPost(pending.id),
      "INVALID_TRANSITION",
    );
    await assertRejectsCode(
      () => pendingSeed.cancelQueuedPost(pending.id),
      "INVALID_TRANSITION",
    );
    await assertRejectsCode(
      () =>
        pendingSeed.upsertPost({
          id: pending.id,
          platform: "x",
          body: "blocked",
          status: "pending",
          autonomy: "L1",
          rationale: "bad",
        }),
      "POST_IMMUTABLE",
    );
  } finally {
    await rm(rootTmp, { recursive: true, force: true });
  }
}

void runLifecycleTests()
  .then(() => {
    console.log("marketing-store-lifecycle.test: ok");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
