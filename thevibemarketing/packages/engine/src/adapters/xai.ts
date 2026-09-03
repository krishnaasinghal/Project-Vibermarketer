/**
 * xAI Grok adapter — Imagine (image gen) + Vision (image understanding).
 * Fail closed when XAI_API_KEY is unset. Never invent image URLs.
 *
 * Docs: https://docs.x.ai/developers/model-capabilities/images/generation
 * Chat/vision: OpenAI-compatible https://api.x.ai/v1/chat/completions
 */

const XAI_BASE = "https://api.x.ai/v1";
const DEFAULT_IMAGE_MODEL = "grok-imagine-image";
const DEFAULT_VISION_MODEL = "grok-4.5";

export type XaiImageResult =
  | { ok: true; url?: string; b64?: string; model: string }
  | { ok: false; error: string; http?: number };

export type XaiVisionResult =
  | { ok: true; text: string; model: string }
  | { ok: false; error: string; http?: number };

export type XaiHealth = {
  configured: boolean;
  ok: boolean;
  detail: string;
  http?: number;
};

function apiKey(): string | null {
  return process.env.XAI_API_KEY?.trim() || null;
}

export function isXaiConfigured(): boolean {
  return Boolean(apiKey());
}

export async function xaiHealth(): Promise<XaiHealth> {
  const key = apiKey();
  if (!key) {
    return { configured: false, ok: false, detail: "XAI_API_KEY unset" };
  }
  try {
    const res = await fetch(`${XAI_BASE}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(12_000),
    });
    return {
      configured: true,
      ok: res.ok,
      http: res.status,
      detail: res.ok ? "models OK" : `HTTP ${res.status}`,
    };
  } catch (e) {
    return {
      configured: true,
      ok: false,
      detail: e instanceof Error ? e.message : "health failed",
    };
  }
}

/**
 * Generate a social creative via Grok Imagine.
 * Prefer cheaper `grok-imagine-image` for product loop; quality model override via env.
 */
export async function generateImage(opts: {
  prompt: string;
  aspectRatio?: string;
  model?: string;
  n?: number;
}): Promise<XaiImageResult> {
  const key = apiKey();
  if (!key) {
    return { ok: false, error: "XAI_API_KEY unset" };
  }
  const prompt = opts.prompt.trim();
  if (!prompt) return { ok: false, error: "prompt required" };

  const model =
    opts.model?.trim() ||
    process.env.XAI_IMAGE_MODEL?.trim() ||
    DEFAULT_IMAGE_MODEL;

  try {
    const body: Record<string, unknown> = {
      model,
      prompt,
      n: opts.n && opts.n > 0 ? Math.min(4, opts.n) : 1,
    };
    if (opts.aspectRatio) body.aspect_ratio = opts.aspectRatio;

    const res = await fetch(`${XAI_BASE}/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    });

    const text = await res.text();
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const err = JSON.parse(text) as {
          error?: { message?: string; code?: string };
        };
        detail = err.error?.message || err.error?.code || detail;
      } catch {
        /* keep */
      }
      return { ok: false, error: detail, http: res.status };
    }

    const json = JSON.parse(text) as {
      data?: Array<{ url?: string; b64_json?: string }>;
    };
    const first = json.data?.[0];
    if (!first?.url && !first?.b64_json) {
      return { ok: false, error: "empty image response" };
    }
    return {
      ok: true,
      url: first.url,
      b64: first.b64_json,
      model,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "image generation failed",
    };
  }
}

/**
 * Vision: describe / critique a product screenshot or creative (public image URL).
 */
export async function analyzeImage(opts: {
  imageUrl: string;
  prompt: string;
  model?: string;
}): Promise<XaiVisionResult> {
  const key = apiKey();
  if (!key) {
    return { ok: false, error: "XAI_API_KEY unset" };
  }
  const imageUrl = opts.imageUrl.trim();
  const prompt = opts.prompt.trim();
  if (!imageUrl || !prompt) {
    return { ok: false, error: "imageUrl and prompt required" };
  }
  if (!/^https?:\/\//i.test(imageUrl)) {
    return { ok: false, error: "imageUrl must be http(s)" };
  }

  const model =
    opts.model?.trim() ||
    process.env.XAI_VISION_MODEL?.trim() ||
    DEFAULT_VISION_MODEL;

  try {
    const res = await fetch(`${XAI_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });

    const text = await res.text();
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const err = JSON.parse(text) as {
          error?: { message?: string };
        };
        detail = err.error?.message || detail;
      } catch {
        /* keep */
      }
      return { ok: false, error: detail, http: res.status };
    }

    const json = JSON.parse(text) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const out = json.choices?.[0]?.message?.content?.trim();
    if (!out) return { ok: false, error: "empty vision response" };
    return { ok: true, text: out, model };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "vision failed",
    };
  }
}

/** Build a safe social creative prompt from brand + post (no fake metrics). */
export function buildSocialCreativePrompt(input: {
  brandName: string;
  oneliner: string;
  tone: string;
  platform: string;
  postBody: string;
}): string {
  const body = input.postBody.slice(0, 280).replace(/\s+/g, " ").trim();
  return [
    `Create a clean, modern social media graphic for ${input.brandName}.`,
    `Product one-liner: ${input.oneliner || "founder marketing tool"}.`,
    `Tone: ${input.tone || "direct, founder-to-founder"}.`,
    `Platform: ${input.platform}.`,
    `Post gist (do not render as wall of text — short headline only if needed): ${body}`,
    "Style: bold typography, high contrast, minimal UI chrome, no fake logos of other brands,",
    "no fake charts or metrics, no watermark, product-marketing aesthetic suitable for X/LinkedIn.",
  ].join(" ");
}
