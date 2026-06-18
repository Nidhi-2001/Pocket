-- Pocket — device push tokens for real OS notifications (native builds only).
-- The scheduled-alerts function pushes to these via Expo's push API. Empty
-- until a device dev build registers a token (web can't produce one).

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null,
  platform text,
  created_at timestamptz not null default now(),
  unique (user_id, token)
);

alter table public.push_tokens enable row level security;

create policy "push_tokens owner full access"
  on public.push_tokens for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
