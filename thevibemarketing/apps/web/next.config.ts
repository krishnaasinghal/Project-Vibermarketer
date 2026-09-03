import type { NextConfig } from "next";
import { assertProductionSiteUrl } from "./src/lib/assert-site-url";
import { SECURITY_HEADERS } from "./src/lib/security-headers";
import { assertProductionAuthSafe } from "./src/lib/supabase/config";

// Env: repo-root `.env` is symlinked to `apps/web/.env` so Next loads keys.
assertProductionAuthSafe();
assertProductionSiteUrl();

const nextConfig: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ["@vibe/engine"],
  // Mermaid is client-rendered in blog diagrams; keep it out of the RSC graph.
  serverExternalPackages: ["mermaid"],
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "vibemarketer.fun" }],
        destination: "https://www.vibemarketer.fun/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
