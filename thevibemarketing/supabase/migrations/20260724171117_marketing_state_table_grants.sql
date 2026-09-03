-- Fix Data API access: tables were created without table-level GRANTs.
-- RLS alone is not enough — roles need SELECT/INSERT/UPDATE/DELETE privileges
-- or PostgREST returns "permission denied for table …".
--
-- App server uses service_role (bypasses RLS). Authenticated role keeps
-- row ownership policies already defined on marketing_state and related tables.
-- anon intentionally gets no DML on app tables (service role / authenticated only).

grant usage on schema public to postgres, anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public
  to authenticated, service_role;

grant all on all sequences in schema public
  to authenticated, service_role;

grant execute on all functions in schema public
  to authenticated, service_role;

-- Future migrations: keep the same privilege model.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;

alter default privileges in schema public
  grant all on sequences to authenticated, service_role;

alter default privileges in schema public
  grant execute on functions to authenticated, service_role;
