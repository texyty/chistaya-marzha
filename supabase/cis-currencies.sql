update public.profiles set base_currency = 'RUB' where base_currency not in ('RUB','BYN','KZT','AMD','KGS','UZS');
alter table public.profiles drop constraint if exists profiles_base_currency_check;
alter table public.profiles add constraint profiles_base_currency_check check (base_currency in ('RUB','BYN','KZT','AMD','KGS','UZS'));
