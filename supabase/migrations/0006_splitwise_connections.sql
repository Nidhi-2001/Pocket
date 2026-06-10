-- Pocket — Splitwise per-user OAuth connections
-- Stores each user's Splitwise access token so splitwise-balances /
-- splitwise-import can act on their behalf. Token is written by the
-- splitwise-oauth edge function after the OAuth code exchange.

create table public.splitwise_connections (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  access_token text not null,
  splitwise_user_id bigint,
  connected_at timestamptz not null default now()
);

alter table public.splitwise_connections enable row level security;

-- Owner-only, scoped to auth.uid() — same default-deny pattern as every
-- other table in the schema.
create policy "splitwise_connections owner full access"
  on public.splitwise_connections for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
