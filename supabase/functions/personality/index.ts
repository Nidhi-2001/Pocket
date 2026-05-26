// supabase/functions/personality/index.ts
//
// Generates a "Spending Personality" card for each user from their previous
// month's transactions and writes it into public.personalities.
//
// Same dual-mode auth as goal-nudge:
//
//   1) Cron / batch mode (Bearer = SUPABASE_SERVICE_ROLE_KEY):
//      - Without body                                  → all profiles
//      - With body { user_id: "<uuid>" }               → only that user
//      - With body { month: "YYYY-MM" }                → override target month
//
//   2) User mode (Bearer = user JWT):
//      - Always scoped to the calling user.
//
// Target month defaults to LAST calendar month. The personalities table
// has unique(user_id, month) so re-running is idempotent (we upsert).
//
// Response: { processed, results: [{ user_id, success?, error?, ... }] }

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
}

interface TxLite {
  amount: number;
  merchant: string;
  category: string;
  transaction_type: 'debit' | 'credit';
  transacted_at: string;
}

const SYSTEM_PROMPT = `You generate a "Spending Personality" card for a money-tracking app's user, based on ONE month of their transactions.

Output ONE JSON object with EXACTLY these fields:
{
  "type": short snake_case slug, e.g. "weekend_splurger" | "food_explorer" | "savings_machine" | "balanced_spender" | "shopping_specialist" | "transport_traveler" | "entertainment_enthusiast" | "minimalist" | "social_butterfly",
  "title": string, max 40 chars, fun and slightly affectionate (e.g. "The Weekend Splurger"),
  "emoji": single emoji that captures the vibe,
  "insights": string[] — 2 or 3 specific observations citing ACTUAL numbers from the data (₹ amounts, merchants, day patterns),
  "actions": string[] — 1 or 2 light, friendly suggestions. Not lectures.
}

Voice: warm, observational friend. Specific over generic. Mention real merchants, real ₹ amounts (Indian comma format ₹1,299). Don't moralise. Don't say "you should save more" — say something concrete instead.

Example output:
{
  "type": "weekend_splurger",
  "title": "The Weekend Splurger",
  "emoji": "🎉",
  "insights": [
    "Your Saturdays cost ₹1,800 on average — almost half your weekly outflow",
    "Top weekend merchants: Swiggy (₹2,200), BookMyShow (₹1,100), Uber (₹950)"
  ],
  "actions": [
    "A ₹2,500 weekend cap would free up ₹3,000/month for your Tokyo goal"
  ]
}

Output the JSON object only — no markdown, no other text.`;

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

    // Pick the target month. Default: last calendar month.
    const month = pickTargetMonth(body?.month);
    const monthStart = new Date(`${month}-01T00:00:00+05:30`);
    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);

    let profileQuery = admin.from('profiles').select('id, name');
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
                { role: 'system', content: SYSTEM_PROMPT },
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

        // Upsert on (user_id, month). Re-running for the same user/month
        // simply replaces the row.
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
  // Default: previous calendar month relative to "now in IST".
  const now = new Date();
  const istNow = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  istNow.setUTCDate(1);
  istNow.setUTCMonth(istNow.getUTCMonth() - 1);
  const y = istNow.getUTCFullYear();
  const m = String(istNow.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function formatUserBlob(p: ProfileLite, txs: TxLite[], month: string): string {
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
    .map(([c, v]) => `  ${c}: ${formatRupees(v)}`)
    .join('\n');

  const topMerchants = Object.entries(byMerchant)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([m, v]) => `  ${m}: ${formatRupees(v)}`)
    .join('\n');

  // Day-of-week pattern
  const dowTotals = [0, 0, 0, 0, 0, 0, 0]; // Sun-Sat in IST
  for (const t of debits) {
    const dt = new Date(t.transacted_at);
    const dow = new Date(dt.getTime() + 5.5 * 60 * 60 * 1000).getUTCDay();
    dowTotals[dow] += t.amount;
  }
  const dowLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dowLines = dowTotals
    .map((v, i) => `  ${dowLabels[i]}: ${formatRupees(v)}`)
    .join('\n');

  return `User: ${p.name}
Month analysed: ${month}
Number of transactions (debits): ${debits.length}
Total spent (debits): ${formatRupees(totalSpent)}

By category:
${catLines || '  (none)'}

Top merchants:
${topMerchants || '  (none)'}

By day of week:
${dowLines}`;
}

function formatRupees(paise: number): string {
  return (
    '₹' +
    (paise / 100).toLocaleString('en-IN', {
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
