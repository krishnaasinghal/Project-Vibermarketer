import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";

const MAX_BODY_BYTES = 500_000;
const MAX_REDIRECTS = 4;

const blockedAddresses = new BlockList();

for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockedAddresses.addSubnet(network, prefix, "ipv4");
}

for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blockedAddresses.addSubnet(network, prefix, "ipv6");
}

const blockedHostnames = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.amazonaws.com",
]);

type PublicTarget = {
  url: URL;
  address: string;
  family: 4 | 6;
};

export type PublicFetchResult = {
  ok: boolean;
  status: number;
  text: string;
  ms: number;
  url: string;
  error?: string;
  errorCode?: "UNSAFE_URL" | "FETCH_FAILED";
};

export function isPublicIpAddress(address: string, family = isIP(address)): boolean {
  if (family !== 4 && family !== 6) return false;
  return !blockedAddresses.check(address, family === 4 ? "ipv4" : "ipv6");
}

function normalizedHostname(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
}

function validateUrlShape(url: URL): void {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only public http(s) URLs are supported");
  }
  if (url.username || url.password) {
    throw new Error("URL credentials are not allowed");
  }
  if (url.port) {
    throw new Error("Only standard HTTP and HTTPS ports are allowed");
  }

  const hostname = normalizedHostname(url);
  if (
    !hostname ||
    blockedHostnames.has(hostname) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".home.arpa")
  ) {
    throw new Error("URL must use a public internet hostname");
  }
  if (isIP(hostname) === 0 && !hostname.includes(".")) {
    throw new Error("URL must use a public internet hostname");
  }
}

async function resolvePublicTarget(rawUrl: string | URL): Promise<PublicTarget> {
  const url = rawUrl instanceof URL ? new URL(rawUrl) : new URL(rawUrl);
  validateUrlShape(url);

  const hostname = normalizedHostname(url);
  const literalFamily = isIP(hostname);
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily }]
    : await lookup(hostname, { all: true, verbatim: true });

  if (addresses.length === 0) {
    throw new Error("URL hostname could not be resolved");
  }
  if (addresses.some(({ address, family }) => !isPublicIpAddress(address, family))) {
    throw new Error("URL must resolve only to public internet addresses");
  }

  const selected = addresses[0];
  if (!selected || (selected.family !== 4 && selected.family !== 6)) {
    throw new Error("URL hostname resolved to an unsupported address");
  }

  return {
    url,
    address: selected.address,
    family: selected.family,
  };
}

function pinnedLookup(target: PublicTarget): LookupFunction {
  return (_hostname, options, callback) => {
    if (options.all) {
      callback(null, [{ address: target.address, family: target.family }]);
      return;
    }
    callback(null, target.address, target.family);
  };
}

async function requestText(
  target: PublicTarget,
  timeoutMs: number,
): Promise<PublicFetchResult & { location?: string }> {
  const startedAt = Date.now();
  const request = target.url.protocol === "https:" ? httpsRequest : httpRequest;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: PublicFetchResult & { location?: string }) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const req = request(
      target.url,
      {
        method: "GET",
        lookup: pinnedLookup(target),
        headers: {
          "User-Agent": "vibemarketer-scorecard/0.1 (+https://vibemarketer.fun)",
          Accept: "text/html,application/xhtml+xml,text/plain,application/xml,*/*",
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location =
          status >= 300 && status < 400 && typeof res.headers.location === "string"
            ? res.headers.location
            : undefined;

        if (location) {
          res.resume();
          finish({
            ok: false,
            status,
            text: "",
            ms: Date.now() - startedAt,
            url: target.url.toString(),
            location,
          });
          return;
        }

        const chunks: Buffer[] = [];
        let bytes = 0;
        res.on("data", (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          const remaining = MAX_BODY_BYTES - bytes;
          if (remaining > 0) {
            chunks.push(buffer.subarray(0, remaining));
            bytes += Math.min(buffer.length, remaining);
          }
          if (bytes >= MAX_BODY_BYTES) {
            res.destroy();
            finish({
              ok: status >= 200 && status < 300,
              status,
              text: Buffer.concat(chunks).toString("utf8"),
              ms: Date.now() - startedAt,
              url: target.url.toString(),
            });
          }
        });
        res.on("end", () => {
          finish({
            ok: status >= 200 && status < 300,
            status,
            text: Buffer.concat(chunks).toString("utf8"),
            ms: Date.now() - startedAt,
            url: target.url.toString(),
          });
        });
        res.on("error", (error) => {
          finish({
            ok: false,
            status,
            text: "",
            ms: Date.now() - startedAt,
            url: target.url.toString(),
            error: error.message,
            errorCode: "FETCH_FAILED",
          });
        });
      },
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("Public URL request timed out"));
    });
    req.on("error", (error) => {
      finish({
        ok: false,
        status: 0,
        text: "",
        ms: Date.now() - startedAt,
        url: target.url.toString(),
        error: error.message,
        errorCode: "FETCH_FAILED",
      });
    });
    req.end();
  });
}

export async function fetchPublicText(
  rawUrl: string,
  timeoutMs = 12_000,
  redirectCount = 0,
): Promise<PublicFetchResult> {
  const startedAt = Date.now();
  let target: PublicTarget;
  try {
    target = await resolvePublicTarget(rawUrl);
  } catch (error) {
    return {
      ok: false,
      status: 0,
      text: "",
      ms: Date.now() - startedAt,
      url: rawUrl,
      error: error instanceof Error ? error.message : "Unsafe public URL",
      errorCode: "UNSAFE_URL",
    };
  }

  const response = await requestText(target, timeoutMs);
  if (!response.location) return response;

  if (redirectCount >= MAX_REDIRECTS) {
    return {
      ...response,
      error: "Public URL exceeded the redirect limit",
      errorCode: "FETCH_FAILED",
    };
  }

  let redirectedUrl: URL;
  try {
    redirectedUrl = new URL(response.location, target.url);
  } catch {
    return {
      ...response,
      error: "Public URL returned an invalid redirect",
      errorCode: "FETCH_FAILED",
    };
  }

  const redirected = await fetchPublicText(
    redirectedUrl.toString(),
    timeoutMs,
    redirectCount + 1,
  );
  return {
    ...redirected,
    ms: Date.now() - startedAt,
  };
}
