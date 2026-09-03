import { createHash, randomUUID } from "node:crypto";
import {
  coherenceFromSignals,
  composeFounderScoreFromGravity,
  enrichFromProfile,
  firstPassScreen,
  inferTrackRecord,
  scoreGravityFromSignals,
} from "@vibe/engine";
import { NextResponse } from "next/server";
import {
  MAX_DECK_UPLOAD_BYTES,
  assertPdfMagic,
  preflightRemoteDeck,
} from "@/lib/deck-guards";
import { checkPublicApplyAdmission } from "@/lib/public-apply-admission";
import { getStore } from "@/lib/store";
import { getSupabaseAdmin, hasSupabaseAdmin } from "@/lib/supabase-admin";
import { normalizeHttpUrl } from "@/lib/url";
import { getWorkspaceOwnerId } from "@/lib/workspace-context";
import { withOptionalStore } from "@/lib/with-store";

export const runtime = "nodejs";
/** Enrichment (GitHub/Tavily) may run after apply for cold-start gravity. */
export const maxDuration = 90;

type ParsedApply = {
  company_name?: string;
  deck_url?: string;
  oneliner?: string;
  founder_name?: string;
  sector?: string;
  github?: string;
  x_handle?: string;
  linkedin?: string;
  deck_file_name?: string;
  deck_bytes?: number;
  deck_sha256?: string;
  deck_storage_path?: string;
  deck_buf?: Buffer;
};

function cleanPublicHandle(raw?: string): string | undefined {
  const t = (raw ?? "").trim().replace(/^@/, "");
  if (!t) return undefined;
  if (/github\.com/i.test(t)) {
    try {
      const u = new URL(t.startsWith("http") ? t : `https://${t}`);
      const part = u.pathname.split("/").filter(Boolean)[0];
      return part || undefined;
    } catch {
      return t;
    }
  }
  return t.replace(/^https?:\/\//i, "").split("/")[0] || t;
}

async function parseBody(req: Request): Promise<ParsedApply> {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const company_name = String(form.get("company_name") || "").trim();
    const deck_url =
      normalizeHttpUrl(String(form.get("deck_url") || "")) || undefined;
    const oneliner = String(form.get("oneliner") || "").trim() || undefined;
    const founder_name =
      String(form.get("founder_name") || "").trim() || undefined;
    const sector = String(form.get("sector") || "").trim() || undefined;
    const github = String(form.get("github") || "").trim() || undefined;
    const x_handle = String(form.get("x_handle") || "").trim() || undefined;
    const linkedin = String(form.get("linkedin") || "").trim() || undefined;

    // When a deck URL is present, ignore local file (avoids Vercel 413 + FS writes).
    if (deck_url) {
      return {
        company_name,
        deck_url,
        oneliner,
        founder_name,
        sector,
        github,
        x_handle,
        linkedin,
      };
    }

    let deck_file_name: string | undefined;
    let deck_bytes: number | undefined;
    let deck_sha256: string | undefined;
    let deck_buf: Buffer | undefined;
    const file = form.get("deck_file");
    if (file && typeof file === "object" && "arrayBuffer" in file) {
      const f = file as File;
      if (f.size > 0) {
        if (f.size > MAX_DECK_UPLOAD_BYTES) {
          throw new Error(
            `Deck file must be under ${MAX_DECK_UPLOAD_BYTES / (1024 * 1024)}MB`,
          );
        }
        if (
          f.type &&
          f.type !== "application/pdf" &&
          !f.name.toLowerCase().endsWith(".pdf")
        ) {
          throw new Error("Deck upload must be a PDF");
        }
        const name = f.name || "deck.pdf";
        const buf = Buffer.from(await f.arrayBuffer());
        assertPdfMagic(buf);
        deck_file_name = name;
        deck_bytes = buf.length;
        deck_sha256 = createHash("sha256").update(buf).digest("hex").slice(0, 16);
        deck_buf = buf;
      }
    }

    return {
      company_name,
      oneliner,
      founder_name,
      sector,
      github,
      x_handle,
      linkedin,
      deck_file_name,
      deck_bytes,
      deck_sha256,
      deck_buf,
    };
  }

  const json = (await req.json()) as {
    company_name?: string;
    deck_url?: string;
    oneliner?: string;
    founder_name?: string;
    sector?: string;
    github?: string;
    x_handle?: string;
    linkedin?: string;
  };
  return {
    ...json,
    deck_url: normalizeHttpUrl(String(json.deck_url || "")) || undefined,
  };
}

async function uploadDeckToStorage(
  buf: Buffer,
  fileName: string,
  ownerId: string,
): Promise<string | undefined> {
  if (!hasSupabaseAdmin()) return undefined;
  const sb = getSupabaseAdmin()!;
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  const path = `${ownerId}/${Date.now()}_${randomUUID().slice(0, 8)}_${safe}`;
  const { error } = await sb.storage.from("decks").upload(path, buf, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (error) {
    console.error("[apply] storage upload:", error.message);
    return undefined;
  }
  return path;
}

export async function POST(req: Request) {
  const admission = checkPublicApplyAdmission(req.headers);
  if (!admission.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "Too many applications. Try again later.",
        retry_after_seconds: admission.retryAfterSec,
      },
      {
        status: 429,
        headers: { "Retry-After": String(admission.retryAfterSec) },
      },
    );
  }

  let body: ParsedApply;
  try {
    body = await parseBody(req);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Invalid body" },
      { status: 400 },
    );
  }

  if (!body.company_name?.trim()) {
    return NextResponse.json(
      { ok: false, error: "company_name required" },
      { status: 400 },
    );
  }

  const deckUrl = body.deck_url?.trim();
  const hasDeck = Boolean(deckUrl || body.deck_file_name);
  if (!hasDeck) {
    return NextResponse.json(
      { ok: false, error: "deck_url or deck_file required" },
      { status: 400 },
    );
  }

  let deckUrlIsPdf = false;
  let deckUrlNote: string | undefined;
  let materialsKind: "pdf_deck" | "website" | "unknown" | undefined;
  if (deckUrl) {
    const pre = await preflightRemoteDeck(deckUrl);
    materialsKind = pre.kind;
    if (!pre.accepted) {
      return NextResponse.json(
        {
          ok: false,
          error:
            pre.error ||
            "Deck / materials URL is not allowed (use a public https product site or PDF host).",
        },
        { status: 400 },
      );
    }
    deckUrlIsPdf = pre.ok && pre.kind === "pdf_deck";
    // Soft notes only — never present website materials as a hard error.
    if (pre.note) deckUrlNote = pre.note;
    else if (pre.kind === "website") {
      deckUrlNote =
        "Product/website URL accepted as materials (not a PDF deck).";
    }
  }

  try {
    return await withOptionalStore(async () => {
      const store = getStore();
      const companyName = (body.company_name ?? "").trim();
      const id = `inbound_${Date.now()}`;
      const now = new Date().toISOString();
      const name = body.founder_name?.trim() || "Inbound Founder";
      const ownerId = getWorkspaceOwnerId() || "inbound";

      let deck_storage_path = body.deck_storage_path;
      if (!deckUrl && body.deck_buf && body.deck_file_name) {
        deck_storage_path = await uploadDeckToStorage(
          body.deck_buf,
          body.deck_file_name,
          ownerId,
        );
      }

      const deckRef =
        deckUrl ||
        (deck_storage_path
          ? `storage://decks/${deck_storage_path}`
          : body.deck_file_name
            ? `upload://${body.deck_file_name}`
            : "upload://deck");

      if (!deckUrl && body.deck_file_name && !deck_storage_path) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "PDF upload needs Supabase Storage (bucket `decks` + service role). Prefer a direct deck URL for the demo.",
          },
          { status: 503 },
        );
      }

      const github = cleanPublicHandle(body.github);
      const xHandle = cleanPublicHandle(body.x_handle);
      const linkedin = (body.linkedin ?? "").trim() || undefined;
      const links = [
        deckUrl,
        github ? `https://github.com/${github}` : undefined,
        linkedin,
      ].filter((x): x is string => Boolean(x));

      const claims = [
        {
          text: `Deck: ${deckRef}${body.deck_sha256 ? ` · sha256:${body.deck_sha256}` : ""}`,
          category: "inbound" as const,
          confidence: 0.4,
          contradiction: false,
          ...(deckUrl
            ? { evidence_url: deckUrl }
            : deck_storage_path
              ? { evidence_url: `storage://decks/${deck_storage_path}` }
              : {}),
        },
      ];

      // MemoryStore may merge on name/github/link identity — always use the
      // canonical id returned by upsert, not the provisional inbound_* id.
      // Product FK (workspace_id, founder_id) fails if we dual-write product
      // against a provisional id that never landed in Postgres.
      const savedFounder = await store.upsertFounder({
        id,
        name,
        handles: {
          ...(github ? { github } : {}),
          ...(xHandle ? { twitter: xHandle, x: xHandle } : {}),
          ...(linkedin ? { linkedin } : {}),
        },
        links,
        bio: `Inbound application for ${companyName}`,
        claims,
        founder_score: 0,
        score_confidence: 0.3,
      });
      const founderId = savedFounder.id;
      const mergedExisting = founderId !== id;

      let domain: string | undefined;
      if (deckUrl) {
        try {
          domain = new URL(deckUrl).hostname.replace(/^www\./, "");
        } catch {
          /* ignore */
        }
      }

      await store.upsertProduct({
        id: `p_${founderId}`,
        founder_id: founderId,
        name: companyName,
        domain,
        oneliner: body.oneliner || undefined,
        sector: body.sector || "developer tools",
        stage: "pre-seed",
        traction_claims: [],
      });

      await store.addSignal({
        entity_type: "founder",
        entity_id: founderId,
        source: "inbound",
        url: deckUrl || deckRef,
        payload: {
          engagement: 0,
          followers: 0,
          deck_upload: Boolean(body.deck_file_name),
          deck_file: body.deck_file_name,
          deck_bytes: body.deck_bytes,
          deck_sha256: body.deck_sha256,
          deck_storage_path,
          github: github ?? null,
          company: companyName,
          provisional_id: id,
          merged_existing: mergedExisting,
        },
        observed_at: now,
      });

      const sb = getSupabaseAdmin();
      if (sb) {
        const { error } = await sb.from("inbound_applications").upsert({
          id: founderId,
          owner_id: ownerId === "inbound" ? null : ownerId,
          company_name: companyName,
          founder_name: name,
          oneliner: body.oneliner ?? null,
          sector: body.sector ?? null,
          deck_url: deckUrl ?? null,
          deck_storage_path: deck_storage_path ?? null,
          deck_file_name: body.deck_file_name ?? null,
          deck_bytes: body.deck_bytes ?? null,
          deck_sha256: body.deck_sha256 ?? null,
        });
        if (error) console.error("[apply] inbound_applications", error.message);
      }

      let product = await store.getProductForFounder(founderId);
      let enrichNote: string | undefined;
      // Cold-start path (brief AoR #3): public footprint → gravity before screen.
      if (github || xHandle || linkedin || deckUrl) {
        const base = await store.getFounder(founderId);
        if (base) {
          try {
            const profile = await enrichFromProfile(base, product);
            for (const sp of profile.signals) {
              await store.addSignal({
                entity_type: "founder",
                entity_id: founderId,
                source: sp.source,
                url: sp.url,
                payload: sp.payload,
                observed_at: new Date().toISOString(),
              });
            }
            if (profile.providers_used.length) {
              enrichNote = `Enriched via ${profile.providers_used.join(", ")}.`;
            } else if (profile.errors.length) {
              enrichNote = `Enrichment skipped: ${profile.errors[0]}`;
            } else if (!github) {
              enrichNote =
                "No GitHub handle — gravity stays thin until public signals exist. Add GitHub and re-enrich.";
            }
          } catch (e) {
            enrichNote =
              e instanceof Error
                ? `Enrichment failed: ${e.message}`
                : "Enrichment failed";
          }
        }
      }

      const signals = await store.getSignalsFor(founderId);
      const gravity = scoreGravityFromSignals(signals);
      const founderNow = (await store.getFounder(founderId))!;
      const score = composeFounderScoreFromGravity(gravity, {
        coherence: coherenceFromSignals(
          new Set(signals.map((s) => s.source)).size,
        ),
        track_record: inferTrackRecord(founderNow),
      });
      const founder = await store.upsertFounder({
        id: founderId,
        name,
        founder_score: score.founder_score,
        score_confidence: score.score_confidence,
        gravity,
        handles: founderNow.handles,
        links: founderNow.links,
      });

      product = await store.getProductForFounder(founderId);
      const thesis = await store.getThesis();
      const first_pass = firstPassScreen({
        founder: {
          ...founder,
          links: founder.links?.length
            ? founder.links
            : body.deck_file_name
              ? [deckRef]
              : [],
        },
        product,
        thesis,
        requireDeck: true,
      });

      return NextResponse.json({
        ok: first_pass.pass,
        founder_id: founderId,
        first_pass,
        gravity: gravity.gravity_score,
        founder_score: score.founder_score,
        cold_start: score.cold_start,
        deck_uploaded: Boolean(body.deck_file_name),
        deck_url_is_pdf: deckUrlIsPdf,
        materials_kind: materialsKind ?? null,
        deck_storage_path: deck_storage_path ?? null,
        identity: "applicant",
        merged_existing: mergedExisting,
        note: [
          first_pass.pass
            ? "First-pass cleared — open founder → run 3-axis screen next."
            : "Application stored — first-pass flagged issues (see checks).",
          mergedExisting
            ? "Matched an existing founder (same name/GitHub/link) — updated that profile."
            : null,
          enrichNote,
          `Gravity ${gravity.gravity_score.toFixed(0)}/100 · Founder Score ${score.founder_score.toFixed(0)}.`,
          deckUrlNote,
        ]
          .filter(Boolean)
          .join(" "),
      });
    });
  } catch (e) {
    console.error("[apply]", e);
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Apply failed",
      },
      { status: 500 },
    );
  }
}
