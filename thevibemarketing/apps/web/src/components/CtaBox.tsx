import type { ReactNode } from "react";

type Props = {
  /** Short label so users know which action is primary */
  hint?: string;
  children: ReactNode;
  className?: string;
};

/**
 * Groups CTAs in a bordered box so primary vs secondary is scannable.
 * Put one btn-primary first; secondary btn-ghost after.
 */
export function CtaBox({
  hint = "Next step",
  children,
  className = "",
}: Props) {
  return (
    <div
      className={`cta-box ${className}`.trim()}
      role="group"
      aria-label={hint}
    >
      <p className="cta-box__hint">{hint}</p>
      <div className="cta-box__actions">{children}</div>
    </div>
  );
}
