#!/usr/bin/env node

const DEFAULT_BASE_URL = "https://www.vibemarketer.fun";
const MAX_RESPONSE_BYTES = 1_000_000;
const REQUEST_TIMEOUT_MS = 20_000;

function resolveBaseUrl() {
  const raw = process.env.PRODUCTION_GATE_URL?.trim() || process.argv[2] || DEFAULT_BASE_URL;
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("PRODUCTION_GATE_URL must use http or https");
  }
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url;
}

async function request(baseUrl, path) {
  const response = await fetch(new URL(path, baseUrl), {
    redirect: "manual",
    headers: {
      accept: "text/html,application/json;q=0.9,*/*;q=0.8",
      "user-agent": "vibemarketer-production-gate/1.0",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_RESPONSE_BYTES) {
    throw new Error(`${path} response is too large (${declaredLength} bytes)`);
  }
  const body = (await response.text()).slice(0, MAX_RESPONSE_BYTES + 1);
  if (body.length > MAX_RESPONSE_BYTES) {
    throw new Error(`${path} response exceeded ${MAX_RESPONSE_BYTES} bytes`);
  }
  return { response, body };
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function requireStatus(response, expected, path) {
  requireCondition(
    response.status === expected,
    `${path} returned ${response.status}; expected ${expected}`,
  );
}

async function main() {
  const baseUrl = resolveBaseUrl();
  const checks = [
    {
      name: "readiness",
      run: async () => {
        const { response, body } = await request(baseUrl, "/api/ready");
        requireStatus(response, 200, "/api/ready");
        let payload;
        try {
          payload = JSON.parse(body);
        } catch {
          throw new Error("/api/ready did not return JSON");
        }
        requireCondition(payload?.ok === true, "/api/ready reported ok=false");
        requireCondition(
          payload?.product === "vibemarketer",
          "/api/ready returned an unexpected product",
        );
        requireCondition(payload?.status === "ready", "/api/ready is not ready");
        return `status=${payload.status}`;
      },
    },
    {
      name: "marketing-first homepage",
      run: async () => {
        const { response, body } = await request(baseUrl, "/");
        requireStatus(response, 200, "/");
        const normalized = body.toLowerCase();
        requireCondition(normalized.includes("vibemarketer"), "homepage product name is missing");
        requireCondition(
          normalized.includes("product url") &&
            (normalized.includes("brand brief") || normalized.includes("brand memory")) &&
            normalized.includes("draft") &&
            (normalized.includes("approval") || normalized.includes("hitl")),
          "homepage is not presenting the URL-to-drafts approval loop",
        );
        return "URL-to-marketing-loop narrative present";
      },
    },
    {
      name: "locked pricing",
      run: async () => {
        const { response, body } = await request(baseUrl, "/pricing");
        requireStatus(response, 200, "/pricing");
        for (const expected of [
          "Starter",
          "₹1,499",
          "Growth",
          "₹3,999",
          "Pro",
          "₹7,999",
        ]) {
          requireCondition(body.includes(expected), `/pricing is missing ${expected}`);
        }
        requireCondition(!body.includes("$49"), "/pricing still exposes the retired $49 price");
        requireCondition(
          !body.includes("Priced like a dev tool"),
          "/pricing still serves the retired pricing page",
        );
        return "Starter/Growth/Pro INR pricing present";
      },
    },
    {
      name: "application auth gate",
      run: async () => {
        const { response, body } = await request(baseUrl, "/app");
        const location = response.headers.get("location");
        const redirectedToLogin =
          [301, 302, 303, 307, 308].includes(response.status) &&
          location !== null &&
          new URL(location, baseUrl).pathname === "/login";
        const renderedLogin = response.status === 200 && body.includes("Sign in");
        requireCondition(
          redirectedToLogin || renderedLogin,
          `/app is not protected (status ${response.status})`,
        );
        requireCondition(!body.includes("AUTH DISABLED"), "/app exposes auth-bypass mode");
        return redirectedToLogin ? "redirects to login" : "renders login boundary";
      },
    },
    ...[
      "/api/marketing/posts",
      "/api/internal/publishing/drain",
      "/api/internal/publishing/status",
    ].map((path) => ({
      name: `unauthorized ${path}`,
      run: async () => {
        const { response } = await request(baseUrl, path);
        requireStatus(response, 401, path);
        return "returns 401 without credentials";
      },
    })),
    {
      name: "transport security",
      run: async () => {
        if (baseUrl.protocol !== "https:") return "skipped for local HTTP";
        const { response } = await request(baseUrl, "/");
        const hsts = response.headers.get("strict-transport-security") ?? "";
        const maxAge = Number(hsts.match(/max-age=(\d+)/i)?.[1] ?? 0);
        requireCondition(maxAge >= 31_536_000, "HSTS max-age is missing or below one year");
        return `HSTS max-age=${maxAge}`;
      },
    },
    {
      name: "browser security headers",
      run: async () => {
        const { response } = await request(baseUrl, "/");
        if (baseUrl.protocol !== "https:") return "skipped for local HTTP";
        for (const header of [
          "content-security-policy",
          "x-frame-options",
          "x-content-type-options",
          "referrer-policy",
          "permissions-policy",
          "x-permitted-cross-domain-policies",
        ]) {
          requireCondition(response.headers.has(header), `${header} is missing`);
        }
        requireCondition(!response.headers.has("x-powered-by"), "x-powered-by is exposed");
        return "CSP, framing, content-type, referrer, permissions, and platform headers are hardened";
      },
    },
  ];

  if (baseUrl.hostname === "www.vibemarketer.fun") {
    checks.push({
      name: "canonical host redirect",
      run: async () => {
        const apex = new URL(baseUrl);
        apex.hostname = "vibemarketer.fun";
        const { response } = await request(apex, "/");
        const location = response.headers.get("location");
        requireCondition(
          [301, 302, 303, 307, 308].includes(response.status) && location !== null,
          `apex returned ${response.status} without a redirect`,
        );
        requireCondition(
          new URL(location, apex).hostname === "www.vibemarketer.fun",
          `apex redirects to the wrong host: ${location}`,
        );
        return "apex redirects to www";
      },
    });
  }

  console.log(`Production gate: ${baseUrl.origin}`);
  const results = await Promise.all(
    checks.map(async (check) => {
      try {
        return { name: check.name, ok: true, detail: await check.run() };
      } catch (error) {
        return {
          name: check.name,
          ok: false,
          detail: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );

  for (const result of results) {
    console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name}: ${result.detail}`);
  }

  const failures = results.filter((result) => !result.ok);
  if (failures.length > 0) {
    console.error(`Production gate failed: ${failures.length}/${results.length} checks failed.`);
    process.exitCode = 1;
    return;
  }
  console.log(`Production gate passed: ${results.length}/${results.length} checks.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
