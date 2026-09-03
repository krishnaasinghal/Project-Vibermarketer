-- Extend VC Brain Memory for full dual-write (products, claims, screenings, memos, traces, thesis).
-- Apply after 20260719010000_vc_brain_memory.sql

alter table public.founders
  add column if not exists claims jsonb not null default '[]'::jsonb;

alter table public.workspaces
  add column if not exists thesis jsonb;

alter table public.memos
  add column if not exists memory_id text,
  add column if not exists product_id text,
  add column if not exists decision_conf numeric not null default 0,
  add column if not exists claims jsonb not null default '[]'::jsonb,
  add column if not exists gaps jsonb not null default '[]'::jsonb;

create unique index if not exists memos_memory_id_uidx
  on public.memos (workspace_id, memory_id)
  where memory_id is not null;

-- Engine run_id is `run_<8hex>`, not a UUID
alter table public.traces
  alter column pipeline_run_id type text using pipeline_run_id::text;

alter table public.traces
  add column if not exists evidence jsonb not null default '[]'::jsonb;

alter table public.screen_runs
  add column if not exists scored_at timestamptz;

comment on column public.founders.claims is
  'Founder-level Trust claims (incl. Diligence probe) — dual-written from MemoryStore';
