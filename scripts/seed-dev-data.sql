-- scripts/seed-dev-data.sql
--
-- Inserts 50 realistic synthetic transactions for ONE user, so the app's
-- Home / Spends / Chat have real-looking data to show.
--
-- Mix:
--   - 20 Food, 11 Transport, 8 Shopping, 7 Entertainment, 4 Other
--   - 1 salary credit, 49 debits
--   - Dates span 2026-05-08 to 2026-06-03 (the current month + late May)
--   - Amounts realistic for a young professional / student in India
--
-- All amounts in PAISE (₹1 = 100). All timestamps in IST (+05:30).
--
-- USAGE:
--   1. Open Supabase Dashboard → SQL Editor → New query
--   2. Update the email below if you signed up with something different
--   3. Paste this whole file → Run
--   4. Hard refresh the app — your dashboard fills up
--
-- The INSERT uses ON CONFLICT DO NOTHING so re-running won't duplicate
-- existing rows (matched on the same user/amount/merchant/timestamp dedup
-- key we use in production).

do $$
declare
  uid uuid;
begin
  -- ── EDIT THIS LINE if you signed in with a different email ─────────────
  select id into uid
  from auth.users
  where email = 'lade.ni@northeastern.edu'
  limit 1;

  if uid is null then
    raise exception
      'No user found with that email. Edit the email in this script and re-run.';
  end if;

  insert into public.transactions
    (user_id, amount, merchant, category, transaction_type, transacted_at, raw_sms)
  values
    -- ── Early May ──────────────────────────────────────────────────────
    (uid,  35000, 'Dominos',        'Food',          'debit',  '2026-05-08T18:12:00+05:30', 'synthetic'),
    (uid,  18000, 'Uber',           'Transport',     'debit',  '2026-05-09T14:33:00+05:30', 'synthetic'),
    (uid,  29000, 'Starbucks',      'Food',          'debit',  '2026-05-10T11:05:00+05:30', 'synthetic'),
    (uid,  42500, 'Swiggy',         'Food',          'debit',  '2026-05-10T21:17:00+05:30', 'synthetic'),
    (uid,  12000, 'Ola',            'Transport',     'debit',  '2026-05-11T09:48:00+05:30', 'synthetic'),
    (uid,  80000, 'BookMyShow',     'Entertainment', 'debit',  '2026-05-12T19:32:00+05:30', 'synthetic'),
    (uid,  21000, 'Uber',           'Transport',     'debit',  '2026-05-12T22:06:00+05:30', 'synthetic'),
    (uid,  38000, 'Subway',         'Food',          'debit',  '2026-05-13T13:14:00+05:30', 'synthetic'),
    (uid, 149900, 'Amazon',         'Shopping',      'debit',  '2026-05-14T10:32:00+05:30', 'synthetic'),
    (uid,  65000, 'Zomato',         'Food',          'debit',  '2026-05-15T20:35:00+05:30', 'synthetic'),

    -- ── Mid May ────────────────────────────────────────────────────────
    (uid, 210000, 'Nykaa',          'Shopping',      'debit',  '2026-05-16T16:08:00+05:30', 'synthetic'),
    (uid,  20000, 'Metro Card',     'Transport',     'debit',  '2026-05-17T07:35:00+05:30', 'synthetic'),
    (uid,  89000, 'Pizza Hut',      'Food',          'debit',  '2026-05-17T19:47:00+05:30', 'synthetic'),
    (uid,  48000, 'Blinkit',        'Food',          'debit',  '2026-05-18T12:33:00+05:30', 'synthetic'),
    (uid,  29900, 'Hotstar',        'Entertainment', 'debit',  '2026-05-18T22:34:00+05:30', 'synthetic'),
    (uid,  56000, 'Swiggy',         'Food',          'debit',  '2026-05-19T18:06:00+05:30', 'synthetic'),
    (uid,   8500, 'Rapido',         'Transport',     'debit',  '2026-05-19T21:11:00+05:30', 'synthetic'),
    (uid, 150000, 'HP Petrol',      'Transport',     'debit',  '2026-05-20T11:46:00+05:30', 'synthetic'),
    (uid, 289000, 'Myntra',         'Shopping',      'debit',  '2026-05-20T17:31:00+05:30', 'synthetic'),
    (uid,  21000, 'Cafe Coffee Day','Food',          'debit',  '2026-05-21T08:36:00+05:30', 'synthetic'),

    -- ── Late May ───────────────────────────────────────────────────────
    (uid, 120000, 'PVR',            'Entertainment', 'debit',  '2026-05-21T19:08:00+05:30', 'synthetic'),
    (uid, 185000, 'BigBasket',      'Food',          'debit',  '2026-05-22T13:36:00+05:30', 'synthetic'),
    (uid,  11900, 'Spotify',        'Entertainment', 'debit',  '2026-05-22T16:49:00+05:30', 'synthetic'),
    (uid, 899000, 'Croma',          'Shopping',      'debit',  '2026-05-23T10:08:00+05:30', 'synthetic'),
    (uid,  34000, 'Zomato',         'Food',          'debit',  '2026-05-24T19:34:00+05:30', 'synthetic'),
    (uid,  19500, 'Uber',           'Transport',     'debit',  '2026-05-25T14:09:00+05:30', 'synthetic'),
    (uid,  49900, 'Netflix',        'Entertainment', 'debit',  '2026-05-25T21:33:00+05:30', 'synthetic'),
    (uid,5000000, 'Northeastern',   'Other',         'credit', '2026-05-26T09:11:00+05:30', 'synthetic'), -- monthly salary
    (uid,  46000, 'Swiggy',         'Food',          'debit',  '2026-05-26T18:38:00+05:30', 'synthetic'),
    (uid,  54000, 'Swiggy',         'Food',          'debit',  '2026-05-27T19:36:00+05:30', 'synthetic'),
    (uid, 345000, 'Ajio',           'Shopping',      'debit',  '2026-05-28T18:32:00+05:30', 'synthetic'),
    (uid,  72000, 'Dominos',        'Food',          'debit',  '2026-05-28T22:14:00+05:30', 'synthetic'),
    (uid,  15000, 'Ola',            'Transport',     'debit',  '2026-05-29T11:09:00+05:30', 'synthetic'),
    (uid,  28000, 'Subway',         'Food',          'debit',  '2026-05-29T19:11:00+05:30', 'synthetic'),
    (uid, 240000, 'Decathlon',      'Shopping',      'debit',  '2026-05-30T14:34:00+05:30', 'synthetic'),
    (uid,   9900, 'JioSaavn',       'Entertainment', 'debit',  '2026-05-30T21:04:00+05:30', 'synthetic'),
    (uid,  54000, 'KFC',            'Food',          'debit',  '2026-05-31T13:08:00+05:30', 'synthetic'),
    (uid,  79900, 'Jio Recharge',   'Other',         'debit',  '2026-05-31T17:13:00+05:30', 'synthetic'),

    -- ── Early June (current period) ────────────────────────────────────
    (uid,  25000, 'Metro Card',     'Transport',     'debit',  '2026-06-01T08:18:00+05:30', 'synthetic'),
    (uid,  39000, 'Burger King',    'Food',          'debit',  '2026-06-01T13:31:00+05:30', 'synthetic'),
    (uid, 129000, 'Amazon',         'Shopping',      'debit',  '2026-06-01T20:05:00+05:30', 'synthetic'),
    (uid, 185000, 'BESCOM',         'Other',         'debit',  '2026-06-02T10:11:00+05:30', 'synthetic'), -- electricity
    (uid,  31000, 'Zomato',         'Food',          'debit',  '2026-06-02T15:33:00+05:30', 'synthetic'),
    (uid,  24000, 'Uber',           'Transport',     'debit',  '2026-06-02T19:37:00+05:30', 'synthetic'),
    (uid,  65000, 'Inox',           'Entertainment', 'debit',  '2026-06-02T22:09:00+05:30', 'synthetic'),
    (uid,  42000, 'Starbucks',      'Food',          'debit',  '2026-06-03T08:34:00+05:30', 'synthetic'),
    (uid,  38000, 'Swiggy',         'Food',          'debit',  '2026-06-03T12:36:00+05:30', 'synthetic'),
    (uid, 429000, 'Flipkart',       'Shopping',      'debit',  '2026-06-03T15:04:00+05:30', 'synthetic'),
    (uid,  11000, 'Rapido',         'Transport',     'debit',  '2026-06-03T17:12:00+05:30', 'synthetic'),
    (uid, 350000, 'LIC',            'Other',         'debit',  '2026-06-03T19:08:00+05:30', 'synthetic')

  on conflict (user_id, amount, merchant, transacted_at) do nothing;

  raise notice 'Synthetic data seeded for user %', uid;
end $$;
