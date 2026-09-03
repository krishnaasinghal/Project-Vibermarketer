import { assertEqual } from "../test/assert";
import {
  extractLinkedInProviderPostId,
  extractRedditProviderPostId,
  extractXProviderPostId,
} from "./composio";

function main() {
  const validX = { data: { id: "1234567890123456789" }, status: "ok" };
  assertEqual(extractXProviderPostId(validX), "1234567890123456789", "extract valid X id");
  assertEqual(extractXProviderPostId({ data: { id: "1234" } }), null, "reject short X id");
  assertEqual(
    extractXProviderPostId({ data: { id: "twitter_1234567890" } }),
    null,
    "reject synthetic X id",
  );
  assertEqual(
    extractXProviderPostId({ id: "1234567890123456789" }),
    null,
    "reject top-level request-like X id",
  );
  assertEqual(
    extractXProviderPostId({ request: { id: "1234567890123456789" } }),
    null,
    "reject nested generic request X id",
  );

  assertEqual(
    extractLinkedInProviderPostId({ data: { id: "urn:li:share:abc123" } }),
    "urn:li:share:abc123",
    "extract LinkedIn URN",
  );
  assertEqual(
    extractLinkedInProviderPostId({ data: { post_id: "12345678901" } }),
    "12345678901",
    "extract LinkedIn numeric id",
  );
  assertEqual(
    extractLinkedInProviderPostId({ data: { id: "bad-id" } }),
    null,
    "reject bad LinkedIn id",
  );
  assertEqual(
    extractLinkedInProviderPostId({ account: { id: "urn:li:share:abc123" } }),
    null,
    "reject nested generic account LinkedIn id",
  );

  const redditPermalinkUrl = "https://www.reddit.com/r/test/comments/a1b2c3d4/e2e-journey/";
  assertEqual(
    extractRedditProviderPostId({ data: { permalink: redditPermalinkUrl } }),
    "a1b2c3d4",
    "extract reddit id from comments url",
  );
  assertEqual(
    extractRedditProviderPostId({ data: { name: "t3_abcd12" } }),
    "t3_abcd12",
    "accept reddit fullname",
  );
  assertEqual(
    extractRedditProviderPostId({ data: { name: "1234" } }),
    null,
    "reject short reddit id",
  );
  assertEqual(
    extractRedditProviderPostId({ data: { id: 123456 } }),
    null,
    "reject non-string reddit ids",
  );
  assertEqual(
    extractRedditProviderPostId({ job: { id: "t3_abcd12" } }),
    null,
    "reject nested generic job reddit id",
  );

  console.log("composio connector id extraction: ok");
}

main();
