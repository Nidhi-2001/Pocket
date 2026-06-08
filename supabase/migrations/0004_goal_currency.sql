-- Goals can now be in any supported currency, independent of the user's
-- profile currency. Useful for travel goals or saving toward a foreign
-- purchase. Existing goals default to USD; users can change a goal's
-- currency at create time only (changing it later would require a
-- conversion we don't want to do).

alter table public.goals
  add column if not exists currency text not null default 'USD'
  check (currency in (
    'USD','EUR','GBP','JPY','INR','CNY',
    'AUD','CAD','CHF','SGD','KRW','AED'
  ));
