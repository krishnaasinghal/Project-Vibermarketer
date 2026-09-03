import type { ReactElement } from "react";
import Link from "next/link";
import { getAuthUser } from "@/lib/auth";

export type AuthAwareCtaItem = {
  href: string;
  label: string;
  className: string;
};

type Props = {
  guest: AuthAwareCtaItem;
  authed: AuthAwareCtaItem;
  guestSecondary?: AuthAwareCtaItem[];
  authedSecondary?: AuthAwareCtaItem[];
};

export async function AuthAwareActions({
  guest,
  authed,
  guestSecondary = [],
  authedSecondary = [],
}: Props): Promise<ReactElement> {
  const user = await getAuthUser();
  const primary = user ? authed : guest;
  const secondary = user ? (authedSecondary.length ? authedSecondary : guestSecondary) : guestSecondary;

  return (
    <>
      <Link href={primary.href} className={primary.className}>
        {primary.label}
      </Link>
      {secondary.map((item) => (
        <Link key={item.href} href={item.href} className={item.className}>
          {item.label}
        </Link>
      ))}
    </>
  );
}
