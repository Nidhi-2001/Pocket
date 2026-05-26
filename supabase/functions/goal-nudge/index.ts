// supabase/functions/goal-nudge/index.ts
//
// Generates a friendly nudge for each user based on their recent spending
// and active goals, and writes it into public.nudges.
//
// Designed to be invoked TWO ways:
//
//   1) Cron / batch mode (Bearer = SUPABASE_SERVICE_ROLE_KEY):
//      - Without body                       → processes ALL profiles
//      - With body { user_id: "<uuid>" }    → only that user
//
//   2) User mode (Bearer = a user's JWT, as supabase.functions.invoke sends):
//      - Always processes just the calling user. Used by the app for an
//        on-demand "give me a nudge now" button.
//
// In either mode the function fetches the target user's profile, this-
// month debits, and active goals, asks Groq for a short nudge in
// structured JSON, and inserts a public.nudges row.
//
// Response: { processed, results: [{ user_id, success?, error?, message? }] }

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

const SYSTEM_PROMPT = `You write a single short nudge for a money-tracking app's user.

Input: a JSON blob describing one user's name, monthly budget, this-month spending so far, and active savings goals.

Output: ONE JSON object with exactly these fields:
{
  "type": "budget_warning" | "goal_check" | "weekly_digest",
  "message": string (1-2 sentences, MAX 200 chars, no leading emoji)
}

Choose type:
- "budget_warning" if the user has spent >70% of their monthly budget, or is on track to overshoot
- "goal_check" if the user has active goals and progress is notable (good or behind)
- "weekly_digest" otherwise — a chatty observation about recent spend

Voice: warm friend, not a finance lecturer. Indian comma format (₹1,299). Mention specific numbers. Don't moralise. Don't say "you should". Suggestions are fine.

Examples:
{ "type": "budget_warning", "message": "You're at ₹14,200 out of ₹20,000 this month — 71%. Three weeks left, ease up on the weekend orders maybe?" }
{ "type": "goal_check", "message": "Tokyo trip is 30% there. At ₹2,000/week you'll hit ₹50,000 by mid-August — solid pace." }
{ "type": "weekly_digest", "message": "Spent ₹1,150 on Food this week, mostly Swiggy. Mid-week cooking would save around ₹600/week." }

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

    // Service-role client bypasses RLS — used for reading every user's data.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const body = await req.json().catch(() => ({}));

    let targetUserIds: string[] | null = null;

    if (isServiceRole) {
      const bodyUid: string | undefined = body?.user_id;
      if (bodyUid) targetUserIds = [bodyUid];
      // else: leave null → process all profiles below
    } else {
      // User-JWT mode. Verify and scope to that user only.
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

    // Fetch the target profiles (one or all).
    let profileQuery = admin
      .from('profiles')
      .select('id, name, monthly_budget');
    if (targetUserIds) {
      profileQuery = profileQuery.in('id', targetUserIds);
    }
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
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userBlob },
              ],
              response_format: { type: 'json_object' },
              temperature: 0.7,
              max_tokens: 250,
            }),
          },
        );

        if (!groqRes.ok) {
          results.push({
            user_id: p.id,
            error: `groq ${groqRes.status}`,
          });
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
    .map(([c, v]) => `  ${c}: ${formatRupees(v)}`)
    .join('\n');

  const goalLines = goals
    .map((g) => {
      const gpct = g.target_amount > 0
        ? Math.round((g.current_amount / g.target_amount) * 100)
        : 0;
      const dl = g.deadline ? `, deadline ${g.deadline}` : '';
      return `  ${g.emoji} ${g.title}: ${formatRupees(g.current_amount)} / ${formatRupees(g.target_amount)} (${gpct}%${dl})`;
    })
    .join('\n');

  return `User: ${p.name}
Today: day ${dayOfMonth} of ${daysInMonth}
Monthly budget: ${formatRupees(p.monthly_budget)}
Spent so far this month (debits): ${formatRupees(spent)} (${pct}% of budget)
Remaining: ${formatRupees(Math.max(0, p.monthly_budget - spent))}

By category this month:
${catLines || '  (no debits this month)'}

Active goals:
${goalLines || '  (none)'}`;
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
