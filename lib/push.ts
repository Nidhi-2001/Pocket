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

    // projectId is written into app config by `eas init`. It's required for
    // getExpoPushTokenAsync on a dev build / standalone app.
    const Constants = (await import('expo-constants')).default;
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      (Constants as { easConfig?: { projectId?: string } })?.easConfig
        ?.projectId;
    const tokenResp = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
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

// Daily LOCAL reminder — the device fires it at REMINDER_HOUR:REMINDER_MINUTE
// every day, even when the app is closed, with no server involved. Works in a
// dev build and (for local notifications) in Expo Go on Android. No-op on web.
const DAILY_REMINDER_ID = 'pocket-daily-reminder';
const REMINDER_HOUR = 20; // 8 PM local — change this to move the reminder time
const REMINDER_MINUTE = 0;

export async function scheduleDailyReminder(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const Notifications = await import('expo-notifications');

    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.status === 'granted';
    if (!granted) {
      const req = await Notifications.requestPermissionsAsync();
      granted = req.status === 'granted';
    }
    if (!granted) return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('reminders', {
        name: 'Reminders',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    // Idempotent: drop any prior schedule, then (re)schedule the daily reminder.
    await Notifications.cancelScheduledNotificationAsync(DAILY_REMINDER_ID).catch(
      () => {},
    );
    await Notifications.scheduleNotificationAsync({
      identifier: DAILY_REMINDER_ID,
      content: {
        title: 'Pocket',
        body: 'Spent anything today? Log it so your dashboard and budget stay accurate.',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: REMINDER_HOUR,
        minute: REMINDER_MINUTE,
        channelId: 'reminders',
      },
    });
  } catch (e) {
    console.warn('scheduleDailyReminder skipped:', e);
  }
}

// Fire an immediate OS notification (notification bar) — used to surface
// event-driven alerts (budget warning, weekend summary) the moment they're
// generated, even while the app is foregrounded. No-op on web.
export async function presentLocalNotification(
  title: string,
  body: string,
): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const Notifications = await import('expo-notifications');

    // Show banners even when the app is in the foreground.
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true, // on Android, false hides the drop-down banner
        shouldSetBadge: false,
      }),
    });

    const perm = await Notifications.getPermissionsAsync();
    if (perm.status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      if (req.status !== 'granted') return;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('alerts', {
        name: 'Alerts',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: Platform.OS === 'android' ? { channelId: 'alerts' } : null,
    });
  } catch (e) {
    console.warn('presentLocalNotification skipped:', e);
  }
}
