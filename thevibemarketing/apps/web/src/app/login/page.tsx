import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getAuthUser } from "@/lib/auth";
import { isAuthConfigured, safeNextPath } from "@/lib/supabase/config";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Sign in",
  path: "/login",
  description: "Sign in with email and password.",
  noIndex: true,
});

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const next = safeNextPath(sp.next);
  const user = await getAuthUser();
  if (user) redirect(next);

  return (
    <>
      {sp.error ? (
        <p className="mx-auto max-w-md px-4 pt-8 text-sm text-danger" role="alert">
          Sign-in failed. Try again.
        </p>
      ) : null}
      <AuthForm mode="login" next={next} authReady={isAuthConfigured()} />
    </>
  );
}
