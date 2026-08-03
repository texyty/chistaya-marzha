alter table public.profiles add column if not exists base_currency text not null default 'RUB';
alter table public.profiles add column if not exists country_code text not null default 'RU';
alter table public.profiles add column if not exists tax_mode text not null default 'ru_usn_income';
alter table public.profiles add column if not exists tax_rate numeric(6,3) not null default 6;

alter table public.profiles drop constraint if exists profiles_base_currency_check;
alter table public.profiles add constraint profiles_base_currency_check check (base_currency in ('RUB','USD','EUR','KZT','BYN','CNY','AED','TRY'));
alter table public.profiles drop constraint if exists profiles_tax_mode_check;
alter table public.profiles add constraint profiles_tax_mode_check check (tax_mode in ('ru_usn_income','ru_usn_profit','vat','turnover','profit','custom','none'));

grant update (base_currency, country_code, tax_mode, tax_rate, updated_at) on public.profiles to authenticated;
