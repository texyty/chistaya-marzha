-- Server-only credentials storage. RLS is enabled and intentionally has no user policies.
create table if not exists public.marketplace_credentials_secure (
  marketplace_account_id uuid primary key references public.marketplace_accounts(id) on delete cascade,
  encrypted_access_token text not null,
  encrypted_refresh_token text not null,
  updated_at timestamptz not null default now()
);

alter table public.marketplace_credentials_secure enable row level security;
revoke all on public.marketplace_credentials_secure from anon, authenticated;

-- Service-role Edge Functions bypass RLS; signed-in browsers cannot read or write this table.
