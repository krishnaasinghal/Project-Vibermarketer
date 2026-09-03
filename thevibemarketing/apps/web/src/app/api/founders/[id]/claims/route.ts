import { NextResponse } from "next/server";
import { resolveFounder } from "@/lib/resolve-founder";
import { withOwnedStore } from "@/lib/with-store";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";

/**
 * Attach a traction claim for Diligence / Trust scoring.
 * Body: { text: string, evidence_url?: string, probe?: boolean }
 *
 * probe=true inserts a clearly labeled overstated claim so the Trust
 * contradiction path is demonstrable on any live founder —
 * without fabricating people.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return withOwnedStore(async () => {
    const { id } = await ctx.params;
    const store = getStore();
    const founder = await resolveFounder(store, id);
    if (!founder) {
      return NextResponse.json({ error: "Founder not found" }, { status: 404 });
    }
    const founderId = founder.id;

    let body: {
      text?: string;
      evidence_url?: string;
      probe?: boolean;
    };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const probe = Boolean(body.probe);
    const text = probe
      ? "Diligence probe: we have 50,000 users and $25k MRR"
      : (body.text?.trim() ?? "");

    if (!text) {
      return NextResponse.json(
        { error: "text required (or probe=true)" },
        { status: 400 },
      );
    }

    // Probe needs a public https evidence_url so url_diligence (Firecrawl) runs.
    let evidenceUrl = body.evidence_url?.trim() || undefined;
    if (probe && !evidenceUrl) {
      const signals = await store.getSignalsFor(founderId);
      const ranked = [...signals]
        .map((s) => s.url)
        .filter((u): u is string => Boolean(u && /^https?:\/\//i.test(u)))
        .sort((a, b) => {
          const score = (u: string) =>
            /github\.com/i.test(u) ? 3 : /news\.ycombinator/i.test(u) ? 2 : 1;
          return score(b) - score(a);
        });
      const ghLogin = founder.handles?.github?.replace(/^@/, "");
      evidenceUrl =
        ranked[0] ??
        founder.links?.find((l) => /^https?:\/\//i.test(l)) ??
        (ghLogin ? `https://github.com/${ghLogin}` : undefined) ??
        "https://github.com";
    }

    const claim = {
      text,
      category: "traction" as const,
      evidence_url: evidenceUrl,
      confidence: probe ? 0.4 : 0.55,
      contradiction: false,
    };

    const updated = await store.upsertFounder({
      ...founder,
      claims: [...(founder.claims ?? []), claim],
    });

    const product = await store.getProductForFounder(founderId);
    if (product) {
      await store.upsertProduct({
        ...product,
        traction_claims: [...(product.traction_claims ?? []), claim],
      });
    }

    return NextResponse.json({
      ok: true,
      probe,
      founder: updated,
      note: probe
        ? `Probe claim attached (evidence: ${evidenceUrl}) — run 3-axis screen for Trust contradiction + url_diligence → $100K NO`
        : "Claim attached — run screen to evaluate Trust",
    });
  });
}
