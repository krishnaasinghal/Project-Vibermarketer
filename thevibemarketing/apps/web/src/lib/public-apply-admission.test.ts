import assert from "node:assert/strict";
import {
  checkPublicApplyAdmission,
  PUBLIC_APPLY_LIMIT,
  PUBLIC_APPLY_WINDOW_MS,
} from "./public-apply-admission";

const firstIp = new Headers({ "x-forwarded-for": "203.0.113.10, 10.0.0.1" });
for (let request = 0; request < PUBLIC_APPLY_LIMIT; request += 1) {
  assert.deepEqual(checkPublicApplyAdmission(firstIp), { ok: true });
}

const blocked = checkPublicApplyAdmission(firstIp);
assert.equal(blocked.ok, false);
if (!blocked.ok) {
  assert.ok(blocked.retryAfterSec > 0);
  assert.ok(blocked.retryAfterSec <= PUBLIC_APPLY_WINDOW_MS / 1000);
}

assert.deepEqual(
  checkPublicApplyAdmission(new Headers({ "x-real-ip": "203.0.113.11" })),
  { ok: true },
  "a different client receives an independent bucket",
);

console.log("public-apply-admission.test: ok");
