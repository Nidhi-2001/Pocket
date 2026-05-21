-- Pocket — initial schema
-- Run once in the Supabase SQL Editor on a fresh project.

-- =============================================================================
-- TABLES
-- =============================================================================

-- profiles — one row per app user. Linked 1:1 to auth.users.
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  name text not null,
  phone text not null,
  monthly_budget integer not null default 2000000, -- ₹20,000 default, in paise
  created_at timestamptz not null default now()
);

-- transactions — parsed from SMS, displayed across home/spends/detail screens.
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null,                               -- in paise (₹1 = 100)
  merchant text not null,
  category text not null check (category in
    ('Food','Transport','Shopping','Entertainment','Other')),
  transaction_type text not null check (transaction_type in ('debit','credit')),
  raw_sms text,                                          -- original SMS for debugging
  transacted_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, amount, merchant, transacted_at)      -- dedup
);
create index transactions_user_transacted_at_idx
  on public.transactions (user_id, transacted_at desc);

-- goals — user's savings goals with progress.
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  emoji text not null default '🎯',
  target_amount integer not null,                        -- in paise
  current_amount integer not null default 0,
  deadline date,
  status text not null default 'active'
    check (status in ('active','completed','paused')),
  created_at timestamptz not null default now()
);
create index goals_user_status_idx on public.goals (user_id, status);

-- splits — group expense settlements between friends.
create table public.splits (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  total_amount integer not null,                         -- in paise
  status text not null default 'pending'
    check (status in ('pending','settled')),
  created_at timestamptz not null default now()
);

create table public.split_members (
  id uuid primary key default gen_random_uuid(),
  split_id uuid not null references public.splits(id) on delete cascade,
  name text not null,
  amount_owed integer not null,
  paid boolean not null default false
);
create index split_members_split_idx on public.split_members (split_id);

-- nudges — AI-generated notifications shown on home and in notification drawer.
create table public.nudges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in
    ('budget_warning','goal_check','weekly_digest','personality')),
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index nudges_user_read_idx on public.nudges (user_id, read, created_at desc);

-- personalities — generated monthly by Mistral; one row per user per month.
create table public.personalities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  month text not null,                                   -- format: 'YYYY-MM'
  type text not null,                                    -- e.g. 'weekend_splurger'
  title text not null,                                   -- e.g. 'The Weekend Splurger'
  emoji text not null,
  insights jsonb not null,                               -- string[]
  actions jsonb not null,                                -- string[]
  created_at timestamptz not null default now(),
  unique (user_id, month)
);

-- =============================================================================
-- ROW-LEVEL SECURITY (RLS)
--   Default-deny. Every authenticated request is scoped to auth.uid().
-- =============================================================================

alter table public.profiles        enable row level security;
alter table public.transactions    enable row level security;
alter table public.goals           enable row level security;
alter table public.splits          enable row level security;
alter table public.split_members   enable row level security;
alter table public.nudges          enable row level security;
alter table public.personalities   enable row level security;

-- profiles: a user can read + write their own row only.
create policy "profiles owner full access"
  on public.profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- transactions / goals / nudges / personalities: scoped by user_id.
create policy "transactions owner full access"
  on public.transactions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "goals owner full access"
  on public.goals for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "nudges owner full access"
  on public.nudges for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "personalities owner full access"
  on public.personalities for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- splits: only the creator can read/write the parent row. MVP simplification —
-- we can extend later to let invited members view shared splits.
create policy "splits creator full access"
  on public.splits for all
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

-- split_members: accessible only via the parent split's creator.
create policy "split_members via parent split"
  on public.split_members for all
  using (
    exists (
      select 1 from public.splits s
      where s.id = split_members.split_id and s.created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.splits s
      where s.id = split_members.split_id and s.created_by = auth.uid()
    )
  );

-- =============================================================================
-- AUTO-CREATE PROFILE ON SIGNUP
--   Trigger fires after a row lands in auth.users. It seeds a profiles row so
--   the app always has a profile to read once auth completes.
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, phone, monthly_budget)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', 'there'),
    coalesce(new.phone, ''),
    2000000
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
