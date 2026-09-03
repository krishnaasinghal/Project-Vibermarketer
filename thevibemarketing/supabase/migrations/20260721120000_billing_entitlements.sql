-- Billing entitlements — source of paid plan truth for vibemarketer.
-- Access is granted ONLY via Dodo webhooks (or admin), never from /checkout/success alone.

create table if not exists public.billing_entitlements (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  tier text not null check (tier in ('free', 'solo', 'startup', 'pro', 'fleet')),
  status text not null default 'inactive'
    check (status in ('active', 'inactive', 'past_due', 'cancelled', 'trialing')),
  dodo_customer_id text,
  dodo_subscription_id text,
  dodo_payment_id text,
  product_id text,
  email text,
  current_period_end timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists billing_entitlements_subscription_idx
  on public.billing_entitlements (dodo_subscription_id)
  where dodo_subscription_id is not null;

create index if not exists billing_entitlements_email_idx
  on public.billing_entitlements (email)
  where email is not null;

alter table public.billing_entitlements enable row level security;

-- Users read only their own entitlement row.
drop policy if exists "billing_entitlements_select_own" on public.billing_entitlements;
create policy "billing_entitlements_select_own"
  on public.billing_entitlements
  for select
  to authenticated
  using ((select auth.uid()) = owner_id);

-- No insert/update/delete for authenticated clients — service role / webhooks only.

-- Idempotency log for processed Dodo webhook deliveries.
create table if not exists public.billing_webhook_events (
  webhook_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now(),
  owner_id uuid references auth.users (id) on delete set null,
  payload_summary jsonb not null default '{}'::jsonb
);

alter table public.billing_webhook_events enable row level security;
-- No policies for authenticated — service role only.
