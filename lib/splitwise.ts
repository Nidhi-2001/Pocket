import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

// Splitwise OAuth2. The client SECRET lives only in the splitwise-oauth edge
// function — the app bundle only knows the public client id
// (EXPO_PUBLIC_SPLITWISE_CLIENT_ID).
//
//   web    → browser redirect to <origin>/splitwise-callback
//   native → system browser, returns via the pocket://splitwise-callback deep
//            link (handled by the /splitwise-callback route)
const AUTHORIZE_URL = 'https://secure.splitwise.com/oauth/authorize';

// CSRF state held in module memory so the callback can verify it without
// localStorage (which doesn't exist in React Native).
let pendingState: string | null = null;

/**
 * Redirect URI — must match the value registered on the Splitwise app AND the
 * one sent to the token exchange.
 */
export function splitwiseRedirectUri(): string {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}/splitwise-callback`;
    }
    return 'http://localhost:8081/splitwise-callback';
  }
  // e.g. pocket://splitwise-callback (standalone) — register this in Splitwise.
  return Linking.createURL('splitwise-callback');
}

/** Authorize URL the Connect button sends the user to. `state` is a CSRF token. */
export function buildSplitwiseAuthorizeUrl(state: string): string {
  pendingState = state;
  const clientId = process.env.EXPO_PUBLIC_SPLITWISE_CLIENT_ID ?? '';
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: splitwiseRedirectUri(),
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

/** Returns and clears the CSRF state saved by buildSplitwiseAuthorizeUrl. */
export function consumePendingState(): string | null {
  const s = pendingState;
  pendingState = null;
  return s;
}
