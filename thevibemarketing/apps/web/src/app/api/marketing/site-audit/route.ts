import { runSiteScorecard } from "@vibe/engine";
import { NextResponse } from "next/server";
import { getMarketingStore } from "@/lib/marketing-store";
import { normalizeHttpUrl } from "@/lib/url";
import { withMarketingStore } from "@/lib/with-marketing";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Evidence-based site health check, not official Chrome Lighthouse.
 * POST { url? } — defaults to brand.url
 */
export async function POST(req: Request) {
  return withMarketingStore(async () => {
    let body: { url?: string } = {};
    try {
      body = (await req.json()) as { url?: string };
    } catch {
      body = {};
    }

    const store = getMarketingStore();
    const brand = await store.getBrand();
    const raw =
      normalizeHttpUrl(String(body.url || "")) ||
      brand?.url ||
      "";
    if (!raw) {
      return NextResponse.json(
        { error: "url required (or complete onboarding first)" },
        { status: 400 },
      );
    }

    const scorecard = await runSiteScorecard(raw);
    if (!scorecard.ok) {
      const status =
        scorecard.error_code === "INVALID_URL" ||
        scorecard.error_code === "UNSAFE_URL"
          ? 400
          : 502;
      return NextResponse.json(
        {
          error:
            scorecard.error ||
            "Live site audit could not fetch the target URL. No score was produced.",
        },
        { status },
      );
    }
    return NextResponse.json({
      ok: true,
      scorecard,
      brand: brand ? { name: brand.name, url: brand.url } : null,
    });
  });
}

export async function GET(req: Request) {
  return withMarketingStore(async () => {
    const url = new URL(req.url).searchParams.get("url");
    const store = getMarketingStore();
    const brand = await store.getBrand();
    const raw = normalizeHttpUrl(String(url || "")) || brand?.url || "";
    if (!raw) {
      return NextResponse.json(
        { error: "url query or brand required" },
        { status: 400 },
      );
    }
    const scorecard = await runSiteScorecard(raw);
    if (!scorecard.ok) {
      const status =
        scorecard.error_code === "INVALID_URL" ||
        scorecard.error_code === "UNSAFE_URL"
          ? 400
          : 502;
      return NextResponse.json(
        { error: scorecard.error || "Live site audit could not fetch the target URL." },
        { status },
      );
    }
    return NextResponse.json({ ok: true, scorecard });
  });
}
