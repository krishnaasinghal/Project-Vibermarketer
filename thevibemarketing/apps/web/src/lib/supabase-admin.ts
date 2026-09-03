import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Server-only Supabase client (service role). Never import from client components. */
let admin: SupabaseClient | null = null;

export function hasSupabaseAdmin(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}

export function getSupabaseAdmin(): SupabaseClient | null {
  if (!hasSupabaseAdmin()) return null;
  if (admin) return admin;
  admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return admin;
}
