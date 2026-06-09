-- Phase 8: income tracking + per-category budgets.
--
-- (1) profiles.expected_monthly_income — a single number the user sets so
--     the cash-flow card can compare actual vs expected and chat can reason
--     about under/over earning. Stored as integer minor units of the
--     user's currency (same convention as monthly_budget).
--
-- (2) category_budgets — one budget cap per (user, category). Lets the
--     user set a cap like "Food: $400/mo" and Spends shows progress
--     against it. No month dimension — budgets are evergreen monthly
--     caps; user edits them whenever priorities change.

-- (1)
alter table public.profiles
  add column if not exists expected_monthly_income integer not null default 0;

-- (2)
create table if not exists public.category_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category in
    ('Food','Transport','Shopping','Entertainment','Other')),
  budget_amount integer not null default 0, -- minor units of profile currency
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category)
);

create index if not exists category_budgets_user_idx
  on public.category_budgets (user_id);

alter table public.category_budgets enable row level security;

drop policy if exists "category_budgets owner full access"
  on public.category_budgets;
create policy "category_budgets owner full access"
  on public.category_budgets for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

notify pgrst, 'reload schema';
