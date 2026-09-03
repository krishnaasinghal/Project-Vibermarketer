-- Marketing fleet: durable version column for optimistic concurrency (CAS).
-- Product rule: marketing_state in Supabase is the only production source of truth.
-- Local JSON is for MARKETING_STORE_BACKEND=local (dev/tests) only — never a prod fallback.

alter table public.marketing_state
  add column if not exists version integer not null default 0;

comment on column public.marketing_state.version is
  'Optimistic concurrency token. Writers must UPDATE ... WHERE version = expected and bump version.';

comment on table public.marketing_state is
  'Per-user marketing fleet state (brand, posts, loops, autonomy). SaaS source of truth.';
