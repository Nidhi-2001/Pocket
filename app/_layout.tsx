import '../global.css';
import type { Session } from '@supabase/supabase-js';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(false);
  const segments = useSegments();
  const router = useRouter();

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

    // Only enforce auth on protected routes — kick unauthenticated users out
    // of the app. We deliberately do NOT auto-redirect signed-in users away
    // from (auth) routes: the OTP screen explicitly navigates to /setup, and
    // a guard that fires on the same auth-state event would race and win.
    if (!session && !inAuthGroup) {
      router.replace('/welcome');
    }
  }, [session, initialized, segments, router]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
