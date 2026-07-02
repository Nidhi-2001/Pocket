// supabase/functions/generate-insights/index.ts
//
// Proactive AI insight generator. Produces ONE number-grounded observation per
// user per day (Groq llama-3.3-70b), stored in public.insights and surfaced on
// Home. Dual-mode:
//   - user JWT  → generate/return THIS user's insight (called on Home open)
//   - x-cron-secret header → process ALL users (daily pg_cron)
// Deployed with --no-verify-jwt; user calls are still verified via getUser.
//
// Request (user mode): {} → Response: { insight: row | null }
// Request (cron mode): header x-cron-secret → { processed, generated }

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
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const CATEGORIES = ['Food', 'Transport', 'Shopping', 'Entertainment', 'Other'];
const TYPES = ['budget_velocity', 'trend_change', 'positive', 'spending_pattern', 'forecast', 'splitwise'];
const MIN_TX = 3; // not enough data below this (this + last month) → no forced insight

interface CurrencyInfo { symbol: string; name: string; decimals: number; locale: string; }
const CURRENCY_INFO: Record<string, CurrencyInfo> = {
  USD: { symbol: '$',  name: 'US Dollar',         decimals: 2, locale: 'en-US' },
  EUR: { symbol: '€',  name: 'Euro',              decimals: 2, locale: 'de-DE' },
  GBP: { symbol: '£',  name: 'British Pound',     decimals: 2, locale: 'en-GB' },
  JPY: { symbol: '¥',  name: 'Japanese Yen',      decimals: 0, locale: 'ja-JP' },
  INR: { symbol: '₹',  name: 'Indian Rupee',      decimals: 2, locale: 'en-IN' },
  CNY: { symbol: '¥',  name: 'Chinese Yuan',      decimals: 2, locale: 'zh-CN' },
  AUD: { symbol: 'A$', name: 'Australian Dollar', decimals: 2, locale: 'en-AU' },
  CAD: { symbol: 'C$', name: 'Canadian Dollar',   decimals: 2, locale: 'en-CA' },
  CHF: { symbol: 'Fr', name: 'Swiss Franc',       decimals: 2, locale: 'de-CH' },
  SGD: { symbol: 'S$', name: 'Singapore Dollar',  decimals: 2, locale: 'en-SG' },
  KRW: { symbol: '₩',  name: 'Korean Won',        decimals: 0, locale: 'ko-KR' },
  AED: { symbol: 'د.إ',name: 'UAE Dirham',        decimals: 2, locale: 'en-AE' },
};
function fmt(minor: number, code: string): string {
  const info = CURRENCY_INFO[code] ?? CURRENCY_INFO.USD;
  return new Intl.NumberFormat(info.locale, {
    style: 'currency', currency: code in CURRENCY_INFO ? code : 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: info.decimals,
  }).format(minor / Math.pow(10, info.decimals));
}

async function splitwiseLine(admin: any, userId: string, code: string): Promise<string> {
  const { data: conn } = await admin.from('splitwise_connections')
    .select('access_token').eq('user_id', userId).maybeSingle();
  const token = conn?.access_token as string | undefined;
  if (!token) return 'Splitwise: not connected.';
  try {
    const res = await fetch('https://secure.splitwise.com/api/v3.0/get_friends', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return 'Splitwise: unavailable.';
    const data = await res.json();
    const info = CURRENCY_INFO[code] ?? CURRENCY_INFO.USD;
    let owe = 0, owed = 0;
    for (const f of (Array.isArray(data?.friends) ? data.friends : [])) {
      for (const b of (Array.isArray(f.balance) ? f.balance : [])) {
        const amt = parseFloat(b.amount); if (!isFinite(amt) || amt === 0) continue;
        const minor = Math.round(Math.abs(amt) * Math.pow(10, info.decimals));
        if (amt < 0) owe += minor; else owed += minor;
      }
    }
    if (owe === 0 && owed === 0) return 'Splitwise: connected, all settled up.';
    return `Splitwise: you owe ${fmt(owe, code)}, you're owed ${fmt(owed, code)}.`;
  } catch { return 'Splitwise: unavailable.'; }
}

function buildContext(
  profile: any, thisMonth: any[], lastMonth: any[], budgets: any[], swLine: string, now: Date,
): { blob: string; enough: boolean } {
  const code = (profile?.currency as string) ?? 'USD';
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const pctMonth = Math.round((dayOfMonth / daysInMonth) * 100);

  const sum = (arr: any[], type: string) =>
    arr.filter((t) => t.transaction_type === type).reduce((s, t) => s + t.amount, 0);
  const byCat = (arr: any[]) => {
    const m: Record<string, number> = {};
    for (const t of arr) if (t.transaction_type === 'debit') m[t.category] = (m[t.category] ?? 0) + t.amount;
    return m;
  };

  const spent = sum(thisMonth, 'debit');
  const earned = sum(thisMonth, 'credit');
  const budget = (profile?.monthly_budget as number) ?? 0;
  const thisCat = byCat(thisMonth);
  const lastCat = byCat(lastMonth);
  const capByCat: Record<string, number> = {};
  for (const b of budgets) capByCat[b.category] = b.budget_amount;

  const catLines = CATEGORIES.map((c) => {
    const cur = thisCat[c] ?? 0;
    const prev = lastCat[c] ?? 0;
    const cap = capByCat[c];
    const capStr = cap ? ` (cap ${fmt(cap, code)}, ${Math.round((cur / cap) * 100)}% used)` : '';
    return `  - ${c}: this month ${fmt(cur, code)}${capStr}; last month ${fmt(prev, code)}`;
  }).join('\n');

  const enough = thisMonth.length + lastMonth.length >= MIN_TX;

  const blob = `Currency: ${(CURRENCY_INFO[code] ?? CURRENCY_INFO.USD).name} (${code})
Today: day ${dayOfMonth} of ${daysInMonth} (${pctMonth}% through the month)
Monthly budget (total): ${fmt(budget, code)}
This month so far: spent ${fmt(spent, code)}${budget > 0 ? ` (${Math.round((spent / budget) * 100)}% of budget)` : ''}, earned ${fmt(earned, code)}, net ${fmt(earned - spent, code)}
By category:
${catLines}
${swLine}
(Transactions: ${thisMonth.length} this month, ${lastMonth.length} last month.)`;

  return { blob, enough };
}

function systemPrompt(code: string, now: Date): string {
  const info = CURRENCY_INFO[code] ?? CURRENCY_INFO.USD;
  const day = now.getDate();
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return `You generate ONE proactive money insight shown on a budgeting app's home screen. Use ONLY the data in the next message — every number MUST come from it. Be specific and number-grounded. NEVER write vague filler like "watch your spending" or "keep an eye on your budget".

Today is day ${day} of ${days}. Format all money in ${info.name} (${code}, symbol ${info.symbol}).

Pick the SINGLE most useful, relevant insight for this user today, choosing its type:
- budget_velocity: a category (or total) spent too fast for how far into the month it is.
- trend_change: a category notably up or down vs last month.
- positive: under budget / saving well — genuine encouragement.
- spending_pattern: a behavioral observation supported by the numbers.
- forecast: projected end-of-month position at the current pace.
- splitwise: about money owed / owed-to-them on Splitwise (only if connected & non-zero).

Output ONE JSON object, nothing else:
{
  "insight_text": "1-2 sentences, conversational, with real ${code} numbers, under ~160 chars, no leading emoji",
  "insight_type": one of: ${TYPES.join(', ')},
  "related_category": one of ${CATEGORIES.join(', ')} if the insight is about a specific category, else null
}`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
    const CRON_SECRET = Deno.env.get('CRON_SECRET');
    if (!GROQ_API_KEY) return json({ error: 'Server misconfigured: missing GROQ_API_KEY' }, 500);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));
    const isCron = !!CRON_SECRET && secretEqual(req.headers.get('x-cron-secret') ?? '', CRON_SECRET);

    let targetIds: string[];
    if (isCron) {
      if (body?.user_id) {
        targetIds = [body.user_id];
      } else {
        const { data: profs } = await admin.from('profiles').select('id');
        targetIds = (profs ?? []).map((p: any) => p.id);
      }
    } else {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) return json({ error: 'Missing Authorization' }, 401);
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: uErr } = await userClient.auth.getUser(
        authHeader.replace(/^Bearer\s+/i, ''),
      );
      if (uErr || !user) return json({ error: 'Invalid auth' }, 401);
      targetIds = [user.id];
    }

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    let generated = 0;
    const results: any[] = [];

    for (const userId of targetIds) {
      // One per day: skip if today's insight already exists.
      const { data: todays } = await admin.from('insights')
        .select('id, insight_text, insight_type, related_category, created_at, dismissed')
        .eq('user_id', userId)
        .gte('created_at', startOfToday.toISOString())
        .order('created_at', { ascending: false });

      if (todays && todays.length > 0) {
        if (!isCron) {
          const active = todays.find((t: any) => !t.dismissed) ?? null;
          // dismissedToday: an insight existed today but was dismissed — the
          // client hides the card rather than showing the new-user placeholder.
          return json({ insight: active, dismissedToday: active === null });
        }
        results.push({ user: userId, skipped: 'exists' });
        continue;
      }

      const [{ data: profile }, { data: txs }, { data: budgets }] = await Promise.all([
        admin.from('profiles').select('name, monthly_budget, currency, expected_monthly_income').eq('id', userId).maybeSingle(),
        admin.from('transactions').select('amount, category, transaction_type, transacted_at')
          .eq('user_id', userId).gte('transacted_at', lastMonthStart.toISOString())
          .order('transacted_at', { ascending: false }).limit(400),
        admin.from('category_budgets').select('category, budget_amount').eq('user_id', userId),
      ]);
      if (!profile) {
        if (!isCron) return json({ insight: null });
        results.push({ user: userId, skipped: 'no profile' });
        continue;
      }
      const code = (profile.currency as string) ?? 'USD';
      const all = (txs ?? []) as any[];
      const thisMonth = all.filter((t) => new Date(t.transacted_at) >= monthStart);
      const lastMonth = all.filter((t) => {
        const d = new Date(t.transacted_at);
        return d >= lastMonthStart && d < monthStart;
      });

      const swLine = await splitwiseLine(admin, userId, code);
      const { blob, enough } = buildContext(profile, thisMonth, lastMonth, budgets ?? [], swLine, now);
      if (!enough) {
        if (!isCron) return json({ insight: null });
        results.push({ user: userId, skipped: 'insufficient data' });
        continue;
      }

      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemPrompt(code, now) },
            { role: 'user', content: blob },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.5,
          max_tokens: 300,
        }),
      });
      if (!groqRes.ok) {
        results.push({ user: userId, error: `groq ${groqRes.status}` });
        if (!isCron) return json({ insight: null });
        continue;
      }
      const content: string | undefined = (await groqRes.json())?.choices?.[0]?.message?.content;
      let parsed: any = null;
      try { parsed = content ? JSON.parse(content) : null; } catch { /* ignore */ }
      if (!parsed?.insight_text || !TYPES.includes(parsed.insight_type)) {
        results.push({ user: userId, error: 'bad insight' });
        if (!isCron) return json({ insight: null });
        continue;
      }
      const related = CATEGORIES.includes(parsed.related_category) ? parsed.related_category : null;

      const { data: inserted, error: insErr } = await admin.from('insights').insert({
        user_id: userId,
        insight_text: String(parsed.insight_text).slice(0, 280),
        insight_type: parsed.insight_type,
        related_category: related,
      }).select().single();
      if (insErr) {
        results.push({ user: userId, error: insErr.message });
        if (!isCron) return json({ insight: null });
        continue;
      }
      generated++;
      if (!isCron) return json({ insight: inserted });
      results.push({ user: userId, success: true, type: parsed.insight_type });
    }

    return json({ processed: targetIds.length, generated, results });
  } catch (err: any) {
    console.error('Unexpected error:', err);
    return json({ error: 'Unexpected error', detail: String(err?.message ?? err) }, 500);
  }
});
