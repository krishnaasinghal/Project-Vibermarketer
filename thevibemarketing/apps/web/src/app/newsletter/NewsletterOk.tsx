"use client";

import { useEffect, useState } from "react";

/** Surfaces `?ok=1` after newsletter subscribe redirect. */
export function NewsletterOk() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("ok") === "1") {
      setShow(true);
    }
  }, []);

  if (!show) return null;

  return (
    <p
      className="panel border-ok/40 bg-ok/5 px-4 py-3 text-sm text-ok"
      role="status"
    >
      You&apos;re subscribed. Distribution notes will land when we send.
    </p>
  );
}
