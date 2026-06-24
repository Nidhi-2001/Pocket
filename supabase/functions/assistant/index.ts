// supabase/functions/assistant/index.ts
//
// Unified Home assistant. One natural-language input that EITHER:
//   - RECORDS a transaction (expense/income) parsed from free text
//     ("medicine at cvs 40", "got paid 5000"), inserting it server-side, OR
//   - ANSWERS a question grounded in the user's transactions, budget, and
//     Splitwise balances ("how much did I spend on food?", "do I owe anyone?").
//
// One Groq call (llama-3.3-70b, JSON mode) classifies intent and produces the
// structured result; the function executes the insert for records.
//
// Request:  { text: string }
// Response: { action: 'record' | 'answer', message: string, transaction?: row }

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const CATEGORIES = ['Food', 'Transport', 'Shopping', 'Entertainment', 'Other'];

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

function fmtMoney(minor: number, info: CurrencyInfo, code: string): string {
  return new Intl.NumberFormat(info.locale, {
    style: 'currency',
    currency: code in CURRENCY_INFO ? code : 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: info.decimals,
  }).format(minor / Math.pow(10, info.decimals));
}

async function fetchSplitwiseOwe(supabase: any, info: CurrencyInfo, code: string): Promise<string> {
  // Per-user OAuth token ONLY — no shared fallback.
  const { data: conn } = await supabase
    .from('splitwise_connections').select('access_token').maybeSingle();
  const token = conn?.access_token as string | undefined;
  if (!token) return 'Splitwise: not connected.';
  try {
    const res = await fetch('https://secure.splitwise.com/api/v3.0/get_friends', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return 'Splitwise: unavailable.';
    const data = await res.json();
    const friends: any[] = Array.isArray(data?.friends) ? data.friends : [];
    const lines: string[] = [];
    for (const f of friends) {
      const name = `${f.first_name ?? ''} ${f.last_name ?? ''}`.trim() || 'Unknown';
      for (const b of (Array.isArray(f.balance) ? f.balance : [])) {
        const amt = parseFloat(b.amount);
        if (!isFinite(amt) || amt === 0) continue;
        const minor = Math.round(Math.abs(amt) * Math.pow(10, info.decimals));
        lines.push(amt < 0
          ? `  - You owe ${name}: ${fmtMoney(minor, info, code)}`
          : `  - ${name} owes you: ${fmtMoney(minor, info, code)}`);
      }
    }
    return lines.length ? `Splitwise balances:\n${lines.join('\n')}` : 'Splitwise: all settled up.';
  } catch {
    return 'Splitwise: unavailable.';
  }
}

function buildSystemPrompt(code: string, todayIso: string): string {
  const info = CURRENCY_INFO[code] ?? CURRENCY_INFO.USD;
  const mult = Math.pow(10, info.decimals);
  return `You are Pocket — a money assistant. The user typed one message into a single home-screen bar. Decide their intent and reply with ONE JSON object only (no markdown).

Today is ${todayIso}. The user's currency is ${info.name} (${code}, symbol ${info.symbol}, ${info.decimals} decimals).

TWO intents:

1) RECORD — they are logging money they spent or received. Examples: "medicine at cvs 40", "lunch 12", "uber 8", "got paid 5000 salary", "restaurant bill was 300". Output:
{
  "action": "record",
  "transaction": {
    "amount": <integer in MINOR UNITS = major × ${mult}>,
    "merchant": <short Title-Case name/source, e.g. "CVS", "Restaurant", "Salary">,
    "category": "Food" | "Transport" | "Shopping" | "Entertainment" | "Other",
    "transaction_type": "debit" (spent) | "credit" (received/income),
    "transacted_at": <ISO8601 with offset; use today ${todayIso} unless a date is stated>
  },
  "message": <one short, friendly confirmation incl. the amount and category, e.g. "Logged ${info.symbol}40 at CVS under Other 💊">
}

2) ASK — they are asking a question about their money. Use the DATA below; never invent numbers. Output:
{ "action": "answer", "message": <concise 1-3 sentence answer, money formatted in ${code}> }

If genuinely ambiguous, use "answer" and ask them to clarify (e.g. "Want me to log a spend or answer a question? Try 'coffee 5' or 'how much did I spend on food?'").

Category guide for records: Food (restaurants, groceries, cafes, food delivery), Transport (ride-share, fuel, transit, parking), Shopping (retail, electronics, clothes), Entertainment (streaming, movies, games), Other (medical/pharmacy, utilities, rent, fees, salary/income, anything else). Interpret typos charitably.`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !user) return json({ error: 'Invalid auth' }, 401);

    const body = await req.json().catch(() => null);
    const text: unknown = body?.text;
    if (typeof text !== 'string' || !text.trim()) {
      return json({ error: 'Request body must be { text: string }' }, 400);
    }
    if (text.length > 1000) return json({ error: 'Message too long' }, 400);

    const groqKey = Deno.env.get('GROQ_API_KEY');
    if (!groqKey) return json({ error: 'Server misconfigured: missing GROQ_API_KEY' }, 500);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [profileRes, txRes] = await Promise.all([
      supabase.from('profiles').select('name, monthly_budget, currency, expected_monthly_income').maybeSingle(),
      supabase.from('transactions').select('amount, merchant, category, transaction_type, transacted_at')
        .order('transacted_at', { ascending: false }).limit(150),
    ]);
    const profile = profileRes.data as any;
    const code = (profile?.currency as string) ?? 'USD';
    const info = CURRENCY_INFO[code] ?? CURRENCY_INFO.USD;
    const txs = (txRes.data ?? []) as any[];
    const swText = await fetchSplitwiseOwe(supabase, info, code);

    // Compact grounding for the ASK path.
    const monthDebits = txs.filter((t) => new Date(t.transacted_at) >= monthStart && t.transaction_type === 'debit');
    const monthSpent = monthDebits.reduce((s, t) => s + t.amount, 0);
    const byCat: Record<string, number> = {};
    for (const t of monthDebits) byCat[t.category] = (byCat[t.category] ?? 0) + t.amount;
    const catLines = Object.entries(byCat).sort((a, b) => b[1] - a[1])
      .map(([c, v]) => `  - ${c}: ${fmtMoney(v, info, code)}`).join('\n');
    const recent = txs.slice(0, 25).map((t) => {
      const d = new Date(t.transacted_at).toLocaleDateString(info.locale, { day: 'numeric', month: 'short', year: 'numeric' });
      return `  - ${d}: ${t.transaction_type === 'debit' ? '-' : '+'}${fmtMoney(t.amount, info, code)} ${t.merchant} [${t.category}]`;
    }).join('\n');

    const grounding = `USER DATA (for answering questions — do not invent):
Name: ${profile?.name ?? 'there'}
Monthly budget: ${fmtMoney(profile?.monthly_budget ?? 0, info, code)}
This month spent: ${fmtMoney(monthSpent, info, code)}
By category this month:
${catLines || '  (none yet)'}
${swText}
Recent transactions:
${recent || '  (none)'}`;

    const todayIso = now.toISOString().slice(0, 10);
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: buildSystemPrompt(code, todayIso) },
          { role: 'system', content: grounding },
          { role: 'user', content: text },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 500,
      }),
    });
    if (!groqRes.ok) {
      const t = await groqRes.text();
      console.error('Groq error', groqRes.status, t);
      return json({ error: 'AI provider error' }, 502);
    }
    const content: string | undefined = (await groqRes.json())?.choices?.[0]?.message?.content;
    if (!content) return json({ error: 'AI returned empty response' }, 502);

    let parsed: any;
    try { parsed = JSON.parse(content); } catch {
      return json({ error: 'AI returned invalid JSON' }, 502);
    }

    if (parsed?.action === 'record' && parsed?.transaction) {
      const t = parsed.transaction;
      const amount = Math.round(Number(t.amount));
      const category = CATEGORIES.includes(t.category) ? t.category : 'Other';
      const type = t.transaction_type === 'credit' ? 'credit' : 'debit';
      if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000_000) {
        return json({ action: 'answer', message: "I couldn't read an amount there — try something like 'coffee 5'." });
      }
      const { data: inserted, error: insErr } = await supabase.from('transactions').insert({
        user_id: user.id,
        amount,
        merchant: String(t.merchant || 'Unknown').slice(0, 120),
        category,
        transaction_type: type,
        transacted_at: typeof t.transacted_at === 'string' ? t.transacted_at : now.toISOString(),
        source: 'manual', // CHECK allows 'sms' | 'statement' | 'manual'
      }).select().single();
      if (insErr) {
        if ((insErr as any).code === '23505') {
          return json({ action: 'answer', message: 'Looks like that exact entry is already logged.' });
        }
        console.error('insert error', insErr);
        return json({ error: 'Database error' }, 500);
      }
      const msg = typeof parsed.message === 'string' && parsed.message.trim()
        ? parsed.message.trim()
        : `Logged ${fmtMoney(amount, info, code)} · ${inserted.merchant} · ${category}`;
      return json({ action: 'record', message: msg, transaction: inserted });
    }

    const message = typeof parsed?.message === 'string' && parsed.message.trim()
      ? parsed.message.trim()
      : "I can log spends/income or answer questions about your money — try 'lunch 12' or 'how much did I spend on food?'";
    return json({ action: 'answer', message });
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
