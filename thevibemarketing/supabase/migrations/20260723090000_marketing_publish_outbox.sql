-- Durable publish attempts + outbox jobs for HITL social publishing.
-- Tenant boundary: every row is owned by auth.uid via owner_id and enforced with RLS.

create table if not exists public.marketing_publish_attempts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  post_id text not null,
  content_revision_key text not null,
  provider text not null check (
    provider in ('x', 'linkedin', 'reddit', 'other')
  ),
  provider_account_id text not null,
  idempotency_key text not null,
  request_hash text not null,
  status text not null default 'pending' check (
    status in (
      'pending',
      'executing',
      'provider_succeeded',
      'outcome_unknown',
      'retryable_failure',
      'permanent_failure',
      'published',
      'cancelled'
    )
  ),
  provider_post_id text,
  provider_url text,
  provider_response jsonb,
  attempt_count integer not null default 0,
  last_error_code text,
  last_error_message text,
  outcome_unknown boolean not null default false,
  next_retry_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists marketing_publish_attempts_owner_id_idempotency_key_uq
  on public.marketing_publish_attempts (owner_id, idempotency_key);
create unique index if not exists marketing_publish_attempts_owner_post_provider_revision_uq
  on public.marketing_publish_attempts (owner_id, post_id, provider, provider_account_id, content_revision_key);
create index if not exists marketing_publish_attempts_owner_status_idx
  on public.marketing_publish_attempts (owner_id, status, updated_at desc);

alter table public.marketing_publish_attempts
  enable row level security;

drop policy if exists marketing_publish_attempts_select_own on public.marketing_publish_attempts;
create policy marketing_publish_attempts_select_own
  on public.marketing_publish_attempts for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists marketing_publish_attempts_insert_own on public.marketing_publish_attempts;
create policy marketing_publish_attempts_insert_own
  on public.marketing_publish_attempts for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists marketing_publish_attempts_update_own on public.marketing_publish_attempts;
create policy marketing_publish_attempts_update_own
  on public.marketing_publish_attempts for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- Outbox jobs intentionally keep one job per attempt per job_type.
create table if not exists public.marketing_outbox_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  attempt_id uuid not null references public.marketing_publish_attempts (id) on delete cascade,
  job_type text not null check (job_type in ('publish', 'confirm_publish') ),
  status text not null default 'pending' check (
    status in (
      'pending',
      'leased',
      'completed',
      'retryable_failure',
      'dead_letter',
      'cancelled'
    )
  ),
  available_at timestamptz not null default now(),
  lease_owner text,
  lease_expires_at timestamptz,
  attempt_count integer not null default 0,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (attempt_id, job_type)
);

create index if not exists marketing_outbox_jobs_owner_status_idx
  on public.marketing_outbox_jobs (owner_id, status, available_at);
create index if not exists marketing_outbox_jobs_attempt_idx
  on public.marketing_outbox_jobs (attempt_id);

alter table public.marketing_outbox_jobs
  enable row level security;

drop policy if exists marketing_outbox_jobs_select_own on public.marketing_outbox_jobs;
create policy marketing_outbox_jobs_select_own
  on public.marketing_outbox_jobs for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists marketing_outbox_jobs_insert_own on public.marketing_outbox_jobs;
create policy marketing_outbox_jobs_insert_own
  on public.marketing_outbox_jobs for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists marketing_outbox_jobs_update_own on public.marketing_outbox_jobs;
create policy marketing_outbox_jobs_update_own
  on public.marketing_outbox_jobs for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create or replace function public.create_or_reuse_marketing_publish_attempt(
  p_owner_id uuid,
  p_post_id text,
  p_content_revision_key text,
  p_provider text,
  p_provider_account_id text,
  p_idempotency_key text,
  p_request_hash text
)
returns table(
  attempt jsonb,
  outbox_job jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_owner_id is null then
    raise exception 'owner required';
  end if;
  if p_post_id is null or btrim(p_post_id) = '' then
    raise exception 'post_id required';
  end if;
  if p_provider is null or btrim(p_provider) = '' then
    raise exception 'provider required';
  end if;
  if p_provider_account_id is null or btrim(p_provider_account_id) = '' then
    raise exception 'provider_account_id required';
  end if;

  insert into public.marketing_publish_attempts (
    owner_id,
    post_id,
    content_revision_key,
    provider,
    provider_account_id,
    idempotency_key,
    request_hash,
    status
  ) values (
    p_owner_id,
    btrim(p_post_id),
    p_content_revision_key,
    lower(btrim(p_provider)),
    btrim(p_provider_account_id),
    btrim(p_idempotency_key),
    btrim(p_request_hash),
    'pending'
  )
  on conflict (owner_id, idempotency_key) do update
  set
    updated_at = now()
  where marketing_publish_attempts.post_id = excluded.post_id
    and marketing_publish_attempts.content_revision_key = excluded.content_revision_key
    and marketing_publish_attempts.provider = excluded.provider
    and marketing_publish_attempts.provider_account_id = excluded.provider_account_id
    and marketing_publish_attempts.request_hash = excluded.request_hash
  returning to_jsonb(marketing_publish_attempts.*)
  into attempt;

  if attempt is null then
    select to_jsonb(a.*) into attempt
    from public.marketing_publish_attempts a
    where a.owner_id = p_owner_id and a.idempotency_key = btrim(p_idempotency_key)
      and a.post_id = btrim(p_post_id)
      and a.content_revision_key = p_content_revision_key
      and a.provider = lower(btrim(p_provider))
      and a.provider_account_id = btrim(p_provider_account_id)
      and a.request_hash = btrim(p_request_hash)
    limit 1;
  end if;

  if attempt is null then
    raise exception 'publish attempt idempotency conflict for owner %, key %', p_owner_id, btrim(p_idempotency_key)
      using errcode = '23505';
  end if;

  insert into public.marketing_outbox_jobs (
    owner_id,
    attempt_id,
    job_type,
    status,
    available_at
  )
  values (
    p_owner_id,
    (attempt ->> 'id')::uuid,
    'publish',
    'pending',
    now()
  )
  on conflict (attempt_id, job_type) do update
  set
    status = CASE
      WHEN marketing_outbox_jobs.status IN ('completed', 'dead_letter', 'leased', 'retryable_failure', 'cancelled', 'outcome_unknown') THEN marketing_outbox_jobs.status
      ELSE 'pending'
    END,
    lease_owner = CASE
      WHEN marketing_outbox_jobs.status IN ('completed', 'dead_letter', 'leased', 'retryable_failure', 'cancelled', 'outcome_unknown') THEN marketing_outbox_jobs.lease_owner
      ELSE NULL
    END,
    lease_expires_at = CASE
      WHEN marketing_outbox_jobs.status IN ('completed', 'dead_letter', 'leased', 'retryable_failure', 'cancelled', 'outcome_unknown') THEN marketing_outbox_jobs.lease_expires_at
      ELSE NULL
    END,
    available_at = CASE
      WHEN marketing_outbox_jobs.status IN ('completed', 'dead_letter', 'leased', 'retryable_failure', 'cancelled', 'outcome_unknown') THEN marketing_outbox_jobs.available_at
      ELSE now()
    END,
    updated_at = now(),
    last_error_code = CASE
      WHEN marketing_outbox_jobs.status IN ('completed', 'dead_letter', 'leased', 'retryable_failure', 'cancelled', 'outcome_unknown') THEN marketing_outbox_jobs.last_error_code
      ELSE NULL
    END,
    last_error_message = CASE
      WHEN marketing_outbox_jobs.status IN ('completed', 'dead_letter', 'leased', 'retryable_failure', 'cancelled', 'outcome_unknown') THEN marketing_outbox_jobs.last_error_message
      ELSE NULL
    END
  returning to_jsonb(marketing_outbox_jobs.*)
  into outbox_job;

  if outbox_job is null then
    select to_jsonb(j.*) into outbox_job
    from public.marketing_outbox_jobs j
    where j.attempt_id = (attempt ->> 'id')::uuid
      and j.job_type = 'publish'
    limit 1;
  end if;

  return query select attempt, outbox_job;
end;
$$;

create or replace function public.claim_marketing_outbox_job(
  p_lease_owner text,
  p_lease_milliseconds integer default 30000
)
returns setof public.marketing_outbox_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id text := coalesce(nullif(btrim(p_lease_owner), ''), 'worker');
  v_lease_ms integer := greatest(coalesce(p_lease_milliseconds, 30000), 5000);
  now_ts timestamptz := now();
begin
  return query
  with candidate as (
    select j.id
    from public.marketing_outbox_jobs j
    where j.status in ('pending', 'retryable_failure')
      and j.available_at <= now_ts
      and (j.lease_expires_at is null or j.lease_expires_at <= now_ts)
    order by j.available_at asc, j.created_at asc
    limit 1
    for update skip locked
  )
  update public.marketing_outbox_jobs j
    set
      status = 'leased',
      lease_owner = v_owner_id,
      lease_expires_at = now_ts + (v_lease_ms || ' milliseconds')::interval,
      attempt_count = j.attempt_count + 1,
      updated_at = now()
    from candidate c
    where j.id = c.id
    returning j.*;
end;
$$;

create or replace function public.release_expired_marketing_outbox_leases()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  update public.marketing_outbox_jobs j
    set
      status = CASE
        WHEN j.status = 'leased' THEN 'pending'
        ELSE j.status
      END,
      lease_owner = CASE
        WHEN j.status = 'leased' THEN NULL
        ELSE j.lease_owner
      END,
      lease_expires_at = CASE
        WHEN j.status = 'leased' THEN NULL
        ELSE j.lease_expires_at
      END,
      updated_at = now()
    where j.status = 'leased' and j.lease_expires_at is not null and j.lease_expires_at <= now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on table public.marketing_publish_attempts is 'Durable publishing attempts per owner+post+provider account/revision.';
comment on table public.marketing_outbox_jobs is 'Outbox jobs for publish attempts and retry/retry ownership control.';
comment on function public.create_or_reuse_marketing_publish_attempt(uuid, text, text, text, text, text, text)
is 'Atomically create or reuse an owner-scoped publish attempt and matching outbox job. Tenant boundary is owner_id.';
comment on function public.claim_marketing_outbox_job(text, integer)
is 'Atomically claim one runnable publish outbox job and assign worker lease.';
comment on function public.release_expired_marketing_outbox_leases()
is 'Release expired outbox leases for durable worker recovery.';
