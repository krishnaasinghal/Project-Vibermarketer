/**
 * Pre-flight gates for inbound materials URLs and PDF uploads.
 * Blocks SSRF / wallet / timeout exploits before Firecrawl or storage work.
 *
 * Product sites (e.g. kaggleingest.com) are valid materials — not only DocSend PDFs.
 */

export const MAX_DECK_UPLOAD_BYTES = 8 * 1024 * 1024; // 8MB local upload
export const MAX_DECK_REMOTE_BYTES = 15 * 1024 * 1024; // 15MB remote HEAD gate
export const MAX_DECK_PAGES_HINT = 40; // soft cap documented; PDF page count optional

const PDF_MAGIC = Buffer.from("%PDF-", "ascii");
const MAX_REMOTE_REDIRECTS = 5;

/** Hosts that commonly host pitch decks as PDFs / viewers. */
const KNOWN_DECK_HOST_SUFFIXES = [
  "docs.google.com",
  "drive.google.com",
  "dropbox.com",
  "www.dropbox.com",
  "dl.dropboxusercontent.com",
  "github.com",
  "raw.githubusercontent.com",
  "notion.so",
  "www.notion.so",
  "pitch.com",
  "www.pitch.com",
  "docsend.com",
  "www.docsend.com",
  "vibemarketer.fun",
  "www.vibemarketer.fun",
];

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata",
]);

export function assertPdfMagic(buf: Buffer): void {
  if (buf.length < 5 || !buf.subarray(0, 5).equals(PDF_MAGIC)) {
    throw new Error("Deck upload must be a real PDF (missing %PDF- header)");
  }
}

export type MaterialsKind = "pdf_deck" | "website" | "unknown";

export type RemoteDeckPreflight = {
  ok: boolean;
  /** True when URL is accepted as inbound materials (PDF deck OR public website). */
  accepted: boolean;
  kind: MaterialsKind;
  contentLength: number | null;
  contentType: string | null;
  /** Soft note for UI — never a hard fail for public product sites. */
  note?: string;
  error?: string;
};

function isPrivateOrLocalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (BLOCKED_HOSTS.has(h)) return true;
  if (h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) {
    return true;
  }
  // IPv4 literals
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (m) {
    const parts = m.slice(1).map((x) => Number(x));
    if (parts.some((n) => n > 255)) return true;
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  }
  // IPv6 literals (block loopback / link-local / ULA)
  if (h.includes(":")) {
    if (h === "::1" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) {
      return true;
    }
  }
  return false;
}

function isKnownDeckHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return KNOWN_DECK_HOST_SUFFIXES.some(
    (suffix) => h === suffix || h.endsWith(`.${suffix}`),
  );
}

/**
 * Parse any public http(s) materials URL. Rejects credentials + private hosts.
 * Does NOT require a known deck host — product sites are allowed.
 */
export function parsePublicMaterialsUrl(raw: string): URL {
  const url = new URL(raw);
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`URL protocol not allowed: ${url.protocol || "invalid"}`);
  }
  if (url.username || url.password) {
    throw new Error("URL must not include credentials");
  }
  if (!hostname || isPrivateOrLocalHostname(hostname)) {
    throw new Error(`URL host is not allowed: ${hostname || "invalid"}`);
  }
  return url;
}

/** @deprecated Use parsePublicMaterialsUrl — kept for callers expecting the old name. */
export function parseAllowedDeckUrl(raw: string): URL {
  return parsePublicMaterialsUrl(raw);
}

function looksLikePdf(url: URL, contentType: string | null): boolean {
  if (/\.pdf(\?|$)/i.test(url.pathname) || /\.pdf(\?|$)/i.test(url.toString())) {
    return true;
  }
  if (contentType && /pdf/i.test(contentType)) return true;
  return false;
}

/**
 * HEAD check before any scrape/extract of a remote deck or product URL.
 * - Known deck hosts / PDF paths → prefer pdf_deck when type matches
 * - Any other public https site → accepted as website evidence (fixes kaggleingest.com UX)
 */
export async function preflightRemoteDeck(
  deckUrl: string,
): Promise<RemoteDeckPreflight> {
  try {
    let currentUrl = parsePublicMaterialsUrl(deckUrl);
    const signal = AbortSignal.timeout(8_000);
    let head: Response | null = null;

    for (let redirects = 0; redirects <= MAX_REMOTE_REDIRECTS; redirects += 1) {
      head = await fetch(currentUrl, {
        method: "HEAD",
        redirect: "manual",
        signal,
      });
      if (head.status < 300 || head.status >= 400) break;

      const location = head.headers.get("location");
      await head.body?.cancel();
      if (!location) throw new Error("URL redirect missing location");
      if (redirects === MAX_REMOTE_REDIRECTS) {
        throw new Error("URL has too many redirects");
      }
      currentUrl = parsePublicMaterialsUrl(new URL(location, currentUrl).toString());
      head = null;
    }

    if (!head) throw new Error("URL preflight returned no response");
    const contentType = head.headers.get("content-type");
    const lenRaw = head.headers.get("content-length");
    const contentLength = lenRaw ? parseInt(lenRaw, 10) : null;

    if (
      contentLength != null &&
      Number.isFinite(contentLength) &&
      contentLength > MAX_DECK_REMOTE_BYTES
    ) {
      return {
        ok: false,
        accepted: false,
        kind: "unknown",
        contentLength,
        contentType,
        error: `URL payload too large (${contentLength} bytes; max ${MAX_DECK_REMOTE_BYTES})`,
      };
    }

    const pdf = looksLikePdf(currentUrl, contentType);
    const knownHost = isKnownDeckHost(currentUrl.hostname);

    // Soft type check for PDF-shaped URLs on known hosts
    if (
      pdf &&
      contentType &&
      !/pdf|octet-stream|binary/i.test(contentType) &&
      !/\.pdf(\?|$)/i.test(currentUrl.toString())
    ) {
      // Still accept as website if public HTML
      if (/html|text\//i.test(contentType)) {
        return {
          ok: false,
          accepted: true,
          kind: "website",
          contentLength,
          contentType,
          note: "URL is a web page (not a PDF deck) — stored as company/website evidence.",
        };
      }
    }

    if (!head.ok && head.status !== 405 && head.status !== 403) {
      // Reachability failed — still allow storage as link if host is public
      // (many product sites block HEAD). Only hard-fail private/malformed above.
      if (head.status === 404 || head.status >= 500) {
        return {
          ok: false,
          accepted: true,
          kind: knownHost || pdf ? "unknown" : "website",
          contentLength,
          contentType,
          note: `URL preflight HTTP ${head.status} — stored as evidence link; Firecrawl may still fetch later.`,
        };
      }
      return {
        ok: false,
        accepted: false,
        kind: "unknown",
        contentLength,
        contentType,
        error: `URL preflight returned HTTP ${head.status}`,
      };
    }

    if (pdf || (knownHost && contentType && /pdf/i.test(contentType))) {
      return {
        ok: true,
        accepted: true,
        kind: "pdf_deck",
        contentLength,
        contentType,
      };
    }

    // Product homepage / generic public site (kaggleingest.com, etc.)
    return {
      ok: false,
      accepted: true,
      kind: "website",
      contentLength,
      contentType,
      note: "Product/website URL accepted as materials (not a PDF deck). Prefer DocSend / Drive PDF when available.",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "URL preflight failed";
    // Hard fail only for protocol / private host / credentials
    const hard =
      /protocol not allowed|not include credentials|host is not allowed|too many redirects|redirect missing/i.test(
        msg,
      );
    return {
      ok: false,
      accepted: !hard,
      kind: "unknown",
      contentLength: null,
      contentType: null,
      error: hard ? msg : undefined,
      note: hard
        ? undefined
        : `URL preflight soft-fail (${msg}) — stored as evidence link if application continues.`,
    };
  }
}
