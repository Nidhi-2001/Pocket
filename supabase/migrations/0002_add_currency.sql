-- Adds per-user currency selection. Pocket is no longer India-specific; any
-- user worldwide picks their currency on signup (or changes it later from
-- Profile). All monetary amounts in the app are stored as integer MINOR
-- UNITS of the user's chosen currency (cents for USD, paise for INR, yen
-- for JPY since JPY has no minor unit, etc.).
--
-- Run once in the Supabase SQL Editor.

alter table public.profiles
  add column if not exists currency text not null default 'USD'
  check (currency in (
    'USD','EUR','GBP','JPY','INR','CNY',
    'AUD','CAD','CHF','SGD','KRW','AED'
  ));

-- Refresh the signup trigger so new users default to USD with a $2,000
-- monthly budget. Existing users keep whatever they already had.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, phone, monthly_budget, currency)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', 'there'),
    coalesce(new.phone, ''),
    200000,   -- 200,000 cents = $2,000 — sensible USD default
    'USD'
  );
  return new;
end;
$$;
