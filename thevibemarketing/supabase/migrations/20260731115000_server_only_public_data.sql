-- Product data is accessed through authenticated web routes using the service
-- role. Browser Supabase clients are auth-only, so direct table access would
-- bypass API validation, rate limits, entitlements, and HITL controls.
revoke all on all tables in schema public
  from public, anon, authenticated;

revoke all on all sequences in schema public
  from public, anon, authenticated;

-- New data objects are private by default. Any future direct client data path
-- must opt in with a table-specific grant and an owner-scoped RLS policy.
alter default privileges in schema public
  revoke all on tables from public, anon, authenticated;

alter default privileges in schema public
  revoke all on sequences from public, anon, authenticated;
