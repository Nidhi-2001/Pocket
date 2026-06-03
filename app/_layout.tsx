import '../global.css';
import type { Session } from '@supabase/supabase-js';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { CurrencyContext } from '../hooks/useCurrency';
import { useProfile } from '../hooks/useProfile';
import { DEFAULT_CURRENCY } from '../lib/currency';
import { supabase } from '../lib/supabase';

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

  return (
    <CurrencyContext.Provider value={profile?.currency ?? DEFAULT_CURRENCY}>
      <Stack screenOptions={{ headerShown: false }} />
    </CurrencyContext.Provider>
  );
}
