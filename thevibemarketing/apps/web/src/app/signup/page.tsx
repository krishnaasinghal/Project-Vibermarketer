import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getAuthUser } from "@/lib/auth";
import { isAuthConfigured, safeNextPath } from "@/lib/supabase/config";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Sign up",
  path: "/signup",
  description: "Create an account with email and password.",
  noIndex: true,
});

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const sp = await searchParams;
  const next = safeNextPath(sp.next);
  const user = await getAuthUser();
  if (user) redirect(next);
  return <AuthForm mode="signup" next={next} authReady={isAuthConfigured()} />;
}
