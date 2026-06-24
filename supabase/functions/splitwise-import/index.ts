// supabase/functions/splitwise-import/index.ts
//
// Deno edge function: imports the calling user's Splitwise expenses into
// Pocket as transactions — but only the portion the user actually PAID
// (paid_share). That's money that left the user's pocket; the amount they
// merely OWE is analytics-only and handled by splitwise-balances, not here.
//
// Why paid_share and not the full cost: if a friend split a $1000 dinner the
// user didn't pay for, no money left the user's card, so it's not a Pocket
// transaction. When the user fronts $100 for the group, that $100 did leave
// their card → one debit transaction.
//
// Idempotent: re-running relies on the transactions dedup unique index
// (user_id, amount, merchant, transacted_at); duplicates are counted, not
// re-inserted. raw_sms is tagged "splitwise:<id>" for provenance.
//
// Returns 200 + { imported, duplicates, skipped, totalExpenses }.
//
// Env vars required:
//   SPLITWISE_API_KEY   — set via `npx supabase secrets set SPLITWISE_API_KEY=...`
// Auto-injected: SUPABASE_URL, SUPABASE_ANON_KEY

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const CURRENCY_DECIMALS: Record<string, number> = {
  USD: 2, EUR: 2, GBP: 2, JPY: 0, INR: 2, CNY: 2,
  AUD: 2, CAD: 2, CHF: 2, SGD: 2, KRW: 0, AED: 2,
};

type Category = 'Food' | 'Transport' | 'Shopping' | 'Entertainment' | 'Other';

// Deterministic map from Splitwise's category name to Pocket's 5 categories.
// Splitwise returns a sub-category name like "Bus/train" or "Dining out";
// "General" (its default) and anything unmatched fall through to Other.
function mapCategory(swName: string | undefined): Category {
  const n = (swName ?? '').toLowerCase();
  const has = (...words: string[]) => words.some((w) => n.includes(w));
  if (has('dining', 'restaurant', 'groceries', 'liquor', 'food', 'drink', 'dinner', 'lunch', 'breakfast', 'coffee')) return 'Food';
  if (has('bus', 'train', 'taxi', 'car', 'gas', 'fuel', 'parking', 'plane', 'bicycle', 'transport', 'hotel')) return 'Transport';
  if (has('clothing', 'electronics', 'household', 'home supplies', 'shopping', 'gift')) return 'Shopping';
  if (has('games', 'movies', 'music', 'sports', 'entertainment')) return 'Entertainment';
  return 'Other';
}

function toMinorUnits(amount: string, currency: string): number {
  const decimals = CURRENCY_DECIMALS[currency] ?? 2;
  return Math.round(Math.abs(parseFloat(amount)) * Math.pow(10, decimals));
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
      error: userError,
    } = await supabase.auth.getUser(jwt);
    if (userError || !user) {
      console.error('getUser failed', userError);
      return json({ error: 'Invalid auth', detail: userError?.message }, 401);
    }

    // Per-user OAuth token ONLY — no shared fallback.
    const { data: conn } = await supabase
      .from('splitwise_connections')
      .select('access_token')
      .maybeSingle();
    const splitwiseKey = conn?.access_token as string | undefined;
    if (!splitwiseKey) {
      return json({ error: 'Splitwise not connected' }, 400);
    }
    const swHeaders = { Authorization: `Bearer ${splitwiseKey}` };

    // 1. Who am I on Splitwise? Needed to find my paid_share in each expense.
    const meRes = await fetch(
      'https://secure.splitwise.com/api/v3.0/get_current_user',
      { headers: swHeaders },
    );
    if (!meRes.ok) {
      return json({ error: 'Splitwise auth failed', status: meRes.status }, 502);
    }
    const meData = await meRes.json();
    const myId: number | undefined = meData?.user?.id;
    if (typeof myId !== 'number') {
      return json({ error: 'Could not resolve Splitwise user id' }, 502);
    }

    // 2. Fetch expenses (cap at 200; skip deleted + settle-up payments).
    const expRes = await fetch(
      'https://secure.splitwise.com/api/v3.0/get_expenses?limit=200',
      { headers: swHeaders },
    );
    if (!expRes.ok) {
      return json({ error: 'Splitwise expenses fetch failed', status: expRes.status }, 502);
    }
    const expData = await expRes.json();
    const expenses: any[] = Array.isArray(expData?.expenses) ? expData.expenses : [];

    let imported = 0;
    let duplicates = 0;
    let skipped = 0;

    for (const e of expenses) {
      if (e.deleted_at || e.payment === true) {
        skipped++;
        continue;
      }
      const mine = Array.isArray(e.users)
        ? e.users.find((u: any) => u.user_id === myId)
        : null;
      const paidShare = mine ? parseFloat(mine.paid_share) : 0;
      if (!mine || !isFinite(paidShare) || paidShare <= 0) {
        skipped++; // user paid nothing on this expense
        continue;
      }

      const currency = (e.currency_code as string) ?? 'USD';
      const merchant = String(e.description ?? 'Splitwise expense').trim().slice(0, 120) || 'Splitwise expense';

      const { error: insErr } = await supabase.from('transactions').insert({
        user_id: user.id,
        amount: toMinorUnits(mine.paid_share, currency),
        merchant,
        category: mapCategory(e.category?.name),
        transaction_type: 'debit',
        transacted_at: e.date,
        raw_sms: `splitwise:${e.id}`,
      });

      if (insErr) {
        if (insErr.code === '23505') {
          duplicates++; // already imported (dedup index)
        } else {
          console.error('insert error for expense', e.id, insErr);
          skipped++;
        }
        continue;
      }
      imported++;
    }

    return json({ imported, duplicates, skipped, totalExpenses: expenses.length });
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
