// supabase/functions/chat-agent/index.ts
//
// Deno edge function. Takes a conversation history and returns the next
// assistant message. The assistant is grounded in the caller's actual
// recent transactions, monthly budget, and per-category month-to-date
// totals — so it can answer questions like "What did I spend on food
// this month?" with real numbers from the user's own data.
//
// Provider: Groq (llama-3.3-70b-versatile). Same model + key as
// parse-sms (set via `npx supabase secrets set GROQ_API_KEY=...`).
//
// Request:  { messages: [{ role: 'user' | 'assistant', content: string }, ...] }
// Response: { message: { role: 'assistant', content: string } }
//           or { error: string, ... } with 4xx/5xx status.

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
  monthly_budget: number; // paise
}

interface TransactionLite {
  amount: number; // paise
  merchant: string;
  category: string;
  transaction_type: 'debit' | 'credit';
  transacted_at: string;
}

const SYSTEM_PROMPT = `You are Pocket — a friendly money assistant for Indian college students and young professionals (18-26).

You have the user's real recent transactions, monthly budget, and month-to-date breakdown (provided in the next message). Use that data to answer concretely. Never invent numbers or transactions you don't see.

Style:
- Warm but direct, like a smart friend. Not a finance lecturer.
- Concise: 2-4 sentences usually. Long answers only when the user explicitly asks for detail.
- Format money as ₹ with Indian comma style. Examples: ₹1,299 / ₹50,000 / ₹1,23,456. Whole rupees by default; show paise only if it materially matters.
- Honest about expensive splurges if the user asks. No moralising about spending choices unless asked.
- If the user asks about a category or time range with no data, say so explicitly instead of making something up.
- No legal/financial disclaimers. No "I'm an AI" preambles. Just answer.
- All dates in IST.

Categories you'll see in the data: Food, Transport, Shopping, Entertainment, Other.`;

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
      return json(
        { error: 'Last message must be from the user' },
        400,
      );
    }
    if (last.content.length > 2000) {
      return json({ error: 'Message too long (max 2000 chars)' }, 400);
    }

    const groqKey = Deno.env.get('GROQ_API_KEY');
    if (!groqKey) {
      console.error('GROQ_API_KEY env var not set');
      return json({ error: 'Server misconfigured: missing GROQ_API_KEY' }, 500);
    }

    // Grounding: pull profile + last 60 days of transactions.
    const now = new Date();
    const since = new Date(now);
    since.setDate(now.getDate() - 60);

    const [profileRes, txRes] = await Promise.all([
      supabase.from('profiles').select('name, monthly_budget').single(),
      supabase
        .from('transactions')
        .select('amount, merchant, category, transaction_type, transacted_at')
        .gte('transacted_at', since.toISOString())
        .order('transacted_at', { ascending: false })
        .limit(60),
    ]);

    const profile = (profileRes.data ?? null) as ProfileLite | null;
    const transactions = (txRes.data ?? []) as TransactionLite[];

    const groundingText = buildGrounding(profile, transactions, now);

    const groqMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'system', content: groundingText },
      // Keep the last 15 user/assistant turns to control context size.
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
  now: Date,
): string {
  if (!profile) {
    return 'USER CONTEXT: profile not available. Answer politely that you can\'t see their data right now.';
  }

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthTxs = transactions.filter(
    (t) =>
      new Date(t.transacted_at) >= monthStart && t.transaction_type === 'debit',
  );
  const monthSpent = monthTxs.reduce((s, t) => s + t.amount, 0);
  const budget = profile.monthly_budget;
  const pct = budget > 0 ? Math.round((monthSpent / budget) * 100) : 0;

  const byCategory: Record<string, number> = {};
  for (const t of monthTxs) {
    byCategory[t.category] = (byCategory[t.category] ?? 0) + t.amount;
  }
  const byCategoryLines = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, amt]) => `  - ${cat}: ${formatRupees(amt)}`)
    .join('\n');

  const recentLines = transactions
    .slice(0, 25)
    .map((t) => {
      const date = new Date(t.transacted_at).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        timeZone: 'Asia/Kolkata',
      });
      const sign = t.transaction_type === 'debit' ? '-' : '+';
      return `  - ${date}: ${sign}${formatRupees(t.amount)}  ${t.merchant}  [${t.category}]`;
    })
    .join('\n');

  return `USER CONTEXT (real data — use these numbers, do not invent others):

Name: ${profile.name}
Monthly budget: ${formatRupees(budget)}

This calendar month (so far):
  Spent (debits only): ${formatRupees(monthSpent)} (${pct}% of budget)
  Remaining: ${formatRupees(Math.max(0, budget - monthSpent))}
  Breakdown:
${byCategoryLines || '  (no debits yet this month)'}

Last 25 transactions (most recent first, last 60 days):
${recentLines || '  (none)'}`;
}

function formatRupees(paise: number): string {
  const rupees = paise / 100;
  return (
    '₹' +
    rupees.toLocaleString('en-IN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
