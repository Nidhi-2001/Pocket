// supabase/functions/parse-sms/index.ts
//
// Deno edge function: takes one Indian bank SMS, sends it to Groq's Llama 3.3
// 70B with a structured-output system prompt, validates the result, and writes
// a transaction row scoped to the calling user (RLS-enforced via the user's
// own JWT).
//
// Returns 200 + the inserted row on success, 200 + { valid: false } if the SMS
// isn't a transaction, 401/4xx/5xx on real errors.
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

const SYSTEM_PROMPT = `You parse Indian bank notification SMS into structured transaction data.

Output ONLY a JSON object with EXACTLY these fields:
{
  "valid": boolean,
  "amount": integer (in PAISE — that is, rupees * 100),
  "merchant": string (cleaned merchant name in Title Case),
  "category": "Food" | "Transport" | "Shopping" | "Entertainment" | "Other",
  "transaction_type": "debit" | "credit",
  "transacted_at": ISO 8601 timestamp in IST, e.g. "2026-03-24T14:30:00+05:30"
}

Set "valid": false (and amount: 0, merchant: "", category: "Other",
transaction_type: "debit", transacted_at: "2026-01-01T00:00:00+05:30") if the
SMS is NOT a real transaction notification — that is, if it is any of:
- OTP / verification codes
- Marketing or promotional SMS
- Balance inquiries / "available balance is" alerts
- Cheque alerts
- Auto-debit / standing-instruction reminders
- Failed transaction notifications
- Statement notifications

Amount conversion:
- "Rs.299" → 29900
- "Rs.299.50" → 29950
- "Rs.1,234.56" → 123456
- "INR 50,000.00" → 5000000

Merchant cleaning:
- Strip "LIMITED", "LTD", "PVT", "PRIVATE", "INC", "INDIA", "SERVICES",
  "TECHNOLOGIES" etc. Strip reference numbers.
- "ZOMATO LIMITED" → "Zomato"
- "AMAZON SELLER SVCS PVT LTD" → "Amazon"
- "UBER INDIA SYSTEMS PRIVATE LIMITED" → "Uber"
- "BIG BASKET" → "BigBasket"
- If you cannot identify the merchant clearly, use "Unknown".

Category mapping (best guess):
- Food: restaurants, food delivery (Zomato, Swiggy), grocery (BigBasket,
  Blinkit, DMart), cafes (Starbucks, CCD).
- Transport: ride-share (Uber, Ola, Rapido), fuel (HP, IOC, Shell, BPCL),
  metro, auto, parking, vehicle service.
- Shopping: e-commerce (Amazon, Flipkart, Myntra, Ajio, Nykaa), retail,
  fashion, electronics, beauty, books.
- Entertainment: streaming (Netflix, Spotify, Hotstar, Prime Video, JioSaavn),
  gaming, movies (BookMyShow, PVR), bars / pubs, events.
- Other: salary, transfers (NEFT/IMPS/UPI to a person), utilities (electricity,
  water, internet, mobile recharge), rent, EMI, insurance, medical, fees,
  cash withdrawals, and anything you cannot confidently place above.

Dates and times:
- Indian SMS use DD-MMM-YY, DD-MMM-YYYY, DD/MM/YYYY, or DD-MM-YYYY. Treat
  ambiguous DD/MM dates as Indian (day first).
- If only date is present, use 12:00:00 IST.
- "24-MAR-26" → "2026-03-24T..."  ("26" means 2026 in our project timeline)
- Output MUST be valid ISO 8601 ending in "+05:30".

Examples (study these patterns carefully):

INPUT: "Dear UPI user A/C *1234 debited Rs.299.00 on 24-MAR-26 trf to ZOMATO LTD Refno 6022334455 not you? call 1800XXX"
OUTPUT: {"valid":true,"amount":29900,"merchant":"Zomato","category":"Food","transaction_type":"debit","transacted_at":"2026-03-24T12:00:00+05:30"}

INPUT: "INR 50000.00 credited to A/C *5678 on 01-MAY-26 from SALARY-ACME INC. Avbl Bal INR 65000.00."
OUTPUT: {"valid":true,"amount":5000000,"merchant":"Acme","category":"Other","transaction_type":"credit","transacted_at":"2026-05-01T12:00:00+05:30"}

INPUT: "Rs.450 debited from A/C **5432 on 15-MAR-26 14:32 toward UBER INDIA SYSTEMS PVT LTD. Refno: AX9876"
OUTPUT: {"valid":true,"amount":45000,"merchant":"Uber","category":"Transport","transaction_type":"debit","transacted_at":"2026-03-15T14:32:00+05:30"}

INPUT: "Your OTP for ICICI Net Banking is 567832. Valid for 5 mins. Do not share."
OUTPUT: {"valid":false,"amount":0,"merchant":"","category":"Other","transaction_type":"debit","transacted_at":"2026-01-01T00:00:00+05:30"}

INPUT: "OFFER: Get 10% cashback on Big Bazaar purchases this weekend! Use code BIGBAZAAR10. T&C apply."
OUTPUT: {"valid":false,"amount":0,"merchant":"","category":"Other","transaction_type":"debit","transacted_at":"2026-01-01T00:00:00+05:30"}

Output the JSON object only — no commentary, no markdown code fence, no surrounding text.`;

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

    // Supabase client scoped to the calling user — RLS will enforce ownership.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    // Extract the raw JWT and validate it explicitly. Passing the token to
    // getUser() does a server-side verification call and avoids any quirk
    // where createClient's global header doesn't propagate into auth.getUser.
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
          tokenPrefix: jwt.slice(0, 12) + '…',
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
            { role: 'system', content: SYSTEM_PROMPT },
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
      return json({ valid: false, message: 'Not a transaction SMS' });
    }

    // Sanity-clamp the amount: 1 paise to ₹10 crore (10^9 paise).
    if (parsed.amount <= 0 || parsed.amount > 1_000_000_000) {
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
      // Postgres 23505 = unique_violation. Our dedup index makes a second
      // import of the same (user, amount, merchant, transacted_at) idempotent.
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
