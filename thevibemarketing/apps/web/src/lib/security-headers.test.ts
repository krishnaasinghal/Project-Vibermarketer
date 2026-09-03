import assert from "node:assert/strict";
import { SECURITY_HEADERS } from "./security-headers";

const headers = new Map(
  SECURITY_HEADERS.map(({ key, value }) => [key.toLowerCase(), value]),
);

assert.equal(headers.size, SECURITY_HEADERS.length, "security header keys must be unique");
assert.equal(headers.get("x-frame-options"), "DENY");
assert.equal(headers.get("x-content-type-options"), "nosniff");
assert.equal(headers.get("referrer-policy"), "strict-origin-when-cross-origin");
assert.match(headers.get("permissions-policy") ?? "", /camera=\(\)/);
assert.match(headers.get("permissions-policy") ?? "", /microphone=\(\)/);
assert.match(headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
assert.match(headers.get("content-security-policy") ?? "", /object-src 'none'/);
assert.match(headers.get("content-security-policy") ?? "", /base-uri 'self'/);

console.log("security-headers.test: ok");
