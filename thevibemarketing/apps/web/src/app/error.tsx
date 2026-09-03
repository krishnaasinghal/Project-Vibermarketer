"use client";

import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center px-4 py-20 sm:px-6">
      <p className="section-label mb-2">Error</p>
      <h1 className="font-display text-4xl font-bold tracking-tight">
        Something broke
      </h1>
      <p className="mt-3 text-sm text-muted">
        {error.message || "Unexpected error"}
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <button type="button" className="btn-primary focus-ring" onClick={reset}>
          Try again
        </button>
        <Link href="/app" className="btn-ghost focus-ring">
          Open app
        </Link>
        <Link href="/" className="btn-ghost focus-ring">
          Home
        </Link>
      </div>
    </div>
  );
}
