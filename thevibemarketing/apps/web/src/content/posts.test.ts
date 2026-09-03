/**
 * Spec: blog index only lists public posts; archive posts stay routable.
 * Run: pnpm --filter web test:content
 */
import { getPost, postsSorted } from "./posts";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

const listed = postsSorted();
assert(
  listed.every((p) => p.listed !== false),
  "postsSorted() must hide listed:false archives",
);

const archive = getPost("vc-brain-in-18-hours");
assert(archive, "archive slug still resolvable by getPost");
assert(
  archive!.listed === false,
  "vc-brain-in-18-hours should be archive (unlisted)",
);
assert(
  !listed.some((p) => p.slug === "vc-brain-in-18-hours"),
  "archive must not appear in default postsSorted()",
);

const archAll = postsSorted({ includeUnlisted: true });
assert(
  archAll.some((p) => p.slug === "vc-brain-in-18-hours"),
  "includeUnlisted still returns archives",
);

const architecture = getPost("architecture-one-engine-two-heads");
assert(architecture, "architecture post exists");
const body = JSON.stringify(architecture!.blocks ?? architecture!.body);
assert(
  !body.includes("Challenge 02 judges"),
  "architecture post must not lead with Challenge 02 judge copy",
);
assert(
  listed.some((p) => p.slug === "architecture-one-engine-two-heads"),
  "architecture remains listed",
);

console.log("posts.test: ok");
