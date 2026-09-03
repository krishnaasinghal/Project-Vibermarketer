import Image from "next/image";
import { SITE_NAME } from "@/lib/site";

type Props = {
  className?: string;
  /** Show wordmark next to the mark */
  withWordmark?: boolean;
  title?: string;
};

/**
 * Official vibemarketer mark (user logo): V + signal bars + growth arrow.
 * PNG from /brand/mark-transparent.png — works on dark and light UI.
 */
export function BrandMark({
  className = "h-7 w-7",
  withWordmark = false,
  title = SITE_NAME,
}: Props) {
  const mark = (
    <Image
      src="/brand/mark-transparent.png"
      alt={title}
      width={64}
      height={64}
      className={
        withWordmark
          ? "h-7 w-7 shrink-0 object-contain"
          : `object-contain ${className}`
      }
      priority
    />
  );

  if (!withWordmark) return mark;

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {mark}
      <span className="font-display text-lg font-bold tracking-tight">
        <span className="text-accent">vibe</span>
        <span className="text-ink">marketer</span>
      </span>
    </span>
  );
}
