-- Pocket — schedule the server-side alert generator via pg_cron.
--
-- This drives daily_reminder / weekly_digest / budget_warning nudges even when
-- the user never opens the app (the client also runs lib/nudges.ts on open).
--
-- Prerequisites (do these once, out of band — the real secret is NOT committed):
--   1. Deploy the function WITHOUT jwt verification so cron can reach it:
--        supabase functions deploy scheduled-alerts --no-verify-jwt
--   2. Set its shared secret:
--        supabase secrets set CRON_SECRET=<random-hex>
--   3. Replace <CRON_SECRET> and <PROJECT_REF> below with real values, then run.
--      (For production, prefer reading the secret from Supabase Vault instead of
--       inlining it in the cron command.)

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Idempotent: drop any prior schedule before (re)creating.
select cron.unschedule('pocket-daily-alerts')
  where exists (select 1 from cron.job where jobname = 'pocket-daily-alerts');

-- Daily at 13:00 UTC. The function only emits the weekend digest on Sat/Sun and
-- the budget warning at >=80% of budget, so one daily job covers all three.
select cron.schedule('pocket-daily-alerts', '0 13 * * *', $CRON$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/scheduled-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body := '{}'::jsonb
  );
$CRON$);
