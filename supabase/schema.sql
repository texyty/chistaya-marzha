-- Database schema for Chistaya Marzha. Run once in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  plan text not null default 'trial' check (plan in ('trial','starter','pro','expired')),
  trial_ends_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.marketplace_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('ozon','wildberries','yandex_market')),
  external_account_id text,
  account_name text,
  status text not null default 'pending' check (status in ('pending','connected','error','disconnected')),
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id, provider, external_account_id)
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text,
  provider_subscription_id text unique,
  plan text not null check (plan in ('starter','pro')),
  status text not null check (status in ('pending','active','past_due','cancelled','expired')),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sync_runs (
  id bigint generated always as identity primary key,
  marketplace_account_id uuid not null references public.marketplace_accounts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('queued','running','completed','failed')),
  records_processed integer not null default 0,
  error_message text,
  started_at timestamptz default now(),
  finished_at timestamptz
);

-- Tokens never live in the public API schema.
create schema if not exists private;
create table private.marketplace_credentials (
  marketplace_account_id uuid primary key references public.marketplace_accounts(id) on delete cascade,
  encrypted_access_token text not null,
  encrypted_refresh_token text,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.marketplace_accounts enable row level security;
alter table public.subscriptions enable row level security;
alter table public.sync_runs enable row level security;

create policy "read own profile" on public.profiles for select using (auth.uid() = id);
create policy "update own profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "read own marketplace accounts" on public.marketplace_accounts for select using (auth.uid() = user_id);
create policy "read own subscriptions" on public.subscriptions for select using (auth.uid() = user_id);
create policy "read own sync history" on public.sync_runs for select using (auth.uid() = user_id);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end; $$;

create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create index marketplace_accounts_user_idx on public.marketplace_accounts(user_id);
create index subscriptions_user_idx on public.subscriptions(user_id);
create index sync_runs_account_idx on public.sync_runs(marketplace_account_id, started_at desc);
