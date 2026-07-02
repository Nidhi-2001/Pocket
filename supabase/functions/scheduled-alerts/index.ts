// supabase/functions/scheduled-alerts/index.ts
//
// Server-side alert generator, meant to be invoked by pg_cron daily. Mirrors
// the client-side lib/nudges.ts logic but runs for ALL users with the service
// role, so alerts arrive even if the user never opens the app.
//
// Emits up to three deduped nudge types per user:
//   - daily_reminder : once/day — "log your spending"
//   - weekly_digest  : weekends only, once per 7 days — week's spend recap
//   - budget_warning : once/day, when month-to-date spend >= 80% of budget
//
// Auth: cron-only. The caller must send header `x-cron-secret: <CRON_SECRET>`
// (a function secret). Deployed with --no-verify-jwt so pg_cron can call it
// without a Supabase JWT. Optional body { user_id } limits to one user.

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// Constant-time compare so the cron secret can't be recovered via timing.
function secretEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BUDGET_ALERT_THRESHOLD = 0.8;

interface CurrencyInfo {
  symbol: string;
  decimals: number;
  locale: string;
}
const CURRENCY_INFO: Record<string, CurrencyInfo> = {
  USD: { symbol: '$',  decimals: 2, locale: 'en-US' },
  EUR: { symbol: '€',  decimals: 2, locale: 'de-DE' },
  GBP: { symbol: '£',  decimals: 2, locale: 'en-GB' },
  JPY: { symbol: '¥',  decimals: 0, locale: 'ja-JP' },
  INR: { symbol: '₹',  decimals: 2, locale: 'en-IN' },
  CNY: { symbol: '¥',  decimals: 2, locale: 'zh-CN' },
  AUD: { symbol: 'A$', decimals: 2, locale: 'en-AU' },
  CAD: { symbol: 'C$', decimals: 2, locale: 'en-CA' },
  CHF: { symbol: 'Fr', decimals: 2, locale: 'de-CH' },
  SGD: { symbol: 'S$', decimals: 2, locale: 'en-SG' },
  KRW: { symbol: '₩',  decimals: 0, locale: 'ko-KR' },
  AED: { symbol: 'د.إ', decimals: 2, locale: 'en-AE' },
};

function formatMoney(minorUnits: number, code: string): string {
  const info = CURRENCY_INFO[code] ?? CURRENCY_INFO.USD;
  const major = minorUnits / Math.pow(10, info.decimals);
  return new Intl.NumberFormat(info.locale, {
    style: 'currency',
    currency: code in CURRENCY_INFO ? code : 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: info.decimals,
  }).format(major);
}

interface NewNudge {
  user_id: string;
  type: string;
  message: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const CRON_SECRET = Deno.env.get('CRON_SECRET');
    if (!CRON_SECRET || !secretEqual(req.headers.get('x-cron-secret') ?? '', CRON_SECRET)) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));

    const targetUserIds: string[] | null = body?.user_id ? [body.user_id] : null;

    let profileQuery = admin
      .from('profiles')
      .select('id, monthly_budget, currency');
    if (targetUserIds) profileQuery = profileQuery.in('id', targetUserIds);
    const { data: profiles, error: profErr } = await profileQuery;
    if (profErr) {
      console.error('failed to fetch profiles:', profErr);
      return json({ error: 'Failed to fetch profiles' }, 500);
    }

    const now = new Date();
    const startOfToday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const dow = now.getUTCDay(); // 0 = Sun, 6 = Sat
    const isWeekend = dow === 0 || dow === 6;

    const toInsert: NewNudge[] = [];
    let considered = 0;

    for (const p of (profiles as any[]) ?? []) {
      considered++;
      const currency = (p.currency as string) ?? 'USD';
      const budget = (p.monthly_budget as number) ?? 0;

      const [{ data: recentNudges }, { data: monthDebits }] = await Promise.all([
        admin
          .from('nudges')
          .select('type, created_at')
          .eq('user_id', p.id)
          .gte('created_at', sevenDaysAgo.toISOString()),
        admin
          .from('transactions')
          .select('amount, category, transacted_at')
          .eq('user_id', p.id)
          .eq('transaction_type', 'debit')
          .gte('transacted_at', monthStart.toISOString()),
      ]);

      const nudges = recentNudges ?? [];
      const debits = monthDebits ?? [];
      const hasSince = (type: string, since: Date) =>
        nudges.some(
          (n: any) => n.type === type && new Date(n.created_at) >= since,
        );

      // 1. Daily reminder
      if (!hasSince('daily_reminder', startOfToday)) {
        toInsert.push({
          user_id: p.id,
          type: 'daily_reminder',
          message:
            "Spent anything today? Log it so your dashboard and budget stay accurate.",
        });
      }

      // 2. Weekend summary
      if (isWeekend && !hasSince('weekly_digest', sevenDaysAgo)) {
        const weekDebits = debits.filter(
          (t: any) => new Date(t.transacted_at) >= sevenDaysAgo,
        );
        if (weekDebits.length > 0) {
          const weekTotal = weekDebits.reduce((s: number, t: any) => s + t.amount, 0);
          const byCat: Record<string, number> = {};
          for (const t of weekDebits) byCat[t.category] = (byCat[t.category] ?? 0) + t.amount;
          const topCat = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Other';
          const count = weekDebits.length;
          toInsert.push({
            user_id: p.id,
            type: 'weekly_digest',
            message: `This week you spent ${formatMoney(weekTotal, currency)} across ${count} ${count === 1 ? 'purchase' : 'purchases'} — most on ${topCat}.`,
          });
        }
      }

      // 3. Budget warning
      if (budget > 0) {
        const mtdSpent = debits.reduce((s: number, t: any) => s + t.amount, 0);
        const ratio = mtdSpent / budget;
        if (ratio >= BUDGET_ALERT_THRESHOLD && !hasSince('budget_warning', startOfToday)) {
          const pct = Math.round(ratio * 100);
          toInsert.push({
            user_id: p.id,
            type: 'budget_warning',
            message: `You've spent ${formatMoney(mtdSpent, currency)} of your ${formatMoney(budget, currency)} budget (${pct}%). You're close to the limit — spend wisely.`,
          });
        }
      }
    }

    let inserted = 0;
    if (toInsert.length > 0) {
      const { error: insErr } = await admin.from('nudges').insert(toInsert);
      if (insErr) {
        console.error('insert error:', insErr);
        return json({ error: 'Insert failed', detail: insErr.message }, 500);
      }
      inserted = toInsert.length;

      // Best-effort device push for the alerts just created. Dormant until a
      // device build registers tokens in push_tokens; never fails the run.
      try {
        const userIds = [...new Set(toInsert.map((n) => n.user_id))];
        const { data: tokens } = await admin
          .from('push_tokens')
          .select('user_id, token')
          .in('user_id', userIds);
        const byUser: Record<string, string[]> = {};
        for (const t of (tokens as any[]) ?? []) {
          (byUser[t.user_id] ??= []).push(t.token);
        }
        const messages = toInsert.flatMap((n) =>
          (byUser[n.user_id] ?? []).map((to) => ({
            to,
            title: 'Pocket',
            body: n.message,
            sound: 'default',
          })),
        );
        if (messages.length > 0) {
          await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(messages),
          });
        }
      } catch (e) {
        console.warn('push send skipped:', e);
      }
    }

    return json({ usersConsidered: considered, alertsInserted: inserted });
  } catch (err: any) {
    console.error('Unexpected error:', err);
    return json({ error: 'Unexpected error', detail: String(err?.message ?? err) }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
