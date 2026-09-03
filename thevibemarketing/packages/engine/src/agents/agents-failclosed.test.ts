/**
 * Spec: marketing agents must fail closed when OPENAI is unavailable.
 * No template / offline slop drafts may be returned as successful product output.
 *
 * Run: pnpm --filter @vibe/engine test:agents
 */
import { runHnAgent } from "./hn-agent";
import { runRedditAgent } from "./reddit-agent";
import { runSeoAgent } from "./seo-agent";
import { assert, assertEqual } from "../test/assert";

const brand = {
  name: "vibemarketer",
  oneliner: "Cursor for marketing",
  icp: "SaaS founders",
  tone: "direct",
  pillars: ["HITL", "brand memory"],
  url: "https://www.vibemarketer.fun",
};

const brandInput = {
  name: brand.name,
  oneliner: brand.oneliner,
  icp: brand.icp,
  tone: brand.tone,
  pillars: brand.pillars,
  url: brand.url,
};

async function main() {
  const prev = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  try {
    const reddit = await runRedditAgent({
      brand: brandInput,
      ownerId: "test-owner",
      limit: 2,
    });
    assertEqual(reddit.ok, false, "reddit agent ok=false without OpenAI");
    assertEqual(
      reddit.opportunities.length,
      0,
      "reddit must not enqueue template opportunities",
    );
    assert(
      Boolean(reddit.error?.includes("OPENAI") || reddit.error),
      "reddit should surface actionable error",
    );

    const hn = await runHnAgent({
      brand: brandInput,
      ownerId: "test-owner",
      limit: 2,
    });
    assertEqual(hn.ok, false, "hn agent ok=false without OpenAI");
    assertEqual(
      hn.opportunities.length,
      0,
      "hn must not enqueue template comments",
    );
    assert(Boolean(hn.error), "hn should surface error");

    const seo = await runSeoAgent({
      brand: brandInput,
      ownerId: "test-owner",
    });
    assertEqual(seo.ok, false, "seo agent ok=false without OpenAI");
    assertEqual(seo.draft, null, "seo must not return offline template draft");
    assert(Boolean(seo.error), "seo should surface error");

    console.log("agents-failclosed: ok");
  } finally {
    if (prev !== undefined) process.env.OPENAI_API_KEY = prev;
    else delete process.env.OPENAI_API_KEY;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
