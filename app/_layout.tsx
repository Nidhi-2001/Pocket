import '../global.css';
import type { Session } from '@supabase/supabase-js';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { CurrencyContext } from '../hooks/useCurrency';
import { useProfile } from '../hooks/useProfile';
import { useThemeColors } from '../hooks/useThemeColors';
import { DEFAULT_CURRENCY } from '../lib/currency';
import { registerForPushNotifications, scheduleDailyReminder } from '../lib/push';
import { supabase } from '../lib/supabase';
import { ThemeProvider } from '../lib/theme';

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(false);
  const segments = useSegments();
  const router = useRouter();
  const { profile } = useProfile();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setInitialized(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!initialized) return;
    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/welcome');
    }
  }, [session, initialized, segments, router]);

  // Register for push + schedule the daily local reminder once signed in
  // (both no-op on web).
  useEffect(() => {
    if (session) {
      registerForPushNotifications();
      scheduleDailyReminder();
    }
  }, [session]);

  const c = useThemeColors();

  return (
    <ThemeProvider>
      <CurrencyContext.Provider value={profile?.currency ?? DEFAULT_CURRENCY}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: c.background },
          }}
        />
      </CurrencyContext.Provider>
    </ThemeProvider>
  );
}
