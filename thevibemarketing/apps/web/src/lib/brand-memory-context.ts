/**
 * Wire workspace owner + BrandContext into engine brand-memory calls.
 */
import type { BrandMemoryInput } from "@vibe/engine";
import type { BrandContext } from "@/lib/marketing-store";
import { getWorkspaceOwnerId } from "@/lib/workspace-context";

export function currentOwnerId(): string {
  return getWorkspaceOwnerId()?.trim() || "anonymous";
}

export function toBrandMemoryInput(
  brand: BrandContext | BrandMemoryInput,
  extra?: { markdown?: string | null },
): BrandMemoryInput {
  return {
    url: brand.url,
    name: brand.name,
    oneliner: brand.oneliner,
    icp: brand.icp,
    tone: brand.tone,
    pillars: brand.pillars,
    never_say: "never_say" in brand ? brand.never_say : undefined,
    audience_notes: "audience_notes" in brand ? brand.audience_notes : undefined,
    facts: "facts" in brand ? brand.facts : undefined,
    markdown: extra?.markdown,
  };
}
