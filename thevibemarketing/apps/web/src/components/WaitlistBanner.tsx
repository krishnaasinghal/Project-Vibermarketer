"use client";

import { useEffect, useState } from "react";

/** Surfaces `?waitlist=ok|invalid` after non-JSON form redirects. */
export function WaitlistBanner() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("waitlist");
    if (v === "ok") {
      setMsg({
        ok: true,
        text: "Got it — you'll get product drops by email. Prefer to ship now? Start free.",
      });
    } else if (v === "invalid") {
      setMsg({ ok: false, text: "That email looked invalid — try again." });
    }
  }, []);

  if (!msg) return null;

  return (
    <p
      className={`site-shell pt-4 text-base ${
        msg.ok ? "text-ok" : "text-danger"
      }`}
      role="status"
    >
      {msg.text}
    </p>
  );
}
