import { createBrowserClient } from "@supabase/ssr";
import {
  getSupabasePublishableKey,
  getSupabaseUrl,
  isAuthConfigured,
} from "@/lib/supabase/config";

export function createClient() {
  if (!isAuthConfigured()) {
    throw new Error(
      "Auth is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in env.",
    );
  }
  return createBrowserClient(getSupabaseUrl()!, getSupabasePublishableKey()!);
}
