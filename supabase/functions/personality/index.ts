// supabase/functions/personality/index.ts
//
// Generates a "Spending Personality" card for each user from their previous
// month's transactions and writes it into public.personalities. Currency-aware.
//
// Dual-mode auth (same as goal-nudge):
//   1) Cron / batch mode (Bearer = SUPABASE_SERVICE_ROLE_KEY)
//   2) User mode (Bearer = user JWT)
//
// Target month defaults to LAST calendar month. The personalities table
// has unique(user_id, month) so re-running is idempotent (we upsert).

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// Constant-time compare so the service-role key can't be recovered via timing.
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

interface ProfileLite {
  id: string;
  name: string;
  currency: string;
}

interface TxLite {
  amount: number;
  merchant: string;
  category: string;
  transaction_type: 'debit' | 'credit';
  transacted_at: string;
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
  return `You generate a "Spending Personality" card for a money-tracking app's user, based on ONE month of their transactions.

The user's currency is ${info.name} (${code}). Format all money using ${info.symbol} and locale conventions for ${code}.

Output ONE JSON object with EXACTLY these fields:
{
  "type": short snake_case slug, e.g. "weekend_splurger" | "food_explorer" | "savings_machine" | "balanced_spender" | "shopping_specialist" | "transport_traveler" | "entertainment_enthusiast" | "minimalist" | "social_butterfly",
  "title": string, max 40 chars, fun and slightly affectionate (e.g. "The Weekend Splurger"),
  "emoji": single emoji that captures the vibe,
  "insights": string[] — 2 or 3 specific observations citing ACTUAL numbers from the data,
  "actions": string[] — 1 or 2 light, friendly suggestions. Not lectures.
}

Voice: warm, observational friend. Specific over generic. Mention real merchants, real money amounts. Don't moralise.

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

    const isServiceRole =
      !!SERVICE_ROLE_KEY && secretEqual(authHeader ?? '', `Bearer ${SERVICE_ROLE_KEY}`);
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

    const month = pickTargetMonth(body?.month);
    const monthStart = new Date(`${month}-01T00:00:00Z`);
    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);

    let profileQuery = admin.from('profiles').select('id, name, currency');
    if (targetUserIds) profileQuery = profileQuery.in('id', targetUserIds);
    const { data: profiles, error: profErr } = await profileQuery;
    if (profErr) {
      console.error('failed to fetch profiles:', profErr);
      return json({ error: 'Failed to fetch profiles' }, 500);
    }

    const results: any[] = [];

    for (const p of (profiles as ProfileLite[]) ?? []) {
      try {
        const { data: txData } = await admin
          .from('transactions')
          .select('amount, merchant, category, transaction_type, transacted_at')
          .eq('user_id', p.id)
          .gte('transacted_at', monthStart.toISOString())
          .lt('transacted_at', monthEnd.toISOString())
          .order('transacted_at', { ascending: false });

        const txs = (txData ?? []) as TxLite[];
        if (txs.length === 0) {
          results.push({ user_id: p.id, month, skipped: 'no transactions' });
          continue;
        }

        const userBlob = formatUserBlob(p, txs, month);

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
              temperature: 0.8,
              max_tokens: 500,
            }),
          },
        );

        if (!groqRes.ok) {
          results.push({
            user_id: p.id,
            month,
            error: `groq ${groqRes.status}`,
          });
          continue;
        }

        const groqData = await groqRes.json();
        const content: string | undefined =
          groqData?.choices?.[0]?.message?.content;
        if (!content) {
          results.push({ user_id: p.id, month, error: 'empty groq response' });
          continue;
        }
        let parsed: any;
        try {
          parsed = JSON.parse(content);
        } catch {
          results.push({ user_id: p.id, month, error: 'invalid groq json' });
          continue;
        }
        if (
          typeof parsed?.type !== 'string' ||
          typeof parsed?.title !== 'string' ||
          typeof parsed?.emoji !== 'string' ||
          !Array.isArray(parsed?.insights) ||
          !Array.isArray(parsed?.actions)
        ) {
          results.push({
            user_id: p.id,
            month,
            error: 'invalid personality structure',
            raw: parsed,
          });
          continue;
        }

        const { error: upsertErr } = await admin
          .from('personalities')
          .upsert(
            {
              user_id: p.id,
              month,
              type: parsed.type,
              title: parsed.title,
              emoji: parsed.emoji,
              insights: parsed.insights,
              actions: parsed.actions,
            },
            { onConflict: 'user_id,month' },
          );

        if (upsertErr) {
          results.push({ user_id: p.id, month, error: upsertErr.message });
        } else {
          results.push({
            user_id: p.id,
            month,
            success: true,
            type: parsed.type,
            title: parsed.title,
          });
        }
      } catch (e: any) {
        results.push({
          user_id: p.id,
          month,
          error: String(e?.message ?? e),
        });
      }
    }

    return json({ processed: results.length, month, results });
  } catch (err: any) {
    console.error('Unexpected error:', err);
    return json(
      { error: 'Unexpected error', detail: String(err?.message ?? err) },
      500,
    );
  }
});

function pickTargetMonth(override?: string): string {
  if (typeof override === 'string' && /^\d{4}-\d{2}$/.test(override)) {
    return override;
  }
  const now = new Date();
  now.setUTCDate(1);
  now.setUTCMonth(now.getUTCMonth() - 1);
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function formatUserBlob(p: ProfileLite, txs: TxLite[], month: string): string {
  const info = CURRENCY_INFO[p.currency] ?? CURRENCY_INFO.USD;
  const debits = txs.filter((t) => t.transaction_type === 'debit');
  const totalSpent = debits.reduce((s, t) => s + t.amount, 0);

  const byCategory: Record<string, number> = {};
  const byMerchant: Record<string, number> = {};
  for (const t of debits) {
    byCategory[t.category] = (byCategory[t.category] ?? 0) + t.amount;
    byMerchant[t.merchant] = (byMerchant[t.merchant] ?? 0) + t.amount;
  }

  const catLines = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([c, v]) => `  ${c}: ${formatMoney(v, info, p.currency)}`)
    .join('\n');

  const topMerchants = Object.entries(byMerchant)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([m, v]) => `  ${m}: ${formatMoney(v, info, p.currency)}`)
    .join('\n');

  const dowTotals = [0, 0, 0, 0, 0, 0, 0];
  for (const t of debits) {
    dowTotals[new Date(t.transacted_at).getUTCDay()] += t.amount;
  }
  const dowLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dowLines = dowTotals
    .map((v, i) => `  ${dowLabels[i]}: ${formatMoney(v, info, p.currency)}`)
    .join('\n');

  return `User: ${p.name}
Currency: ${info.name} (${p.currency})
Month analysed: ${month}
Number of transactions (debits): ${debits.length}
Total spent (debits): ${formatMoney(totalSpent, info, p.currency)}

By category:
${catLines || '  (none)'}

Top merchants:
${topMerchants || '  (none)'}

By day of week:
${dowLines}`;
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
