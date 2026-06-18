-- Pocket — add 'daily_reminder' to the allowed nudge types.
-- Powers the once-a-day "log your spending" alert. The other alert types
-- (budget_warning, weekly_digest) already exist.

-- Drop the existing type CHECK constraint by whatever name it has, then
-- re-add it with the new value included.
do $$
declare cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'public.nudges'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%type%';
  if cname is not null then
    execute format('alter table public.nudges drop constraint %I', cname);
  end if;
end $$;

alter table public.nudges
  add constraint nudges_type_check
  check (type in ('budget_warning','goal_check','weekly_digest','personality','daily_reminder'));
