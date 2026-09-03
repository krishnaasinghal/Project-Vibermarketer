/**
 * Pure-ish scorecard self-check (uses public vibemarketer.fun if network allows).
 */
import { runSiteScorecard } from "./site-scorecard";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

// Invalid URL
const bad = await runSiteScorecard("not a url !!!");
assert(!bad.ok, "invalid url fails");
assert(bad.scores.overall === 0, "overall 0 on fail");
assert(bad.error_code === "INVALID_URL", "malformed URL is rejected before fetch");

for (const unsafeUrl of [
  "http://127.0.0.1",
  "http://2130706433",
  "http://169.254.169.254/latest/meta-data",
  "http://[::1]",
  "https://example.com:8443",
  "https://user:password@example.com",
]) {
  const unsafe = await runSiteScorecard(unsafeUrl);
  assert(!unsafe.ok, `${unsafeUrl} must fail`);
  assert(unsafe.scores.overall === 0, `${unsafeUrl} must not produce a score`);
  assert(unsafe.error_code === "UNSAFE_URL", `${unsafeUrl} must be classified unsafe`);
}

// Local heuristic path: HTTPS scorecard structure
const sample = await runSiteScorecard("https://example.com");
assert(typeof sample.scores.overall === "number", "overall number");
assert(sample.lighthouse_style.note.includes("Heuristic"), "honest lighthouse label");
assert(Array.isArray(sample.checks), "checks array");
assert(sample.scores.seo >= 0 && sample.scores.seo <= 100, "seo range");
assert(sample.scores.geo >= 0 && sample.scores.geo <= 100, "geo range");

console.log(
  JSON.stringify(
    {
      example_ok: sample.ok,
      overall: sample.scores.overall,
      seo: sample.scores.seo,
      geo: sample.scores.geo,
      lighthouse_style: sample.lighthouse_style,
      recs: sample.recommendations.slice(0, 3),
    },
    null,
    2,
  ),
);
console.log("OK — site-scorecard self-check passed");
