// supabase/functions/goal-nudge/index.ts
//
// Generates a friendly nudge for each user based on their recent spending
// and active goals, and writes it into public.nudges. Currency-aware —
// formats and reasons about money in each user's chosen currency.
//
// Dual-mode auth:
//   1) Cron mode (Bearer = SUPABASE_SERVICE_ROLE_KEY):
//      - Without body                       → processes ALL profiles
//      - With body { user_id: "<uuid>" }    → only that user
//   2) User mode (Bearer = a user's JWT):
//      - Always processes just the calling user.

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface ProfileLite {
  id: string;
  name: string;
  monthly_budget: number;
  currency: string;
}

interface TxLite {
  amount: number;
  merchant: string;
  category: string;
  transacted_at: string;
}

interface GoalLite {
  id: string;
  title: string;
  emoji: string;
  target_amount: number;
  current_amount: number;
  deadline: string | null;
}

interface CurrencyInfo {
  symbol: string;
  name: string;
  decimals: number;
  locale: string;
}

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

function buildSystemPrompt(code: string): string {
  const info = CURRENCY_INFO[code] ?? CURRENCY_INFO.USD;
  return `You write a single short nudge for a money-tracking app's user.

Input: a JSON blob describing one user's name, monthly budget, this-month spending so far, and active savings goals.

The user's currency is ${info.name} (${code}). Format all money using ${info.symbol} and the appropriate locale conventions for ${code}.

Output: ONE JSON object with exactly these fields:
{
  "type": "budget_warning" | "goal_check" | "weekly_digest",
  "message": string (1-2 sentences, MAX 200 chars, no leading emoji)
}

Choose type:
- "budget_warning" if the user has spent >70% of their monthly budget, or is on track to overshoot
- "goal_check" if the user has active goals and progress is notable (good or behind)
- "weekly_digest" otherwise — a chatty observation about recent spend

Voice: warm friend, not finance lecturer. Mention specific numbers. Don't moralise. Suggestions are fine — "you should" is not.

Output the JSON object only — no markdown, no other text.`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization' }, 401);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
    if (!GROQ_API_KEY) {
      return json({ error: 'Server misconfigured: missing GROQ_API_KEY' }, 500);
    }

    const isServiceRole = authHeader === `Bearer ${SERVICE_ROLE_KEY}`;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));

    let targetUserIds: string[] | null = null;

    if (isServiceRole) {
      const bodyUid: string | undefined = body?.user_id;
      if (bodyUid) targetUserIds = [bodyUid];
    } else {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const jwt = authHeader.replace(/^Bearer\s+/i, '');
      const {
        data: { user },
        error: userErr,
      } = await userClient.auth.getUser(jwt);
      if (userErr || !user) {
        return json(
          { error: 'Invalid auth', detail: userErr?.message ?? 'no user' },
          401,
        );
      }
      targetUserIds = [user.id];
    }

    let profileQuery = admin
      .from('profiles')
      .select('id, name, monthly_budget, currency');
    if (targetUserIds) profileQuery = profileQuery.in('id', targetUserIds);
    const { data: profiles, error: profErr } = await profileQuery;
    if (profErr) {
      console.error('failed to fetch profiles:', profErr);
      return json({ error: 'Failed to fetch profiles' }, 500);
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const results: any[] = [];

    for (const p of (profiles as ProfileLite[]) ?? []) {
      try {
        const [txRes, goalsRes] = await Promise.all([
          admin
            .from('transactions')
            .select('amount, merchant, category, transacted_at')
            .eq('user_id', p.id)
            .eq('transaction_type', 'debit')
            .gte('transacted_at', monthStart.toISOString())
            .order('transacted_at', { ascending: false })
            .limit(50),
          admin
            .from('goals')
            .select(
              'id, title, emoji, target_amount, current_amount, deadline',
            )
            .eq('user_id', p.id)
            .eq('status', 'active'),
        ]);

        const txs = (txRes.data ?? []) as TxLite[];
        const goals = (goalsRes.data ?? []) as GoalLite[];

        if (txs.length === 0 && goals.length === 0) {
          results.push({ user_id: p.id, skipped: 'no data' });
          continue;
        }

        const userBlob = formatUserBlob(p, txs, goals, now);

        const groqRes = await fetch(
          'https://api.groq.com/openai/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${GROQ_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'llama-3.3-70b-versatile',
              messages: [
                { role: 'system', content: buildSystemPrompt(p.currency ?? 'USD') },
                { role: 'user', content: userBlob },
              ],
              response_format: { type: 'json_object' },
              temperature: 0.7,
              max_tokens: 250,
            }),
          },
        );

        if (!groqRes.ok) {
          results.push({ user_id: p.id, error: `groq ${groqRes.status}` });
          continue;
        }

        const groqData = await groqRes.json();
        const content: string | undefined =
          groqData?.choices?.[0]?.message?.content;
        if (!content) {
          results.push({ user_id: p.id, error: 'empty groq response' });
          continue;
        }
        let parsed: { type?: string; message?: string };
        try {
          parsed = JSON.parse(content);
        } catch {
          results.push({ user_id: p.id, error: 'invalid groq json' });
          continue;
        }
        const validTypes = ['budget_warning', 'goal_check', 'weekly_digest'];
        if (
          !parsed.type ||
          !validTypes.includes(parsed.type) ||
          typeof parsed.message !== 'string' ||
          !parsed.message.trim()
        ) {
          results.push({
            user_id: p.id,
            error: 'invalid nudge structure',
            raw: parsed,
          });
          continue;
        }

        const { error: insertErr } = await admin.from('nudges').insert({
          user_id: p.id,
          type: parsed.type,
          message: parsed.message.trim(),
        });
        if (insertErr) {
          results.push({ user_id: p.id, error: insertErr.message });
        } else {
          results.push({
            user_id: p.id,
            success: true,
            type: parsed.type,
            message: parsed.message.trim(),
          });
        }
      } catch (e: any) {
        results.push({ user_id: p.id, error: String(e?.message ?? e) });
      }
    }

    return json({ processed: results.length, results });
  } catch (err: any) {
    console.error('Unexpected error:', err);
    return json(
      { error: 'Unexpected error', detail: String(err?.message ?? err) },
      500,
    );
  }
});

function formatUserBlob(
  p: ProfileLite,
  txs: TxLite[],
  goals: GoalLite[],
  now: Date,
): string {
  const info = CURRENCY_INFO[p.currency] ?? CURRENCY_INFO.USD;
  const spent = txs.reduce((s, t) => s + t.amount, 0);
  const pct = p.monthly_budget > 0
    ? Math.round((spent / p.monthly_budget) * 100)
    : 0;
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
  ).getDate();

  const byCategory: Record<string, number> = {};
  for (const t of txs) {
    byCategory[t.category] = (byCategory[t.category] ?? 0) + t.amount;
  }
  const catLines = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([c, v]) => `  ${c}: ${formatMoney(v, info, p.currency)}`)
    .join('\n');

  const goalLines = goals
    .map((g) => {
      const gpct = g.target_amount > 0
        ? Math.round((g.current_amount / g.target_amount) * 100)
        : 0;
      const dl = g.deadline ? `, deadline ${g.deadline}` : '';
      return `  ${g.emoji} ${g.title}: ${formatMoney(g.current_amount, info, p.currency)} / ${formatMoney(g.target_amount, info, p.currency)} (${gpct}%${dl})`;
    })
    .join('\n');

  return `User: ${p.name}
Currency: ${info.name} (${p.currency})
Today: day ${dayOfMonth} of ${daysInMonth}
Monthly budget: ${formatMoney(p.monthly_budget, info, p.currency)}
Spent so far this month (debits): ${formatMoney(spent, info, p.currency)} (${pct}% of budget)
Remaining: ${formatMoney(Math.max(0, p.monthly_budget - spent), info, p.currency)}

By category this month:
${catLines || '  (no debits this month)'}

Active goals:
${goalLines || '  (none)'}`;
}

function formatMoney(minorUnits: number, info: CurrencyInfo, code: string): string {
  const major = minorUnits / Math.pow(10, info.decimals);
  return new Intl.NumberFormat(info.locale, {
    style: 'currency',
    currency: code,
    minimumFractionDigits: 0,
    maximumFractionDigits: info.decimals,
  }).format(major);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
