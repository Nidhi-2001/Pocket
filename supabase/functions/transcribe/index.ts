// supabase/functions/transcribe/index.ts
//
// Speech-to-text via Groq Whisper. Receives base64 audio from the app, forwards
// it to Groq's transcription endpoint (whisper-large-v3-turbo), returns { text }.
// The GROQ_API_KEY stays server-side. The transcribed text is then fed into the
// existing `assistant` flow by the client.
//
// Request:  { audio: <base64 string>, mimeType?: string }
// Response: { text: string }

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function extFor(mime: string): string {
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return 'm4a';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
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
    const { data: { user }, error: uErr } = await supabase.auth.getUser(
      authHeader.replace(/^Bearer\s+/i, ''),
    );
    if (uErr || !user) return json({ error: 'Invalid auth' }, 401);

    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
    if (!GROQ_API_KEY) return json({ error: 'Server misconfigured: missing GROQ_API_KEY' }, 500);

    const body = await req.json().catch(() => null);
    const audioB64: unknown = body?.audio;
    const mimeType: string = typeof body?.mimeType === 'string' ? body.mimeType : 'audio/webm';
    if (typeof audioB64 !== 'string' || !audioB64) {
      return json({ error: 'Request body must include { audio: base64 }' }, 400);
    }
    // Guard against oversized uploads (~10MB base64 ≈ ~7.5MB audio).
    if (audioB64.length > 10_000_000) return json({ error: 'Audio too long' }, 413);

    // base64 → bytes
    const binary = atob(audioB64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const form = new FormData();
    form.append('file', new Blob([bytes], { type: mimeType }), `audio.${extFor(mimeType)}`);
    form.append('model', 'whisper-large-v3-turbo');
    form.append('response_format', 'json');
    // form.append('language', 'en'); // omit → Whisper auto-detects the language

    const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` }, // fetch sets the multipart boundary
      body: form,
    });
    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error('Groq transcription error:', groqRes.status, errText);
      return json({ error: 'Transcription failed', status: groqRes.status }, 502);
    }
    const data = await groqRes.json();
    const text: string = typeof data?.text === 'string' ? data.text.trim() : '';
    return json({ text });
  } catch (err: any) {
    console.error('Unexpected error:', err);
    return json({ error: 'Unexpected error', detail: String(err?.message ?? err) }, 500);
  }
});
