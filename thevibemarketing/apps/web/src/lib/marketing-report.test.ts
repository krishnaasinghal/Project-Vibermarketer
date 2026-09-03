import assert from "node:assert/strict";
import { isProviderConfirmedPost } from "./marketing-report";

const confirmed = {
  status: "published",
  provider_post_id: "provider-post-123",
  published_at: "2026-07-31T10:00:00.000Z",
};

assert.equal(isProviderConfirmedPost(confirmed), true);
assert.equal(
  isProviderConfirmedPost({ ...confirmed, provider_post_id: null }),
  false,
  "status and timestamp without a provider ID are not published evidence",
);
assert.equal(
  isProviderConfirmedPost({ ...confirmed, provider_post_id: "   " }),
  false,
  "whitespace is not a provider ID",
);
assert.equal(
  isProviderConfirmedPost({ ...confirmed, published_at: null }),
  false,
  "provider ID without a publish timestamp is incomplete evidence",
);
assert.equal(
  isProviderConfirmedPost({ ...confirmed, published_at: "not-a-date" }),
  false,
  "invalid publish timestamps are rejected",
);
assert.equal(
  isProviderConfirmedPost({ ...confirmed, status: "queued" }),
  false,
  "queued rows never count as provider-confirmed",
);

console.log("marketing-report.test: ok");
