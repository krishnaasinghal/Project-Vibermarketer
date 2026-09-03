-- VC Brain Memory layer — append-only evidence + Founder Score ledger.
-- Demo keeps JSON store; enable Postgres with SUPABASE_SERVICE_ROLE_KEY + USE_POSTGRES_DUAL=1.
-- Apply: supabase db push   OR   Supabase MCP apply_migration

-- ---------------------------------------------------------------------------
-- Workspaces (tenant)
-- ---------------------------------------------------------------------------
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete set null,
  kind text not null default 'fund'
    check (kind in ('marketing', 'fund')),
  name text not null default 'Default',
  created_at timestamptz not null default now()
);

alter table public.workspaces enable row level security;

create policy "workspaces_select_own"
  on public.workspaces for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "workspaces_insert_own"
  on public.workspaces for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "workspaces_update_own"
  on public.workspaces for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Founders (mutable current cache)
-- ---------------------------------------------------------------------------
create table if not exists public.founders (
  id text not null,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  handles jsonb not null default '{}'::jsonb,
  links text[] not null default '{}',
  bio text,
  founder_score numeric not null default 0,
  score_confidence numeric not null default 0,
  gravity jsonb not null default '{}'::jsonb,
  activation jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);

create index if not exists founders_score_idx
  on public.founders (workspace_id, founder_score desc);

alter table public.founders enable row level security;

create policy "founders_all_own_workspace"
  on public.founders for all to authenticated
  using (
    workspace_id in (
      select id from public.workspaces where owner_id = (select auth.uid())
    )
  )
  with check (
    workspace_id in (
      select id from public.workspaces where owner_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------------
create table if not exists public.products (
  id text not null,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  founder_id text not null,
  name text not null,
  domain text,
  oneliner text,
  sector text,
  stage text,
  traction_claims jsonb not null default '[]'::jsonb,
  primary key (workspace_id, id),
  foreign key (workspace_id, founder_id)
    references public.founders (workspace_id, id) on delete cascade
);

alter table public.products enable row level security;

create policy "products_all_own_workspace"
  on public.products for all to authenticated
  using (
    workspace_id in (
      select id from public.workspaces where owner_id = (select auth.uid())
    )
  )
  with check (
    workspace_id in (
      select id from public.workspaces where owner_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- APPEND-ONLY signals (evidence log)
-- ---------------------------------------------------------------------------
create table if not exists public.signals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  entity_type text not null check (entity_type in ('founder', 'product')),
  entity_id text not null,
  source text not null,
  url text,
  payload jsonb not null default '{}'::jsonb,
  content_hash text not null,
  observed_at timestamptz not null,
  ingested_at timestamptz not null default now(),
  unique (workspace_id, entity_id, source, content_hash)
);

create index if not exists signals_entity_idx
  on public.signals (workspace_id, entity_id, observed_at desc);

alter table public.signals enable row level security;

create policy "signals_select_own"
  on public.signals for select to authenticated
  using (
    workspace_id in (
      select id from public.workspaces where owner_id = (select auth.uid())
    )
  );

-- Inserts only for clients; no update/delete policies (append-only via RLS)
create policy "signals_insert_own"
  on public.signals for insert to authenticated
  with check (
    workspace_id in (
      select id from public.workspaces where owner_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- APPEND-ONLY Founder Score ledger (never resets)
-- ---------------------------------------------------------------------------
create table if not exists public.founder_score_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  founder_id text not null,
  score numeric not null,
  confidence numeric not null,
  gravity_score numeric,
  trigger text not null,
  pipeline_run_id uuid,
  rationale text,
  at timestamptz not null default now()
);

create index if not exists founder_score_events_idx
  on public.founder_score_events (workspace_id, founder_id, at desc);

alter table public.founder_score_events enable row level security;

create policy "score_events_select_own"
  on public.founder_score_events for select to authenticated
  using (
    workspace_id in (
      select id from public.workspaces where owner_id = (select auth.uid())
    )
  );

create policy "score_events_insert_own"
  on public.founder_score_events for insert to authenticated
  with check (
    workspace_id in (
      select id from public.workspaces where owner_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Opportunity layer
-- ---------------------------------------------------------------------------
create table if not exists public.screen_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  founder_id text not null,
  product_id text,
  founder_axis jsonb not null,
  market_axis jsonb not null,
  idea_axis jsonb not null,
  thesis_fit text,
  created_at timestamptz not null default now()
);

create table if not exists public.claim_evaluations (
  id uuid primary key default gen_random_uuid(),
  screen_run_id uuid not null references public.screen_runs (id) on delete cascade,
  claim_text text not null,
  category text,
  confidence numeric not null,
  contradiction boolean not null default false,
  contradiction_note text,
  evidence_urls text[] not null default '{}',
  signal_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.memos (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  screen_run_id uuid not null unique references public.screen_runs (id) on delete cascade,
  founder_id text not null,
  decision text not null check (decision in ('yes', 'no', 'watch')),
  sections jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.traces (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  pipeline_run_id uuid not null,
  founder_id text,
  step text not null,
  input jsonb,
  output jsonb,
  ts timestamptz not null default now()
);

alter table public.screen_runs enable row level security;
alter table public.claim_evaluations enable row level security;
alter table public.memos enable row level security;
alter table public.traces enable row level security;

create policy "screen_runs_all_own"
  on public.screen_runs for all to authenticated
  using (
    workspace_id in (select id from public.workspaces where owner_id = (select auth.uid()))
  )
  with check (
    workspace_id in (select id from public.workspaces where owner_id = (select auth.uid()))
  );

create policy "claim_eval_select_own"
  on public.claim_evaluations for select to authenticated
  using (
    screen_run_id in (
      select id from public.screen_runs
      where workspace_id in (
        select id from public.workspaces where owner_id = (select auth.uid())
      )
    )
  );

create policy "claim_eval_insert_own"
  on public.claim_evaluations for insert to authenticated
  with check (
    screen_run_id in (
      select id from public.screen_runs
      where workspace_id in (
        select id from public.workspaces where owner_id = (select auth.uid())
      )
    )
  );

create policy "memos_all_own"
  on public.memos for all to authenticated
  using (
    workspace_id in (select id from public.workspaces where owner_id = (select auth.uid()))
  )
  with check (
    workspace_id in (select id from public.workspaces where owner_id = (select auth.uid()))
  );

create policy "traces_select_own"
  on public.traces for select to authenticated
  using (
    workspace_id in (select id from public.workspaces where owner_id = (select auth.uid()))
  );

create policy "traces_insert_own"
  on public.traces for insert to authenticated
  with check (
    workspace_id in (select id from public.workspaces where owner_id = (select auth.uid()))
  );

-- Service role bypasses RLS for dual-write from Next server.
comment on table public.founder_score_events is
  'Append-only Founder Score ledger. Never UPDATE/DELETE. founders.founder_score is cache.';
comment on table public.signals is
  'Append-only evidence. Dedupe via content_hash. Corrections = new rows.';
