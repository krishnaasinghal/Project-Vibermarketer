-- Durable waitlist + marketing fleet state + inbound deck metadata.
-- Apply after VC Brain dual-write migration. Storage bucket `decks` is private.

-- ---------------------------------------------------------------------------
-- Newsletter / waitlist subscribers (public signup; service-role writes)
-- ---------------------------------------------------------------------------
create table if not exists public.subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text,
  source text not null default 'waitlist'
    check (source in ('waitlist', 'newsletter', 'pricing', 'blog', 'other')),
  intent text,
  created_at timestamptz not null default now(),
  unique (email, source)
);

create index if not exists subscribers_email_idx on public.subscribers (email);
create index if not exists subscribers_created_idx on public.subscribers (created_at desc);

alter table public.subscribers enable row level security;
-- No public policies — only service role / dashboard reads.

-- ---------------------------------------------------------------------------
-- Marketing fleet JSON state (per auth owner)
-- ---------------------------------------------------------------------------
create table if not exists public.marketing_state (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.marketing_state enable row level security;

create policy "marketing_state_select_own"
  on public.marketing_state for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "marketing_state_upsert_own"
  on public.marketing_state for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "marketing_state_update_own"
  on public.marketing_state for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Inbound applications (deck URL or Storage path)
-- ---------------------------------------------------------------------------
create table if not exists public.inbound_applications (
  id text primary key,
  workspace_id uuid references public.workspaces (id) on delete set null,
  owner_id uuid references auth.users (id) on delete set null,
  company_name text not null,
  founder_name text,
  oneliner text,
  sector text,
  deck_url text,
  deck_storage_path text,
  deck_file_name text,
  deck_bytes integer,
  deck_sha256 text,
  created_at timestamptz not null default now()
);

alter table public.inbound_applications enable row level security;

create policy "inbound_select_own"
  on public.inbound_applications for select to authenticated
  using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Private Storage bucket for pitch decks (service role uploads)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'decks',
  'decks',
  false,
  8388608,
  array['application/pdf']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
