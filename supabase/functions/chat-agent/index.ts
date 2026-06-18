// supabase/functions/chat-agent/index.ts
//
// Deno edge function. Conversational money assistant grounded in the user's
// actual recent transactions, monthly budget, and per-category month-to-date
// totals. Currency-aware — formats and reasons about money in the user's
// chosen currency (USD, EUR, INR, JPY, etc.).
//
// Provider: Groq (llama-3.3-70b-versatile).
//
// Request:  { messages: [{ role: 'user' | 'assistant', content: string }, ...] }
// Response: { message: { role: 'assistant', content: string } } or
//           { error: string, ... } with 4xx/5xx status.

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ProfileLite {
  name: string;
  monthly_budget: number; // minor units of `currency`
  currency: string;
  expected_monthly_income: number;
}

interface TransactionLite {
  amount: number; // minor units of the user's currency
  merchant: string;
  category: string;
  transaction_type: 'debit' | 'credit';
  transacted_at: string;
}

interface SwBalanceItem {
  name: string;
  amountMinor: number;
  currency: string;
}

interface SplitwiseBalances {
  connected: boolean;
  owe: SwBalanceItem[];
  owedToMe: SwBalanceItem[];
  totalOweMinor: number;
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

function buildSystemPrompt(code: string, todayIso: string): string {
  const info = CURRENCY_INFO[code] ?? CURRENCY_INFO.USD;
  const currentYear = todayIso.slice(0, 4);
  return `You are Pocket — a friendly money assistant for young adults (18-26) managing everyday spending.

Today's date is ${todayIso}. The current year is ${currentYear}.

You have the user's real recent transactions, monthly budget, month-to-date breakdown, and — when they've connected Splitwise — their Splitwise balances (who they owe and who owes them), all provided in the next message. Use that data to answer concretely, including questions about money owed on Splitwise. Never invent numbers or transactions you don't see. If Splitwise is not connected, say so when asked about it.

The user's currency is ${info.name} (${code}, symbol ${info.symbol}). Always format money in ${code} — use the symbol ${info.symbol} and the appropriate locale conventions (commas/decimals).

How to interpret the user's question:
- Read it carefully. Even if there are typos, missing spaces, or weird casing (e.g. "injunemonth" = "in June month", "lastmnth" = "last month"), interpret it charitably and to the user's obvious intent. Do not invent a different word.
- When the user mentions a month name without a year (e.g. "June", "last month", "May expenses"), DEFAULT TO THE CURRENT YEAR ONLY. Only choose a different year if the user explicitly says so.
- ANSWER ONLY THE EXACT PERIOD ASKED. If the user asks about "June" (current-year default), answer about June ${'$'}{currentYear} and nothing else. Do NOT volunteer information about June of other years, do NOT mention adjacent months, do NOT compare across years unless the user explicitly asks for a comparison.
- If the user asks about a specific period (month, week, day, year) that has NO data, say so explicitly: "You have no transactions in {that exact period}." Do NOT silently switch to a different period and do NOT mention other periods that DO have data.
- Stay in scope. The user's question defines the scope of your answer. Don't expand it.

Style:
- Warm but direct, like a smart friend. Not a finance lecturer.
- Concise: 2-4 sentences usually. Long answers only when the user explicitly asks for detail.
- Honest about expensive spending if asked. No moralising unless the user asks for advice.
- No legal/financial disclaimers. No "I'm an AI" preambles. Just answer.

Categories you'll see: Food, Transport, Shopping, Entertainment, Other.`;
}

// Fetch the user's Splitwise balances server-side so chat can answer "how much
// do I owe" questions. Uses the per-user OAuth token from splitwise_connections
// (falls back to the shared SPLITWISE_API_KEY). Mirrors the splitwise-balances
// function; balances are signed (negative = the user owes).
async function fetchSplitwiseBalances(supabase: any): Promise<SplitwiseBalances> {
  const empty: SplitwiseBalances = { connected: false, owe: [], owedToMe: [], totalOweMinor: 0 };
  let token = Deno.env.get('SPLITWISE_API_KEY') ?? '';
  const { data: conn } = await supabase
    .from('splitwise_connections')
    .select('access_token')
    .maybeSingle();
  if (conn?.access_token) token = conn.access_token as string;
  if (!token) return empty;

  try {
    const res = await fetch('https://secure.splitwise.com/api/v3.0/get_friends', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { ...empty, connected: true };
    const data = await res.json();
    const friends: any[] = Array.isArray(data?.friends) ? data.friends : [];
    const owe: SwBalanceItem[] = [];
    const owedToMe: SwBalanceItem[] = [];
    let totalOweMinor = 0;
    for (const f of friends) {
      const name = `${f.first_name ?? ''} ${f.last_name ?? ''}`.trim() || 'Unknown';
      const balances: any[] = Array.isArray(f.balance) ? f.balance : [];
      for (const b of balances) {
        const amt = parseFloat(b.amount);
        if (!isFinite(amt) || amt === 0) continue;
        const cc = (b.currency_code as string) ?? 'USD';
        const decimals = (CURRENCY_INFO[cc] ?? CURRENCY_INFO.USD).decimals;
        const minor = Math.round(Math.abs(amt) * Math.pow(10, decimals));
        const item: SwBalanceItem = { name, amountMinor: minor, currency: cc };
        if (amt < 0) {
          owe.push(item);
          totalOweMinor += minor;
        } else {
          owedToMe.push(item);
        }
      }
    }
    owe.sort((a, b) => b.amountMinor - a.amountMinor);
    owedToMe.sort((a, b) => b.amountMinor - a.amountMinor);
    return { connected: true, owe, owedToMe, totalOweMinor };
  } catch (_) {
    return { ...empty, connected: true };
  }
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
    if (!authHeader) {
      return json({ error: 'Missing Authorization header' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser(jwt);
    if (userErr || !user) {
      return json(
        { error: 'Invalid auth', detail: userErr?.message ?? 'no user' },
        401,
      );
    }

    const body = await req.json().catch(() => null);
    const messages: unknown = body?.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return json(
        { error: 'Request body must be { messages: ChatMessage[] }' },
        400,
      );
    }
    for (const m of messages) {
      if (
        !m ||
        typeof m !== 'object' ||
        !('role' in m) ||
        !('content' in m) ||
        ((m as ChatMessage).role !== 'user' &&
          (m as ChatMessage).role !== 'assistant') ||
        typeof (m as ChatMessage).content !== 'string'
      ) {
        return json({ error: 'Invalid message structure' }, 400);
      }
    }
    const typedMessages = messages as ChatMessage[];
    if (typedMessages.length > 40) {
      return json({ error: 'Too many messages (max 40)' }, 400);
    }
    const last = typedMessages[typedMessages.length - 1];
    if (last.role !== 'user') {
      return json({ error: 'Last message must be from the user' }, 400);
    }
    if (last.content.length > 2000) {
      return json({ error: 'Message too long (max 2000 chars)' }, 400);
    }

    const groqKey = Deno.env.get('GROQ_API_KEY');
    if (!groqKey) {
      console.error('GROQ_API_KEY env var not set');
      return json({ error: 'Server misconfigured: missing GROQ_API_KEY' }, 500);
    }

    const now = new Date();

    // Pull the user's full recent history — up to 200 most recent
    // transactions across all time — so chat can answer questions about
    // any month, not just the trailing two-month window.
    const [profileRes, txRes, swBalances] = await Promise.all([
      supabase
        .from('profiles')
        .select('name, monthly_budget, currency, expected_monthly_income')
        .maybeSingle(),
      supabase
        .from('transactions')
        .select('amount, merchant, category, transaction_type, transacted_at')
        .order('transacted_at', { ascending: false })
        .limit(200),
      fetchSplitwiseBalances(supabase),
    ]);

    const profile = (profileRes.data ?? null) as ProfileLite | null;
    const transactions = (txRes.data ?? []) as TransactionLite[];
    const currencyCode = (profile?.currency as string | undefined) ?? 'USD';

    const groundingText = buildGrounding(profile, transactions, swBalances, now, currencyCode);

    const todayIso = now.toISOString().slice(0, 10);
    const groqMessages = [
      { role: 'system', content: buildSystemPrompt(currencyCode, todayIso) },
      { role: 'system', content: groundingText },
      ...typedMessages.slice(-15),
    ];

    const groqRes = await fetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${groqKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: groqMessages,
          temperature: 0.6,
          max_tokens: 600,
        }),
      },
    );

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error('Groq API error:', groqRes.status, errText);
      return json({ error: 'AI provider error', status: groqRes.status }, 502);
    }

    const groqData = await groqRes.json();
    const content: string | undefined =
      groqData?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      return json({ error: 'AI returned empty response' }, 502);
    }

    return json({ message: { role: 'assistant', content: content.trim() } });
  } catch (err: any) {
    console.error('Unexpected error:', err);
    return json(
      { error: 'Unexpected error', detail: String(err?.message ?? err) },
      500,
    );
  }
});

function buildGrounding(
  profile: ProfileLite | null,
  transactions: TransactionLite[],
  splitwise: SplitwiseBalances,
  now: Date,
  currencyCode: string,
): string {
  if (!profile) {
    return "USER CONTEXT: profile not available. Answer politely that you can't see their data right now.";
  }

  const info = CURRENCY_INFO[currencyCode] ?? CURRENCY_INFO.USD;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // ── This-month summary ─────────────────────────────────────────────
  const thisMonthDebits = transactions.filter(
    (t) =>
      new Date(t.transacted_at) >= monthStart && t.transaction_type === 'debit',
  );
  const thisMonthCredits = transactions.filter(
    (t) =>
      new Date(t.transacted_at) >= monthStart && t.transaction_type === 'credit',
  );
  const monthSpent = thisMonthDebits.reduce((s, t) => s + t.amount, 0);
  const monthEarned = thisMonthCredits.reduce((s, t) => s + t.amount, 0);
  const budget = profile.monthly_budget;
  const pct = budget > 0 ? Math.round((monthSpent / budget) * 100) : 0;

  const byCategory: Record<string, number> = {};
  for (const t of thisMonthDebits) {
    byCategory[t.category] = (byCategory[t.category] ?? 0) + t.amount;
  }
  const byCategoryLines = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, amt]) => `  - ${cat}: ${formatMoney(amt, info)}`)
    .join('\n');

  // ── Per-month aggregates across the full history ───────────────────
  // Gives the LLM context for any month the user asks about, even ones
  // older than what we'd include verbatim below.
  const monthly: Record<
    string,
    { debits: number; credits: number; debitCount: number; creditCount: number }
  > = {};
  for (const t of transactions) {
    const d = new Date(t.transacted_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!monthly[key]) {
      monthly[key] = { debits: 0, credits: 0, debitCount: 0, creditCount: 0 };
    }
    if (t.transaction_type === 'debit') {
      monthly[key].debits += t.amount;
      monthly[key].debitCount += 1;
    } else {
      monthly[key].credits += t.amount;
      monthly[key].creditCount += 1;
    }
  }
  const monthlyLines = Object.entries(monthly)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(
      ([m, agg]) =>
        `  - ${m}: spent ${formatMoney(agg.debits, info)} (${agg.debitCount} tx)` +
        (agg.credits > 0
          ? `, earned ${formatMoney(agg.credits, info)} (${agg.creditCount} tx)`
          : ''),
    )
    .join('\n');

  // ── Most recent 30 transactions verbatim ──────────────────────────
  const recentLines = transactions
    .slice(0, 30)
    .map((t) => {
      const date = new Date(t.transacted_at).toLocaleDateString(info.locale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
      const sign = t.transaction_type === 'debit' ? '-' : '+';
      return `  - ${date}: ${sign}${formatMoney(t.amount, info)}  ${t.merchant}  [${t.category}]`;
    })
    .join('\n');

  // ── Splitwise balances ─────────────────────────────────────────────
  let swSection: string;
  if (!splitwise.connected) {
    swSection = 'Splitwise: not connected (no Splitwise balance data available).';
  } else if (splitwise.owe.length === 0 && splitwise.owedToMe.length === 0) {
    swSection =
      'Splitwise: connected and fully settled — the user owes nothing and nobody owes them.';
  } else {
    const oweLines = splitwise.owe
      .map(
        (i) =>
          `  - You owe ${i.name}: ${formatMoney(i.amountMinor, CURRENCY_INFO[i.currency] ?? info)}`,
      )
      .join('\n');
    const owedLines = splitwise.owedToMe
      .map(
        (i) =>
          `  - ${i.name} owes you: ${formatMoney(i.amountMinor, CURRENCY_INFO[i.currency] ?? info)}`,
      )
      .join('\n');
    swSection =
      `Splitwise balances (connected):\n` +
      `  Total you owe: ${formatMoney(splitwise.totalOweMinor, info)}\n` +
      (oweLines ? oweLines + '\n' : '') +
      owedLines;
  }

  return `USER CONTEXT (real data — use these numbers, do not invent others):

Name: ${profile.name}
Currency: ${info.name} (${currencyCode})
Monthly budget: ${formatMoney(budget, info)}
${profile.expected_monthly_income > 0 ? `Expected monthly income: ${formatMoney(profile.expected_monthly_income, info)}\n` : ''}
This calendar month (so far):
  Spent (debits): ${formatMoney(monthSpent, info)} (${pct}% of budget)
  Earned (credits): ${formatMoney(monthEarned, info)}
  Net: ${formatMoney(monthEarned - monthSpent, info)}
  Spending breakdown:
${byCategoryLines || '  (no debits yet this month)'}

Per-month totals across the user's full history (most recent first):
${monthlyLines || '  (no transactions yet)'}

${swSection}

Latest 30 transactions verbatim (most recent first):
${recentLines || '  (none)'}`;
}

function formatMoney(minorUnits: number, info: CurrencyInfo): string {
  const major = minorUnits / Math.pow(10, info.decimals);
  return new Intl.NumberFormat(info.locale, {
    style: 'currency',
    currency: lookupCode(info),
    minimumFractionDigits: 0,
    maximumFractionDigits: info.decimals,
  }).format(major);
}

function lookupCode(info: CurrencyInfo): string {
  for (const [code, v] of Object.entries(CURRENCY_INFO)) {
    if (v === info) return code;
  }
  return 'USD';
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
