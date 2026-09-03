import { NextResponse } from "next/server";
import { getSupabaseAdmin, hasSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

type WaitlistSource = "waitlist" | "newsletter" | "pricing" | "blog" | "other";

function parseSource(raw: unknown): WaitlistSource {
  const s = String(raw || "waitlist").toLowerCase();
  if (
    s === "newsletter" ||
    s === "pricing" ||
    s === "blog" ||
    s === "waitlist"
  ) {
    return s;
  }
  return "other";
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(req: Request) {
  const wantsJson =
    req.headers.get("accept")?.includes("application/json") ||
    (req.headers.get("content-type") || "").includes("application/json");

  try {
    let email = "";
    let name = "";
    let source: WaitlistSource = "waitlist";
    let intent = "";

    try {
      const contentType = req.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const body = (await req.json()) as {
          email?: string;
          name?: string;
          source?: string;
          intent?: string;
        };
        email = body.email?.trim() || "";
        name = body.name?.trim() || "";
        source = parseSource(body.source);
        intent = body.intent?.trim() || "";
      } else {
        const form = await req.formData();
        email = String(form.get("email") || "").trim();
        name = String(form.get("name") || "").trim();
        source = parseSource(form.get("source"));
        intent = String(form.get("intent") || "").trim();
      }
    } catch {
      if (wantsJson) return jsonError("invalid body", 400);
      return NextResponse.redirect(new URL("/?waitlist=invalid", req.url));
    }

    const normalized = email.toLowerCase();
    if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      if (wantsJson) return jsonError("valid email required", 400);
      return NextResponse.redirect(new URL("/?waitlist=invalid", req.url));
    }

    if (!hasSupabaseAdmin()) {
      console.error("[waitlist] SUPABASE_SERVICE_ROLE_KEY missing");
      if (wantsJson) {
        return jsonError(
          "Newsletter storage not configured (missing Supabase service role).",
          503,
        );
      }
      return NextResponse.redirect(new URL("/?waitlist=error", req.url));
    }

    const sb = getSupabaseAdmin()!;
    const row = {
      email: normalized,
      name: name ? name.slice(0, 80) : null,
      source,
      intent: intent ? intent.slice(0, 120) : null,
    };

    const { error } = await sb.from("subscribers").upsert(row, {
      onConflict: "email,source",
      ignoreDuplicates: true,
    });

    if (error) {
      // Unique race / already exists → treat as deduped success
      if (error.code === "23505") {
        if (wantsJson) {
          return NextResponse.json({ ok: true, deduped: true, source });
        }
        return NextResponse.redirect(
          new URL(
            source === "newsletter" ? "/newsletter?ok=1" : "/?waitlist=ok",
            req.url,
          ),
        );
      }
      console.error("[waitlist] supabase", error.message);
      if (wantsJson) return jsonError(error.message, 500);
      return NextResponse.redirect(new URL("/?waitlist=error", req.url));
    }

    // Detect dedupe: if row already existed, upsert with ignoreDuplicates returns no error
    const { data: existing } = await sb
      .from("subscribers")
      .select("id, created_at")
      .eq("email", normalized)
      .eq("source", source)
      .maybeSingle();

    const createdMs = existing?.created_at
      ? Date.now() - new Date(existing.created_at as string).getTime()
      : 0;
    const deduped = createdMs > 10_000;

    if (wantsJson) {
      return NextResponse.json({ ok: true, deduped, source });
    }
    return NextResponse.redirect(
      new URL(
        source === "newsletter" ? "/newsletter?ok=1" : "/?waitlist=ok",
        req.url,
      ),
    );
  } catch (e) {
    console.error("[waitlist]", e);
    if (wantsJson) {
      return jsonError(
        e instanceof Error ? e.message : "subscribe failed",
        500,
      );
    }
    return NextResponse.redirect(new URL("/?waitlist=error", req.url));
  }
}
