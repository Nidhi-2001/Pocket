import { Platform } from 'react-native';
import { supabase } from './supabase';

// ─────────────────────────────────────────────────────────────────────────
// NATIVE-ONLY SCAFFOLD — UNTESTED. Real OS push needs an EAS dev build (Expo
// Go dropped remote push in SDK 53+). On web this is a deliberate no-op, and
// expo-notifications is loaded via dynamic import so the web bundle never
// touches it. Verified only that it doesn't affect the web build; the device
// path needs to be tested on a real build.
//
// Remaining for a working device build:
//   1. eas build (dev client) + set the EAS projectId in app config.
//   2. Pass { projectId } to getExpoPushTokenAsync below.
//   3. (optional) add the "expo-notifications" config plugin to app.json for a
//      custom notification icon/sound.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Registers this device for push and stores the Expo push token in
 * push_tokens. No-op on web. Safe to call on every app start — the token
 * upsert is idempotent.
 */
export async function registerForPushNotifications(): Promise<void> {
  if (Platform.OS === 'web') return; // push unsupported on the web build

  try {
    // Dynamic import keeps expo-notifications out of the web bundle entirely.
    const Notifications = await import('expo-notifications');

    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.status === 'granted';
    if (!granted) {
      const req = await Notifications.requestPermissionsAsync();
      granted = req.status === 'granted';
    }
    if (!granted) return;

    // NOTE: on a real dev build pass { projectId: '<eas-project-id>' } here.
    const tokenResp = await Notifications.getExpoPushTokenAsync();
    const token = tokenResp.data;
    if (!token) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('push_tokens')
      .upsert(
        { user_id: user.id, token, platform: Platform.OS },
        { onConflict: 'user_id,token' },
      );
  } catch (e) {
    // Never let push setup crash the app — it's best-effort.
    console.warn('registerForPushNotifications skipped:', e);
  }
}
