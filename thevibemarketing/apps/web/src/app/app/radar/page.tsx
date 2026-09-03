import { Suspense } from "react";
import RadarClient from "./RadarClient";

export default function RadarPage() {
  return (
    <Suspense
      fallback={
        <p className="mt-10 text-sm text-muted">Loading radar…</p>
      }
    >
      <RadarClient />
    </Suspense>
  );
}
