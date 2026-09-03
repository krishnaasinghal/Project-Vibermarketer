import { NextResponse } from "next/server";
import { resolveFounder } from "@/lib/resolve-founder";
import { withOwnedStore } from "@/lib/with-store";
import { SITE_DOMAIN, SITE_NAME, siteUrl } from "@/lib/site";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";

/**
 * POST /api/activate/[id]
 * body: { action: "draft" | "sent" | "applied", channel?, note? }
 * Outbound Activate → Converge into the same Screening funnel as inbound apply.
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
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const founderId = founder.id;

    let body: {
      action?: "draft" | "sent" | "applied";
      channel?: "email" | "x" | "linkedin";
      note?: string;
    };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "JSON required" }, { status: 400 });
    }

    const product = await store.getProductForFounder(founderId);
    const company = product?.name ?? "your company";
    const now = new Date().toISOString();
    const channel = body.channel ?? "email";
    const applyUrl = siteUrl("/app/apply");

    const subject = `Quick note — ${company} × distribution gravity`;
    const outreachBody = [
      `Hi ${founder.name.split(" ")[0] ?? founder.name},`,
      ``,
      `We've been tracking builders who earn attention before they raise —`,
      `your public footprint on ${company} stood out (distribution gravity, not pedigree).`,
      ``,
      `Would you take 15 minutes to apply for a $100K pre-seed check?`,
      `Deck + company name is enough: ${applyUrl}`,
      ``,
      `— VC Brain · ${SITE_NAME} · ${SITE_DOMAIN}`,
    ].join("\n");

    const action = body.action ?? "draft";
    const prev = founder.activation ?? { status: "none" as const };

    if (action === "draft" || action === "sent") {
      const updated = await store.upsertFounder({
        id: founder.id,
        name: founder.name,
        activation: {
          status: action === "sent" ? "sent" : "drafted",
          channel,
          subject,
          body: outreachBody,
          drafted_at: prev.drafted_at ?? now,
          sent_at: action === "sent" ? now : prev.sent_at,
          note: body.note,
        },
      });
      return NextResponse.json({
        ok: true,
        activation: updated.activation,
        mailto: `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(outreachBody)}`,
        note:
          action === "sent"
            ? "Marked sent — use mailto to send from your client. When they apply, mark applied to converge."
            : "Cold outreach drafted. Goal is a real application, not a cold check.",
      });
    }

    if (action === "applied") {
      // Converge: same funnel as inbound — ensure product exists, tag signal.
      if (!product) {
        await store.upsertProduct({
          id: `p_${founderId}`,
          founder_id: founderId,
          name: company,
          oneliner: founder.bio ?? "Outbound-activated application",
          sector: "developer tools",
          stage: "pre-seed",
          traction_claims: [],
        });
      }
      await store.addSignal({
        entity_type: "founder",
        entity_id: founderId,
        source: "outbound_activate",
        url: "/app/apply",
        payload: { channel, converged: true, funnel: "inbound_screening" },
        observed_at: now,
      });
      const updated = await store.upsertFounder({
        id: founderId,
        name: founder.name,
        activation: {
          ...prev,
          status: "applied",
          channel: prev.channel ?? channel,
          subject: prev.subject ?? subject,
          body: prev.body ?? outreachBody,
          drafted_at: prev.drafted_at ?? now,
          sent_at: prev.sent_at,
          applied_at: now,
          note: body.note ?? "Converged into inbound screening funnel",
        },
      });
      return NextResponse.json({
        ok: true,
        activation: updated.activation,
        founder_id: founderId,
        converged: true,
        funnel: "inbound_screening",
        note: "Converge complete — same Screening funnel as inbound. Run 3-axis screen next.",
      });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  });
}
