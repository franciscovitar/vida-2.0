-- Finance OS V1 core store
-- Dedicated Supabase project only. No personal data belongs in Git.
-- Public Data API roles are explicitly denied; Vida accesses through a server-only
-- credential after its own authenticated allowlist check.

create extension if not exists pgcrypto;

create table if not exists public.finance_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  institution text not null,
  display_name text not null,
  account_type text not null check (
    account_type in ('bank', 'wallet', 'cash', 'credit_card', 'liability', 'clearing')
  ),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  ownership text not null check (
    ownership in ('owned', 'shared', 'external_liability', 'clearing')
  ),
  beneficial_scope text not null check (
    beneficial_scope in ('personal', 'business_pass_through', 'family_pass_through', 'mixed')
  ),
  liquidity_class text not null check (
    liquidity_class in ('immediate', 'near_term', 'illiquid', 'liability')
  ),
  source_adapter text,
  external_ref_hash text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_key, institution, display_name, currency)
);

create table if not exists public.finance_import_batches (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  account_id uuid not null references public.finance_accounts(id),
  source text not null,
  period_start date,
  period_end date,
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  evidence_ref text,
  imported_at timestamptz not null default now(),
  status text not null check (status in ('pending', 'parsed', 'reconciled', 'conflict', 'failed')),
  row_count integer check (row_count is null or row_count >= 0),
  created_at timestamptz not null default now(),
  unique (owner_key, source, account_id, source_hash)
);

create table if not exists public.finance_transactions (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  occurred_at timestamptz not null,
  description text not null,
  status text not null default 'posted' check (status in ('draft', 'posted', 'void')),
  confidence numeric(4, 3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  review_state text not null default 'review_required' check (
    review_state in ('resolved', 'review_required', 'not_applicable')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_raw_transactions (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  batch_id uuid not null references public.finance_import_batches(id) on delete restrict,
  account_id uuid not null references public.finance_accounts(id) on delete restrict,
  source_transaction_id text,
  occurred_at timestamptz,
  description text,
  amount_minor bigint,
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  balance_after_minor bigint,
  raw_payload jsonb not null default '{}'::jsonb,
  raw_hash text not null check (raw_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (batch_id, raw_hash)
);

create unique index if not exists finance_raw_transactions_source_id_unique
  on public.finance_raw_transactions(owner_key, account_id, source_transaction_id)
  where source_transaction_id is not null;

create table if not exists public.finance_transaction_sources (
  owner_key text not null,
  transaction_id uuid not null references public.finance_transactions(id) on delete cascade,
  raw_transaction_id uuid not null references public.finance_raw_transactions(id) on delete restrict,
  primary key (transaction_id, raw_transaction_id),
  unique (raw_transaction_id)
);

create table if not exists public.finance_postings (
  owner_key text not null,
  transaction_id uuid not null references public.finance_transactions(id) on delete cascade,
  line_no smallint not null check (line_no > 0),
  account_id uuid not null references public.finance_accounts(id) on delete restrict,
  amount_minor bigint not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  category_key text,
  economic_role text not null check (
    economic_role in (
      'income_work',
      'income_family_support',
      'expense_personal',
      'expense_professional',
      'reimbursement',
      'internal_transfer',
      'liability_settlement',
      'business_pass_through',
      'family_pass_through',
      'refund_adjustment',
      'unknown_review'
    )
  ),
  memo text,
  created_at timestamptz not null default now(),
  primary key (transaction_id, line_no)
);

create table if not exists public.finance_reconciliations (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  account_id uuid not null references public.finance_accounts(id) on delete restrict,
  as_of timestamptz not null,
  source_balance_minor bigint not null,
  ledger_balance_minor bigint not null,
  difference_minor bigint generated always as (ledger_balance_minor - source_balance_minor) stored,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null check (status in ('reconciled', 'partial', 'conflict', 'stale')),
  evidence_ref text,
  created_at timestamptz not null default now(),
  unique (owner_key, account_id, as_of)
);

create table if not exists public.finance_rules (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  priority integer not null default 100,
  match_type text not null,
  match_value text not null,
  action_json jsonb not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.finance_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists finance_accounts_set_updated_at on public.finance_accounts;
create trigger finance_accounts_set_updated_at
before update on public.finance_accounts
for each row execute function public.finance_set_updated_at();

drop trigger if exists finance_transactions_set_updated_at on public.finance_transactions;
create trigger finance_transactions_set_updated_at
before update on public.finance_transactions
for each row execute function public.finance_set_updated_at();

drop trigger if exists finance_rules_set_updated_at on public.finance_rules;
create trigger finance_rules_set_updated_at
before update on public.finance_rules
for each row execute function public.finance_set_updated_at();

alter table public.finance_accounts enable row level security;
alter table public.finance_import_batches enable row level security;
alter table public.finance_transactions enable row level security;
alter table public.finance_raw_transactions enable row level security;
alter table public.finance_transaction_sources enable row level security;
alter table public.finance_postings enable row level security;
alter table public.finance_reconciliations enable row level security;
alter table public.finance_rules enable row level security;

alter table public.finance_accounts force row level security;
alter table public.finance_import_batches force row level security;
alter table public.finance_transactions force row level security;
alter table public.finance_raw_transactions force row level security;
alter table public.finance_transaction_sources force row level security;
alter table public.finance_postings force row level security;
alter table public.finance_reconciliations force row level security;
alter table public.finance_rules force row level security;

revoke all on table public.finance_accounts from anon, authenticated;
revoke all on table public.finance_import_batches from anon, authenticated;
revoke all on table public.finance_transactions from anon, authenticated;
revoke all on table public.finance_raw_transactions from anon, authenticated;
revoke all on table public.finance_transaction_sources from anon, authenticated;
revoke all on table public.finance_postings from anon, authenticated;
revoke all on table public.finance_reconciliations from anon, authenticated;
revoke all on table public.finance_rules from anon, authenticated;

-- Deliberately no anon/authenticated RLS policies.
-- The dedicated project's service role is consumed only by Vida server code.
