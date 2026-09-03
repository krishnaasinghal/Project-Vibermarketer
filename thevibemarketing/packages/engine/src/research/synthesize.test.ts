/**
 * ML-7: live research must not turn raw hits into heuristic findings when the
 * model is unavailable. Raw evidence can remain in traces, but a synthesis is
 * unavailable until a live provider produces cite-bound output.
 */
import { synthesizeResearch } from "./synthesize";
import { assertEqual } from "../test/assert";
import type { Founder, Product } from "../types";

const founder: Founder = {
  id: "test-founder",
  name: "Example Founder",
  handles: {},
  links: [],
  claims: [],
  founder_score: 0,
  score_confidence: 0,
  gravity: {
    gravity_score: 0,
    confidence: 0,
    components: {
      velocity: 0,
      pull_ratio: 0,
      cadence: 0,
      stars: 0,
      forks: 0,
      hn_points: 0,
      followers: 0,
      engagement: 0,
      post_count: 0,
      shipping_events: 0,
      audience: 0,
      external_engagement: 0,
      own_output: 0,
    },
    evidence: [],
  },
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const product: Product = {
  id: "test-product",
  founder_id: founder.id,
  name: "Example Product",
  oneliner: "A real product",
  sector: "software",
  traction_claims: [],
};

async function main() {
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const result = await synthesizeResearch({
      founder,
      product,
      hits: [
        {
          provider: "tavily",
          query: "Example Product",
          url: "https://example.com",
          title: "Example Product",
          excerpt: "Public source material that must not become a synthetic finding.",
        },
      ],
    });

    assertEqual(result.synthesis, "skipped", "synthesis must be unavailable without OpenAI");
    assertEqual(result.findings.length, 0, "no heuristic findings may be emitted");
    assertEqual(result.open_questions.length > 0, true, "unavailability must be explicit");
    console.log("research-synthesize-failclosed: ok");
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
