import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center px-4 py-20 sm:px-6">
      <p className="section-label mb-2">404</p>
      <h1 className="font-display text-4xl font-bold tracking-tight">
        Page not found
      </h1>
      <p className="mt-3 text-muted">
        That route doesn&apos;t exist. Head back to the product.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/app" className="btn-primary focus-ring">
          Open app
        </Link>
        <Link href="/get-started" className="btn-ghost focus-ring">
          Get started
        </Link>
        <Link href="/" className="btn-ghost focus-ring">
          Home
        </Link>
      </div>
    </div>
  );
}
