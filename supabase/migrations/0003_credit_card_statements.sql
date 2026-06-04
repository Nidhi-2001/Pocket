-- Phase 7: Credit card statement uploads.
-- Adds a `source` column to transactions so we know whether each row came
-- from an SMS, a statement PDF, or manual entry. Adds a `statement_uploads`
-- table to track upload history per user. Creates a private 'statements'
-- Storage bucket with per-user RLS.
--
-- Run once in the Supabase SQL Editor.

-- ===========================================================================
-- 1. transactions: add `source` column
-- ===========================================================================
alter table public.transactions
  add column if not exists source text not null default 'manual'
  check (source in ('sms', 'statement', 'manual'));

-- ===========================================================================
-- 2. statement_uploads: history of uploaded statement PDFs
-- ===========================================================================
create table if not exists public.statement_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  filename text not null,
  storage_path text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  transaction_count integer not null default 0,
  duplicates_skipped integer not null default 0,
  error_message text,
  uploaded_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists statement_uploads_user_idx
  on public.statement_uploads (user_id, uploaded_at desc);

alter table public.statement_uploads enable row level security;

drop policy if exists "statement_uploads owner full access"
  on public.statement_uploads;
create policy "statement_uploads owner full access"
  on public.statement_uploads for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ===========================================================================
-- 3. Storage bucket: 'statements' (private)
-- ===========================================================================
insert into storage.buckets (id, name, public)
values ('statements', 'statements', false)
on conflict (id) do nothing;

-- Per-user RLS policies on storage.objects scoped to the 'statements' bucket.
-- Convention: object name starts with the user's UUID, e.g. "<uuid>/2026-06-04-amex.pdf".

drop policy if exists "Users upload their own statements" on storage.objects;
create policy "Users upload their own statements"
  on storage.objects for insert
  with check (
    bucket_id = 'statements'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users read their own statements" on storage.objects;
create policy "Users read their own statements"
  on storage.objects for select
  using (
    bucket_id = 'statements'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users delete their own statements" on storage.objects;
create policy "Users delete their own statements"
  on storage.objects for delete
  using (
    bucket_id = 'statements'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
