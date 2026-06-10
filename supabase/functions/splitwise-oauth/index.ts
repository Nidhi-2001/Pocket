// supabase/functions/splitwise-oauth/index.ts
//
// Deno edge function: completes the Splitwise OAuth2 authorization-code flow.
// The app sends the one-time `code` (from the redirect) + the redirect_uri;
// this function exchanges them — together with the server-only client secret
// — for the user's access token, then stores it in splitwise_connections
// keyed to the calling Pocket user.
//
// The client SECRET never leaves the server (project invariant #5).
//
// Env vars required (set via `npx supabase secrets set ...`):
//   SPLITWISE_CLIENT_ID
//   SPLITWISE_CLIENT_SECRET
// Auto-injected: SUPABASE_URL, SUPABASE_ANON_KEY

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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
      return json({ error: 'Invalid auth', detail: userError?.message }, 401);
    }

    const body = await req.json().catch(() => null);
    const code: unknown = body?.code;
    const redirectUri: unknown = body?.redirectUri;
    if (typeof code !== 'string' || !code) {
      return json({ error: 'Request body must include { code }' }, 400);
    }
    if (typeof redirectUri !== 'string' || !redirectUri) {
      return json({ error: 'Request body must include { redirectUri }' }, 400);
    }

    const clientId = Deno.env.get('SPLITWISE_CLIENT_ID');
    const clientSecret = Deno.env.get('SPLITWISE_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
      console.error('Splitwise client credentials not configured');
      return json({ error: 'Server misconfigured: missing Splitwise client credentials' }, 500);
    }

    // Exchange the authorization code for an access token (OAuth2 standard
    // form-encoded body).
    const tokenRes = await fetch('https://secure.splitwise.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }).toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('Splitwise token exchange failed:', tokenRes.status, errText);
      return json({ error: 'Token exchange failed', status: tokenRes.status }, 502);
    }

    const tokenData = await tokenRes.json();
    const accessToken: string | undefined = tokenData?.access_token;
    if (!accessToken) {
      console.error('No access_token in Splitwise response', tokenData);
      return json({ error: 'No access token returned' }, 502);
    }

    // Resolve the Splitwise user id for provenance / dedup later.
    let splitwiseUserId: number | null = null;
    try {
      const meRes = await fetch(
        'https://secure.splitwise.com/api/v3.0/get_current_user',
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (meRes.ok) {
        const meData = await meRes.json();
        splitwiseUserId = typeof meData?.user?.id === 'number' ? meData.user.id : null;
      }
    } catch (_) {
      // non-fatal — we still have a working token
    }

    const { error: upsertErr } = await supabase
      .from('splitwise_connections')
      .upsert({
        user_id: user.id,
        access_token: accessToken,
        splitwise_user_id: splitwiseUserId,
        connected_at: new Date().toISOString(),
      });

    if (upsertErr) {
      console.error('Failed to store connection:', upsertErr);
      return json({ error: 'Database error', detail: upsertErr.message }, 500);
    }

    return json({ connected: true, splitwiseUserId });
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
