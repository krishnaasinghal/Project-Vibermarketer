/**
 * Thin OpenAI chat adapter for JSON completions + optional memo polish.
 * Never logs API keys or raw Authorization headers.
 *
 * Offline: returns null / unchanged input when OPENAI_API_KEY is unset or the request fails.
 */

import type { MemoSection } from "../types";

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
/** Cheapest solid chat model that accepts classic max_tokens (probed 2026-07). */
const DEFAULT_MODEL = "gpt-4.1-nano";

type ChatCompletionResponse = {
  choices?: Array<{
    message?: { content?: string | null };
  }>;
  error?: { message?: string };
};

export type PolishMemoOptions = {
  /** Override env; when unset/empty, sections are returned unchanged. */
  apiKey?: string;
};

function resolveApiKey(explicit?: string): string | null {
  const key = (explicit ?? process.env.OPENAI_API_KEY)?.trim();
  return key || null;
}

function extractJsonObject(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    // Tolerate markdown fences / prose wrapping
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence?.[1]) {
      try {
        return JSON.parse(fence[1].trim()) as unknown;
      } catch {
        /* fall through */
      }
    }
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export type ChatJsonResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string; http?: number };

async function chatJsonDetailed(
  apiKey: string,
  system: string,
  user: string,
  temperature = 0.2,
): Promise<ChatJsonResult> {
  const model = process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;

  try {
    const res = await fetch(OPENAI_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    const text = await res.text();
    if (!res.ok) {
      // Redact-ish: keep code/type only when JSON; never echo full prompt bodies.
      let code = `HTTP ${res.status}`;
      try {
        const err = JSON.parse(text) as {
          error?: { code?: string; type?: string; message?: string };
        };
        code =
          err.error?.code ||
          err.error?.type ||
          err.error?.message?.slice(0, 80) ||
          code;
      } catch {
        /* keep status */
      }
      return { ok: false, error: String(code), http: res.status };
    }

    const body = JSON.parse(text) as ChatCompletionResponse;
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      return { ok: false, error: "empty completion content", http: res.status };
    }

    const data = extractJsonObject(content);
    if (data === null) {
      return { ok: false, error: "could not parse JSON from completion" };
    }
    return { ok: true, data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "OpenAI request failed",
    };
  }
}

async function chatJson(
  apiKey: string,
  system: string,
  user: string,
  temperature = 0.2,
): Promise<unknown | null> {
  const r = await chatJsonDetailed(apiKey, system, user, temperature);
  return r.ok ? r.data : null;
}

/** Tiny chat probe — models list can PASS while completions are quota-blocked. */
export async function openaiChatHealth(): Promise<{
  configured: boolean;
  ok: boolean;
  detail: string;
  http?: number;
}> {
  const apiKey = resolveApiKey();
  if (!apiKey) {
    return { configured: false, ok: false, detail: "unset" };
  }
  const r = await chatJsonDetailed(
    apiKey,
    "Reply with JSON only.",
    'Return {"ping":true}',
    0,
  );
  if (r.ok) {
    return { configured: true, ok: true, detail: "chat OK" };
  }
  return {
    configured: true,
    ok: false,
    detail: r.error,
    http: r.http,
  };
}

/**
 * Ask the model for a JSON object matching `schemaDescription` (natural language).
 * Returns parsed JSON, or null if no key / network / parse failure.
 * Pass `system` for untrusted-scrape hardening (see prompts/untrusted-scrape.ts).
 */
export async function completeJsonDetailed(
  prompt: string,
  schemaDescription: string,
  opts?: { system?: string },
): Promise<ChatJsonResult> {
  const apiKey = resolveApiKey();
  if (!apiKey) {
    return { ok: false, error: "OPENAI_API_KEY unset" };
  }

  const system =
    opts?.system?.trim() ||
    "You are a careful data extractor. Reply with a single JSON object only. " +
      `Schema / shape: ${schemaDescription}`;

  const user = opts?.system
    ? `${prompt}\n\nRequired JSON shape:\n${schemaDescription}`
    : prompt;

  return chatJsonDetailed(
    apiKey,
    opts?.system
      ? `${system}\n\nReply with a single JSON object only.`
      : system,
    user,
  );
}

export async function completeJson(
  prompt: string,
  schemaDescription: string,
  opts?: { system?: string },
): Promise<unknown | null> {
  const r = await completeJsonDetailed(prompt, schemaDescription, opts);
  return r.ok ? r.data : null;
}

type PolishedPayload = {
  sections?: Array<{ key?: unknown; body?: unknown }>;
};

/**
 * Optionally polish memo section *prose* via OpenAI.
 * - No API key → returns `sections` unchanged (offline / deterministic path).
 * - Never invents or alters decisions, numeric scores, claim text, contradiction
 *   flags, URLs, or gap lists — only clarity / grammar of bodies.
 * - On network/parse/shape failure → returns original sections.
 */
export async function polishMemoSections(
  sections: MemoSection[],
  options: PolishMemoOptions = {},
): Promise<MemoSection[]> {
  const apiKey = resolveApiKey(options.apiKey);
  if (!apiKey || sections.length === 0) {
    return sections;
  }

  const payload = {
    sections: sections.map((s) => ({
      key: s.key,
      title: s.title,
      body: s.body,
    })),
  };

  const parsed = (await chatJson(
    apiKey,
    [
      "You polish investment-memo section prose for clarity and grammar.",
      "Reply with a single JSON object: { \"sections\": [ { \"key\": string, \"body\": string } ] }.",
      "Rules (hard):",
      "- Keep the same section keys; one entry per input section.",
      "- Only rewrite wording for readability. Do not add or remove facts.",
      "- NEVER change decisions (yes/no/watch), numeric scores, percentages, confidence values,",
      "  claim text, contradiction flags/notes, evidence URLs, handles, or gap-like lists.",
      "- Preserve bullet structure and labels (Strengths:, Decision:, etc.).",
      "- If a section is mostly structured data (claims, decision axes), leave body nearly identical.",
    ].join(" "),
    JSON.stringify(payload),
    0.3,
  )) as PolishedPayload | null;

  if (!parsed || !Array.isArray(parsed.sections)) {
    return sections;
  }

  const byKey = new Map<string, string>();
  for (const row of parsed.sections) {
    if (
      row &&
      typeof row.key === "string" &&
      typeof row.body === "string" &&
      row.body.trim().length > 0
    ) {
      byKey.set(row.key, row.body);
    }
  }

  // Require a body for every original key — otherwise keep originals (fail closed).
  for (const s of sections) {
    if (!byKey.has(String(s.key))) {
      return sections;
    }
  }

  return sections.map((s) => ({
    ...s,
    body: byKey.get(String(s.key)) ?? s.body,
  }));
}
