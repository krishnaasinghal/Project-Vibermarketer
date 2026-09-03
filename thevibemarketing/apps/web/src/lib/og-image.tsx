import { ImageResponse } from "next/og";

/** Shared OG/Twitter card — both route files must export runtime locally (Next does not follow re-exports). */
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";
export const OG_ALT =
  "vibemarketer — paste URL, get on-brand drafts, approve what goes live";

export function renderOgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0b0d10",
          padding: "56px 64px",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(rgba(139,156,179,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(139,156,179,0.08) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            width: 480,
            height: 480,
            background:
              "radial-gradient(circle at center, rgba(212,255,74,0.18), transparent 65%)",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 10,
              border: "1px solid #243041",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#d4ff4a",
              fontSize: 28,
              fontWeight: 700,
            }}
          >
            V
          </div>
          <div style={{ color: "#d4ff4a", fontSize: 22, letterSpacing: 3 }}>
            CURSOR FOR MARKETING
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              color: "#e8ecf1",
              fontSize: 72,
              fontWeight: 800,
              letterSpacing: -2,
              lineHeight: 0.95,
            }}
          >
            vibemarketer
          </div>
          <div
            style={{
              color: "#8b9cb3",
              fontSize: 28,
              maxWidth: 820,
              lineHeight: 1.35,
            }}
          >
            Paste your product URL. Get on-brand launch drafts. Approve what
            goes live.
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            color: "#8b9cb3",
            fontSize: 20,
          }}
        >
          <span>URL → brand → drafts → HITL</span>
          <span style={{ color: "#d4ff4a" }}>vibemarketer.fun</span>
        </div>
      </div>
    ),
    { ...OG_SIZE },
  );
}
