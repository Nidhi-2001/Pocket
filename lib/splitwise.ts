// Splitwise OAuth2 (web-first). The client SECRET lives only in the
// splitwise-oauth edge function — the app bundle only ever knows the public
// client id (EXPO_PUBLIC_SPLITWISE_CLIENT_ID).

const AUTHORIZE_URL = 'https://secure.splitwise.com/oauth/authorize';

/**
 * The redirect URI must match three things exactly: the value registered on
 * the Splitwise app, the authorize request, and the token exchange. On web we
 * use the current origin so it works on any host/port. (Native deep-link is a
 * future add.)
 */
export function splitwiseRedirectUri(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/splitwise-callback`;
  }
  return 'http://localhost:8081/splitwise-callback';
}

/** Authorize URL the Connect button sends the user to. `state` is a CSRF token. */
export function buildSplitwiseAuthorizeUrl(state: string): string {
  const clientId = process.env.EXPO_PUBLIC_SPLITWISE_CLIENT_ID ?? '';
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: splitwiseRedirectUri(),
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}
