// supabase/functions/splitwise-balances/index.ts
//
// Deno edge function: returns the calling user's Splitwise balances — who
// they owe and who owes them — for the "You owe" visualization on Spends.
//
// It calls Splitwise's get_friends endpoint server-side (the Splitwise key
// never touches the app bundle, per project invariant) and reshapes the
// per-friend net balances into minor-unit amounts the app already knows how
// to render via formatCurrency.
//
// Splitwise convention: a friend's balance.amount is SIGNED.
//   negative  → the user owes that friend
//   positive  → that friend owes the user
//
// Returns 200 + { owe: [...], owedToMe: [...], totalOweMinor, currency }.
//
// Env vars required (set via `npx supabase secrets set SPLITWISE_API_KEY=...`):
//   SPLITWISE_API_KEY   — personal API key (test account) / later: per-user OAuth token
//
// Auto-injected by Supabase (no setup needed):
//   SUPABASE_URL
//   SUPABASE_ANON_KEY

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Minor-unit decimals per currency. Mirrors lib/currency.ts in the app and
// CURRENCY_INFO in parse-sms. JPY/KRW have no minor unit (0 decimals).
const CURRENCY_DECIMALS: Record<string, number> = {
  USD: 2, EUR: 2, GBP: 2, JPY: 0, INR: 2, CNY: 2,
  AUD: 2, CAD: 2, CHF: 2, SGD: 2, KRW: 0, AED: 2,
};

interface BalanceItem {
  name: string;
  amountMinor: number; // positive magnitude in minor units
  currency: string;
}

// "354.15" + "USD" -> 35415. Rounds to avoid float drift.
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
      return json(
        {
          error: 'Invalid auth',
          detail: userError?.message ?? 'no user resolved from JWT',
        },
        401,
      );
    }

    // Per-user OAuth token if the user connected Splitwise; otherwise fall
    // back to the shared test key so the dev/test flow keeps working.
    let splitwiseKey = Deno.env.get('SPLITWISE_API_KEY');
    const { data: conn } = await supabase
      .from('splitwise_connections')
      .select('access_token')
      .maybeSingle();
    if (conn?.access_token) splitwiseKey = conn.access_token;
    if (!splitwiseKey) {
      return json({ error: 'Splitwise not connected' }, 400);
    }

    const swRes = await fetch(
      'https://secure.splitwise.com/api/v3.0/get_friends',
      { headers: { Authorization: `Bearer ${splitwiseKey}` } },
    );

    if (!swRes.ok) {
      const errText = await swRes.text();
      console.error('Splitwise API error:', swRes.status, errText);
      return json({ error: 'Splitwise provider error', status: swRes.status }, 502);
    }

    const swData = await swRes.json();
    const friends: any[] = Array.isArray(swData?.friends) ? swData.friends : [];

    const owe: BalanceItem[] = [];
    const owedToMe: BalanceItem[] = [];
    let totalOweMinor = 0;
    let currency = 'USD'; // surfaced for the chart header; first owed currency wins

    for (const f of friends) {
      const name = `${f.first_name ?? ''} ${f.last_name ?? ''}`.trim() || 'Unknown';
      const balances: any[] = Array.isArray(f.balance) ? f.balance : [];
      for (const b of balances) {
        const amt = parseFloat(b.amount);
        if (!isFinite(amt) || amt === 0) continue;
        const cc = (b.currency_code as string) ?? 'USD';
        const item: BalanceItem = {
          name,
          amountMinor: toMinorUnits(b.amount, cc),
          currency: cc,
        };
        if (amt < 0) {
          owe.push(item);
          totalOweMinor += item.amountMinor;
          currency = cc;
        } else {
          owedToMe.push(item);
        }
      }
    }

    // Largest debt first — the chart reads top-to-bottom.
    owe.sort((a, b) => b.amountMinor - a.amountMinor);
    owedToMe.sort((a, b) => b.amountMinor - a.amountMinor);

    return json({ owe, owedToMe, totalOweMinor, currency });
  } catch (err: any) {
    console.error('Unexpected error:', err);
    return json(
      { error: 'Unexpected error', detail: String(err?.message ?? err) },
      500,
    );
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
