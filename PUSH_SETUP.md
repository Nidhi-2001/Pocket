# Device push notifications — setup

The in-app alerts (daily reminder, weekend summary, budget warning) work today
and are generated both client-side on app open (`lib/nudges.ts`) and
server-side daily via pg_cron (`scheduled-alerts` edge function). This doc
covers the remaining step: real **OS push notifications** on a phone.

Everything code-side is already wired (`push_tokens` table, `lib/push.ts`,
`scheduled-alerts` pushes to stored tokens via Expo's push API). Push can't be
tested on the web build — Expo Go also dropped remote push in SDK 53+, so you
need an **EAS dev build on a real device**. Steps:

```bash
# 1. One-time: install the CLI and log into your Expo account
npm i -g eas-cli
eas login

# 2. Link the project — this writes the EAS projectId into app config
eas init

# 3. Build a dev client for your device (pick one)
eas build --profile development --platform ios     # needs an Apple device/account
eas build --profile development --platform android  # easiest to test

# 4. Install the build on your device and run the dev server
npx expo start --dev-client
```

Then in [`lib/push.ts`](./lib/push.ts), pass your EAS projectId to
`getExpoPushTokenAsync`:

```ts
const projectId = Constants.expoConfig?.extra?.eas?.projectId; // set by `eas init`
const tokenResp = await Notifications.getExpoPushTokenAsync({ projectId });
```

(`eas init` adds `extra.eas.projectId` to `app.json`, so reading it from
`expo-constants` works.)

## How it flows once a device is registered

1. App opens on the device → `registerForPushNotifications()` asks permission,
   gets the Expo push token, and upserts it into `push_tokens`.
2. The daily pg_cron job runs `scheduled-alerts`, which generates each user's
   due alerts AND posts them to `https://exp.host/--/api/v2/push/send` for every
   stored token — so the phone gets a banner even when the app is closed.

## Notes

- Build profiles live in [`eas.json`](./eas.json).
- For a custom notification icon/color, add options to the `expo-notifications`
  plugin entry in `app.json`.
- Web is unaffected: `lib/push.ts` is a no-op on web and dynamic-imports
  `expo-notifications` so it never enters the web bundle.
