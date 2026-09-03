import {
  composeFounderScoreFromGravity,
  evaluateConviction,
  formatFunnelClock,
  hoursInFunnel,
  inferTrackRecord,
  softSkillBands,
  thesisFit,
} from "@vibe/engine";
import { NextResponse } from "next/server";
import { resolveFounder } from "@/lib/resolve-founder";
import { normalizeHttpUrl } from "@/lib/url";
import { withOwnedStore } from "@/lib/with-store";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";

function cleanHandle(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim().replace(/^@/, "");
  return t || undefined;
}

function cleanLinks(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const n = normalizeHttpUrl(item);
    if (n) out.push(n);
  }
  return [...new Set(out)].slice(0, 12);
}

export async function GET(
  _req: Request,
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
    const product = await store.getProductForFounder(founderId);
    const signals = await store.getSignalsFor(founderId);
    const screening = await store.getLatestScreening(founderId);
    const memo = await store.getLatestMemo(founderId);
    const thesis = await store.getThesis();
    const hours = hoursInFunnel(founder.created_at);
    const conviction = evaluateConviction({
      founder,
      product,
      thesis,
      alreadyScreened: Boolean(screening),
    });
    const sourceCount = new Set(signals.map((s) => s.source)).size;
    const trait_bands = softSkillBands({
      gravity: founder.gravity,
      founder_score: founder.founder_score,
      signal_source_count: sourceCount,
    });
    const fit = thesisFit(thesis, product, founder);
    const cold_start = composeFounderScoreFromGravity(founder.gravity, {
      track_record: inferTrackRecord(founder),
      coherence: sourceCount >= 2 ? 70 : 45,
    }).cold_start;
    return NextResponse.json({
      founder,
      product,
      signals,
      screening,
      memo,
      thesis_fit: fit.fit,
      thesis_note: fit.note,
      hours_in_funnel: hours,
      funnel_clock: formatFunnelClock(hours),
      within_24h: hours <= 24,
      conviction,
      trait_bands,
      cold_start,
      canonical_id: founderId,
    });
  });
}

/**
 * PATCH founder + product profile fields that feed deep research / screen.
 * Used by the linear "Save profile → Gather & screen" UX.
 */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return withOwnedStore(async () => {
    const { id } = await ctx.params;
    const store = getStore();
    const existing = await resolveFounder(store, id);
    if (!existing) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const founderId = existing.id;

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
    }

    const name =
      typeof body.name === "string" && body.name.trim()
        ? body.name.trim().slice(0, 120)
        : existing.name;
    const bio =
      typeof body.bio === "string" ? body.bio.trim().slice(0, 2000) : existing.bio;

    const handlesIn =
      body.handles && typeof body.handles === "object"
        ? (body.handles as Record<string, unknown>)
        : {};
    const handles = {
      ...existing.handles,
      github: cleanHandle(handlesIn.github) ?? existing.handles.github,
      twitter: cleanHandle(handlesIn.twitter ?? handlesIn.x) ?? existing.handles.twitter,
      x: cleanHandle(handlesIn.x ?? handlesIn.twitter) ?? existing.handles.x,
      linkedin: cleanHandle(handlesIn.linkedin) ?? existing.handles.linkedin,
      hn: cleanHandle(handlesIn.hn) ?? existing.handles.hn,
      email: cleanHandle(handlesIn.email) ?? existing.handles.email,
    };

    const linksFromBody = cleanLinks(body.links);
    const singleLink =
      typeof body.website === "string"
        ? normalizeHttpUrl(body.website)
        : null;
    const links = linksFromBody?.length
      ? linksFromBody
      : singleLink
        ? [...new Set([...(existing.links ?? []), singleLink])].slice(0, 12)
        : existing.links ?? [];

    const founder = await store.upsertFounder({
      id: founderId,
      name,
      bio: bio || undefined,
      handles,
      links,
    });

    const productExisting = await store.getProductForFounder(founderId);
    const company =
      typeof body.company === "string" && body.company.trim()
        ? body.company.trim().slice(0, 120)
        : productExisting?.name;
    const oneliner =
      typeof body.oneliner === "string"
        ? body.oneliner.trim().slice(0, 400)
        : productExisting?.oneliner;
    const sector =
      typeof body.sector === "string"
        ? body.sector.trim().slice(0, 80)
        : productExisting?.sector;
    const domainRaw =
      typeof body.domain === "string" ? body.domain.trim() : productExisting?.domain;
    let domain = domainRaw;
    if (domain && !domain.includes("://")) {
      domain = domain.replace(/^www\./, "");
    }
    if (singleLink && !domain) {
      try {
        domain = new URL(singleLink).hostname.replace(/^www\./, "");
      } catch {
        /* ignore */
      }
    }

    let product = productExisting;
    if (company || oneliner || sector || domain || productExisting) {
      product = await store.upsertProduct({
        id: productExisting?.id ?? `p_${founderId}`,
        founder_id: founderId,
        name: company || productExisting?.name || name,
        domain: domain || undefined,
        oneliner: oneliner || undefined,
        sector: sector || productExisting?.sector || "developer tools",
        stage: productExisting?.stage || "pre-seed",
        traction_claims: productExisting?.traction_claims ?? [],
      });
    }

    // Persist website as a signal so deep research / gravity can cite it.
    if (singleLink) {
      await store.addSignal({
        entity_type: "founder",
        entity_id: founderId,
        source: "profile",
        url: singleLink,
        payload: { kind: "website", via: "profile_patch" },
        observed_at: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      ok: true,
      founder,
      product,
      note: "Profile saved to Memory — run Gather & screen to enrich from public web.",
    });
  });
}
