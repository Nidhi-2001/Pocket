// supabase/functions/parse-sms/index.ts
//
// Deno edge function: takes one bank transaction notification (SMS body)
// from anywhere in the world, sends it to Groq's Llama 3.3 70B with a
// structured-output system prompt, validates the result, and writes a
// transaction row scoped to the calling user (RLS-enforced).
//
// Currency-aware: the function fetches the user's profile.currency and
// tells the LLM to return amounts in MINOR UNITS of that currency
// (cents for USD, paise for INR, yen for JPY since JPY has no minor unit).
// Ambiguous bare numbers are interpreted using the user's currency.
//
// Returns 200 + the inserted row on success, 200 + { valid: false } if
// the message isn't a transaction notification, 4xx/5xx on real errors.
//
// Env vars required (set via `npx supabase secrets set GROQ_API_KEY=...`):
//   GROQ_API_KEY        — from https://console.groq.com
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

const CATEGORIES = ['Food', 'Transport', 'Shopping', 'Entertainment', 'Other'] as const;
type Category = (typeof CATEGORIES)[number];

interface ParsedSms {
  valid: boolean;
  amount: number;
  merchant: string;
  category: Category;
  transaction_type: 'debit' | 'credit';
  transacted_at: string;
}

// Currency info embedded in the function so the prompt can describe minor
// units accurately to the LLM. Mirrors lib/currency.ts in the app.
const CURRENCY_INFO: Record<string, { symbol: string; name: string; decimals: number }> = {
  USD: { symbol: '$',  name: 'US Dollar',         decimals: 2 },
  EUR: { symbol: '€',  name: 'Euro',              decimals: 2 },
  GBP: { symbol: '£',  name: 'British Pound',     decimals: 2 },
  JPY: { symbol: '¥',  name: 'Japanese Yen',      decimals: 0 },
  INR: { symbol: '₹',  name: 'Indian Rupee',      decimals: 2 },
  CNY: { symbol: '¥',  name: 'Chinese Yuan',      decimals: 2 },
  AUD: { symbol: 'A$', name: 'Australian Dollar', decimals: 2 },
  CAD: { symbol: 'C$', name: 'Canadian Dollar',   decimals: 2 },
  CHF: { symbol: 'Fr', name: 'Swiss Franc',       decimals: 2 },
  SGD: { symbol: 'S$', name: 'Singapore Dollar',  decimals: 2 },
  KRW: { symbol: '₩',  name: 'Korean Won',        decimals: 0 },
  AED: { symbol: 'د.إ',name: 'UAE Dirham',        decimals: 2 },
};

function buildSystemPrompt(code: string): string {
  const info = CURRENCY_INFO[code] ?? CURRENCY_INFO.USD;
  const multiplier = Math.pow(10, info.decimals);
  const example1 = info.decimals > 0
    ? `"${info.symbol}29.99" → ${Math.round(29.99 * multiplier)}`
    : `"${info.symbol}3000" → ${3000 * multiplier}`;
  return `You parse bank transaction notification messages (SMS, email, app push) from anywhere in the world into structured data.

The user's currency is ${info.name} (${code}, symbol ${info.symbol}, ${info.decimals} decimal places).

Output ONLY a JSON object with EXACTLY these fields:
{
  "valid": boolean,
  "amount": integer in MINOR UNITS of the user's currency (major units × ${multiplier}),
  "merchant": string (cleaned merchant name in Title Case),
  "category": "Food" | "Transport" | "Shopping" | "Entertainment" | "Other",
  "transaction_type": "debit" | "credit",
  "transacted_at": ISO 8601 timestamp with timezone offset, e.g. "2026-03-24T14:30:00-04:00"
}

Set "valid": false (and amount: 0, merchant: "", category: "Other",
transaction_type: "debit", transacted_at: "2026-01-01T00:00:00+00:00") for
non-transaction messages: OTPs, marketing, balance alerts, statement
notifications, failed-transaction alerts, cheque alerts.

Amount handling:
- The user's currency is ${code}. Interpret bare numbers as ${code} unless the message clearly states another currency.
- Convert to MINOR UNITS by multiplying by ${multiplier}. ${example1}.
- Strip thousand separators (commas, dots in European format, etc.) before multiplying.

Merchant cleaning:
- Title Case. Strip generic suffixes like LIMITED, LTD, PVT, PRIVATE, INC, LLC, GMBH, CO, SERVICES, TECHNOLOGIES.
- Strip reference numbers, transaction IDs, and account fragments.
- Examples: "ZOMATO LIMITED" → "Zomato", "AMAZON SELLER SVCS PVT LTD" → "Amazon", "STARBUCKS COFFEE #1234" → "Starbucks".
- If unidentifiable, use "Unknown".

Category mapping (best guess based on the merchant):
- Food: restaurants, food delivery, grocery, cafes, bars/pubs with food focus.
- Transport: ride-share, taxi, fuel/gas, public transit, parking, vehicle service, fares.
- Shopping: e-commerce, retail, fashion, electronics, beauty, books, home goods.
- Entertainment: streaming, gaming, movies, concerts, sports, theme parks, bars/pubs without food focus.
- Other: salary/income, bank transfers, utilities, rent, EMI/mortgage, insurance, medical, fees, taxes, withdrawals, anything unidentifiable.

Date/time handling:
- Extract the date and time as they appear. Common formats: MM/DD/YYYY (US), DD/MM/YYYY (most other places), DD-MMM-YY, ISO 8601.
- If only the date is present, use 12:00:00 local time.
- Include the local timezone offset if the message includes a location/zone clue; otherwise use the calling user's region-of-currency default (e.g., -05:00 for US, +05:30 for India, +09:00 for Japan, +00:00 if unsure).
- Output MUST be valid ISO 8601 with offset.

Output the JSON object only — no commentary, no markdown code fence, no surrounding text.`;
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

    const body = await req.json().catch(() => null);
    const smsText: unknown = body?.smsText;
    if (typeof smsText !== 'string' || !smsText.trim()) {
      return json({ error: 'Request body must be { smsText: string }' }, 400);
    }
    if (smsText.length > 2000) {
      return json({ error: 'smsText too long (max 2000 chars)' }, 400);
    }

    const groqKey = Deno.env.get('GROQ_API_KEY');
    if (!groqKey) {
      console.error('GROQ_API_KEY env var is not set');
      return json({ error: 'Server misconfigured: missing GROQ_API_KEY' }, 500);
    }

    // Fetch the user's chosen currency for prompt-side context.
    const { data: profile } = await supabase
      .from('profiles')
      .select('currency')
      .maybeSingle();
    const currencyCode: string =
      (profile?.currency as string | undefined) ?? 'USD';

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
          messages: [
            { role: 'system', content: buildSystemPrompt(currencyCode) },
            { role: 'user', content: smsText },
          ],
          response_format: { type: 'json_object' },
          temperature: 0,
          max_tokens: 400,
        }),
      },
    );

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error('Groq API error:', groqRes.status, errText);
      return json({ error: 'AI provider error', status: groqRes.status }, 502);
    }

    const groqData = await groqRes.json();
    const content: string | undefined = groqData.choices?.[0]?.message?.content;
    if (!content) {
      return json({ error: 'AI returned empty response' }, 502);
    }

    let parsed: ParsedSms;
    try {
      parsed = JSON.parse(content);
    } catch {
      return json({ error: 'AI returned invalid JSON', raw: content }, 502);
    }

    if (!isValidParsedSms(parsed)) {
      return json(
        { error: 'AI returned unexpected structure', raw: parsed },
        502,
      );
    }

    if (!parsed.valid) {
      return json({ valid: false, message: 'Not a transaction notification' });
    }

    // Sanity-clamp the amount: 1 minor unit to 10^10 minor units.
    if (parsed.amount <= 0 || parsed.amount > 10_000_000_000) {
      return json(
        { error: 'AI returned unreasonable amount', amount: parsed.amount },
        502,
      );
    }

    const { data: inserted, error: insertError } = await supabase
      .from('transactions')
      .insert({
        user_id: user.id,
        amount: parsed.amount,
        merchant: parsed.merchant || 'Unknown',
        category: parsed.category,
        transaction_type: parsed.transaction_type,
        transacted_at: parsed.transacted_at,
        raw_sms: smsText,
      })
      .select()
      .single();

    if (insertError) {
      // 23505 = unique_violation. Our dedup index makes re-importing the
      // same (user, amount, merchant, transacted_at) idempotent.
      if (insertError.code === '23505') {
        return json({
          valid: true,
          duplicate: true,
          message: 'Already imported (dedup)',
          parsed,
        });
      }
      console.error('insert error:', insertError);
      return json(
        { error: 'Database error', detail: insertError.message },
        500,
      );
    }

    return json({ valid: true, transaction: inserted });
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

function isValidParsedSms(p: unknown): p is ParsedSms {
  if (typeof p !== 'object' || p === null) return false;
  const o = p as Record<string, unknown>;
  return (
    typeof o.valid === 'boolean' &&
    typeof o.amount === 'number' &&
    Number.isInteger(o.amount) &&
    typeof o.merchant === 'string' &&
    typeof o.category === 'string' &&
    CATEGORIES.includes(o.category as Category) &&
    (o.transaction_type === 'debit' || o.transaction_type === 'credit') &&
    typeof o.transacted_at === 'string'
  );
}
