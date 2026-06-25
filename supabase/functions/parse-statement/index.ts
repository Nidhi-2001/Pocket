// supabase/functions/parse-statement/index.ts
//
// Takes a credit card / bank statement PDF that the user uploaded to the
// 'statements' Storage bucket, extracts its text with unpdf, sends it to
// Groq's Llama 3.3 70B with a statement-parser system prompt, validates
// each returned transaction, bulk-inserts into public.transactions with
// source='statement', and reports back to the app.
//
// Dedup: the unique(user_id, amount, merchant, transacted_at) constraint
// catches exact duplicates (e.g. the same purchase already came in via
// SMS). Conflicting rows are skipped silently and counted as duplicates.
//
// Request: { uploadId: string, storagePath: string }
// Response: { inserted: number, skipped: number, total: number } on success;
//           { error: string, ... } on failure.
//
// Env: GROQ_API_KEY (Supabase secret), SUPABASE_URL, SUPABASE_ANON_KEY,
//      SUPABASE_SERVICE_ROLE_KEY (auto-injected).

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { extractText, getDocumentProxy } from 'https://esm.sh/unpdf@0.12.1';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const CATEGORIES = ['Food', 'Transport', 'Shopping', 'Entertainment', 'Other'] as const;
type Category = (typeof CATEGORIES)[number];

interface ParsedTx {
  amount: number;
  merchant: string;
  category: Category;
  transaction_type: 'debit' | 'credit';
  transacted_at: string;
}

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
  const mult = Math.pow(10, info.decimals);
  return `You parse text extracted from a credit card / bank statement PDF into structured transaction data.

The text may contain headers, balance summaries, payment information, terms & conditions, and marketing in addition to the transaction list. IGNORE everything that is not a real transaction row. Specifically:
- Skip opening / closing balance rows
- Skip "Total / Subtotal / Available credit" rows
- Skip payment confirmation rows ("Payment received - thank you")
- Skip annual fees, late fees, interest charges UNLESS they are explicitly itemized purchases the user made
- Skip page numbers, headers, footers, addresses, terms

The user's currency is ${info.name} (${code}, symbol ${info.symbol}, ${info.decimals} decimal places). Convert every amount to MINOR UNITS (multiply major-unit amounts by ${mult}).

Output ONLY a JSON object with this exact shape:
{
  "transactions": [
    {
      "amount": integer (minor units),
      "merchant": "string (cleaned merchant name in Title Case)",
      "category": "Food" | "Transport" | "Shopping" | "Entertainment" | "Other",
      "transaction_type": "debit" | "credit",
      "transacted_at": "ISO 8601 timestamp with offset (e.g. 2026-05-24T12:00:00+00:00)"
    },
    ...
  ]
}

If no transactions can be confidently extracted, return { "transactions": [] }.

Merchant cleaning:
- Title Case. Strip generic corporate suffixes (LIMITED, LTD, PVT, PRIVATE, INC, LLC, GMBH, CO, INDIA, USA).
- Strip reference numbers, transaction IDs, location codes.
- "AMAZON MKTPL*A12B3CD" → "Amazon"
- "STARBUCKS #1234 SEATTLE WA" → "Starbucks"
- "UBER TRIP HELP.UBER.COM" → "Uber"

Categories (best guess from merchant):
- Food: restaurants, food delivery, grocery, cafes, bars-with-food
- Transport: ride-share, fuel, transit, parking, vehicle service
- Shopping: e-commerce, retail, fashion, electronics, beauty, books
- Entertainment: streaming, movies, gaming, concerts, bars-without-food
- Other: salary, transfers, utilities, rent, EMI/mortgage, insurance, medical, fees, taxes, withdrawals, anything unidentifiable

Dates:
- Statements use various date formats: MM/DD, MM/DD/YY, DD/MM/YYYY, DD-MMM-YY, etc.
- Use the statement's year if printed; otherwise infer from context (most statements cover one billing cycle in a single calendar year).
- If only date (no time), use 12:00:00 with offset matching the statement origin (use +00:00 if unsure).

Transaction type:
- 'debit' for purchases / charges
- 'credit' for refunds, returns, statement credits, cashback

Output the JSON object only — no markdown, no commentary.`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  let uploadId: string | null = null;
  let admin: ReturnType<typeof createClient> | null = null;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Missing Authorization' }, 401);
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
    if (!GROQ_API_KEY) {
      return json({ error: 'Server misconfigured: missing GROQ_API_KEY' }, 500);
    }

    // Verify the user.
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

    // Service-role client used for storage download + insert. Bypasses RLS;
    // we manually check user ownership of the upload row below.
    admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const body = await req.json().catch(() => null);
    uploadId = body?.uploadId as string | null;
    const storagePath = body?.storagePath as string | null;
    if (!uploadId || !storagePath) {
      return json(
        { error: 'Request body must be { uploadId, storagePath }' },
        400,
      );
    }

    // Confirm the upload row belongs to the caller, and read the storage path
    // FROM THE ROW — never trust the client-supplied path. (Otherwise a caller
    // could pass their own uploadId with another user's storagePath and have
    // that user's statement downloaded via the service-role client.)
    const { data: upload, error: upErr } = await admin
      .from('statement_uploads')
      .select('id, user_id, storage_path')
      .eq('id', uploadId)
      .single();
    if (upErr || !upload) {
      return json({ error: 'Upload row not found' }, 404);
    }
    if (upload.user_id !== user.id) {
      return json({ error: 'Forbidden' }, 403);
    }
    const ownedPath = upload.storage_path as string | null;
    if (!ownedPath) {
      return json({ error: 'Upload row missing storage path' }, 400);
    }

    // Mark processing.
    await admin
      .from('statement_uploads')
      .update({ status: 'processing' })
      .eq('id', uploadId);

    // Pull the user's currency so the prompt can interpret amounts correctly.
    const { data: profile } = await admin
      .from('profiles')
      .select('currency')
      .eq('id', user.id)
      .maybeSingle();
    const currencyCode = (profile?.currency as string | undefined) ?? 'USD';

    // Download the PDF from Storage.
    const { data: pdfBlob, error: dlErr } = await admin.storage
      .from('statements')
      .download(ownedPath);
    if (dlErr || !pdfBlob) {
      await failUpload(admin, uploadId, dlErr?.message ?? 'download failed');
      return json({ error: 'Failed to download PDF', detail: dlErr?.message }, 500);
    }

    // Extract text. unpdf returns one string with all pages merged.
    let pdfText: string;
    try {
      const arrayBuf = await pdfBlob.arrayBuffer();
      const pdf = await getDocumentProxy(new Uint8Array(arrayBuf));
      const result = await extractText(pdf, { mergePages: true });
      pdfText = typeof result.text === 'string'
        ? result.text
        : (result.text as string[]).join('\n');
    } catch (e: any) {
      await failUpload(admin, uploadId, `PDF extract failed: ${e?.message ?? e}`);
      return json({ error: 'Failed to extract PDF text', detail: String(e?.message ?? e) }, 422);
    }

    if (!pdfText || pdfText.trim().length < 50) {
      await failUpload(admin, uploadId, 'PDF appears empty or unreadable');
      return json({ error: 'PDF appears empty or unreadable' }, 422);
    }

    // Send to Groq. Groq's free tier llama-3.3-70b has a 12,000 TPM limit.
    // We size every part of the request to keep the total below ~11,500
    // tokens. Token estimate: ~3.5 chars/token average.
    const TPM_BUDGET = 11_500;
    const SYSTEM_PROMPT_TOKENS = 1_200; // rough cap for our prompt
    const SAFETY_BUFFER = 300;

    // Hard-cap input text so a giant PDF can't blow the budget by itself.
    const inputCharCap = 28_000; // ~8000 tokens
    const inputText = pdfText.slice(0, inputCharCap);
    const inputTokenEstimate = Math.ceil(inputText.length / 3.5);

    const availableForOutput =
      TPM_BUDGET - SYSTEM_PROMPT_TOKENS - inputTokenEstimate - SAFETY_BUFFER;
    const maxOutputTokens = Math.max(800, Math.min(4_000, availableForOutput));

    if (maxOutputTokens < 800) {
      await failUpload(
        admin,
        uploadId,
        `PDF text too large (${pdfText.length} chars) for the free-tier token budget.`,
      );
      return json(
        {
          error: 'PDF too large for one request',
          detail:
            'Your statement extracts to more text than Groq\'s free tier allows in one shot. We\'ll add chunking for big PDFs in a follow-up.',
          pdfTextLength: pdfText.length,
        },
        413,
      );
    }

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
            { role: 'system', content: buildSystemPrompt(currencyCode) },
            { role: 'user', content: inputText },
          ],
          response_format: { type: 'json_object' },
          temperature: 0,
          max_tokens: maxOutputTokens,
        }),
      },
    );

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      await failUpload(admin, uploadId, `Groq ${groqRes.status}: ${errText.slice(0, 200)}`);
      return json(
        {
          error: 'AI provider error',
          status: groqRes.status,
          detail: errText.slice(0, 500),
          pdfTextLength: pdfText.length,
        },
        502,
      );
    }

    const groqData = await groqRes.json();
    const content: string | undefined = groqData?.choices?.[0]?.message?.content;
    if (!content) {
      await failUpload(admin, uploadId, 'AI returned empty response');
      return json({ error: 'AI returned empty response' }, 502);
    }

    let parsed: { transactions?: ParsedTx[] };
    try {
      parsed = JSON.parse(content);
    } catch {
      await failUpload(admin, uploadId, 'AI returned invalid JSON');
      return json({ error: 'AI returned invalid JSON', raw: content.slice(0, 500) }, 502);
    }

    const txs = Array.isArray(parsed.transactions) ? parsed.transactions : [];
    const validTxs = txs.filter(isValidTx);

    if (validTxs.length === 0) {
      await admin
        .from('statement_uploads')
        .update({
          status: 'completed',
          transaction_count: 0,
          duplicates_skipped: 0,
          processed_at: new Date().toISOString(),
        })
        .eq('id', uploadId);
      return json({
        inserted: 0,
        skipped: 0,
        total: 0,
        message: 'No transactions found in the statement.',
      });
    }

    // Bulk insert. The unique(user_id, amount, merchant, transacted_at)
    // constraint dedupes any rows that already exist (typically because
    // they came in via SMS earlier).
    const rows = validTxs.map((tx) => ({
      user_id: user.id,
      amount: tx.amount,
      merchant: tx.merchant || 'Unknown',
      category: tx.category,
      transaction_type: tx.transaction_type,
      transacted_at: tx.transacted_at,
      source: 'statement',
      raw_sms: null,
    }));

    let inserted = 0;
    let skipped = 0;

    // Insert one at a time so we can count dedup hits per row.
    for (const row of rows) {
      const { error: insErr } = await admin.from('transactions').insert(row);
      if (!insErr) {
        inserted++;
      } else if ((insErr as any).code === '23505') {
        skipped++;
      } else {
        console.error('insert error:', insErr);
      }
    }

    await admin
      .from('statement_uploads')
      .update({
        status: 'completed',
        transaction_count: inserted,
        duplicates_skipped: skipped,
        processed_at: new Date().toISOString(),
      })
      .eq('id', uploadId);

    return json({
      inserted,
      skipped,
      total: validTxs.length,
    });
  } catch (err: any) {
    console.error('Unexpected error:', err);
    if (admin && uploadId) {
      await failUpload(admin, uploadId, String(err?.message ?? err));
    }
    return json(
      { error: 'Unexpected error', detail: String(err?.message ?? err) },
      500,
    );
  }
});

async function failUpload(
  admin: ReturnType<typeof createClient>,
  uploadId: string,
  message: string,
) {
  await admin
    .from('statement_uploads')
    .update({
      status: 'failed',
      error_message: message.slice(0, 500),
      processed_at: new Date().toISOString(),
    })
    .eq('id', uploadId);
}

function isValidTx(p: unknown): p is ParsedTx {
  if (typeof p !== 'object' || p === null) return false;
  const o = p as Record<string, unknown>;
  return (
    typeof o.amount === 'number' &&
    Number.isInteger(o.amount) &&
    o.amount > 0 &&
    o.amount < 10_000_000_000 &&
    typeof o.merchant === 'string' &&
    typeof o.category === 'string' &&
    CATEGORIES.includes(o.category as Category) &&
    (o.transaction_type === 'debit' || o.transaction_type === 'credit') &&
    typeof o.transacted_at === 'string'
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
