grant usage on schema public to authenticated;
grant select on public.profiles, public.marketplace_accounts, public.subscriptions, public.sync_runs to authenticated;
grant update (display_name, updated_at) on public.profiles to authenticated;
