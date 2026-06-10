import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { splitwiseRedirectUri } from '../lib/splitwise';
import { supabase } from '../lib/supabase';

type Status = 'working' | 'done' | 'error';

/**
 * OAuth redirect landing page. Splitwise sends the browser here with
 * ?code=…&state=…. We verify state (CSRF), hand the code to the
 * splitwise-oauth edge function for the token exchange, then bounce back to
 * Profile. Top-level route so the auth guard leaves a signed-in user alone.
 */
export default function SplitwiseCallback() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('working');
  const [detail, setDetail] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // guard double-invoke in React strict/dev
    ran.current = true;

    (async () => {
      let code: string | null = null;
      let returnedState: string | null = null;
      let savedState: string | null = null;
      if (typeof window !== 'undefined') {
        const sp = new URLSearchParams(window.location.search);
        code = sp.get('code');
        returnedState = sp.get('state');
        savedState = window.localStorage.getItem('sw_oauth_state');
        window.localStorage.removeItem('sw_oauth_state');
      }

      if (!code) {
        setStatus('error');
        setDetail('No authorization code was returned by Splitwise.');
        return;
      }
      if (savedState && returnedState && savedState !== returnedState) {
        setStatus('error');
        setDetail('Security check failed (state mismatch). Please try again.');
        return;
      }

      const { data, error } = await supabase.functions.invoke('splitwise-oauth', {
        body: { code, redirectUri: splitwiseRedirectUri() },
      });

      if (error || !(data as { connected?: boolean })?.connected) {
        setStatus('error');
        setDetail('Could not connect your Splitwise account.');
        return;
      }

      setStatus('done');
      setTimeout(() => router.replace('/(tabs)/profile'), 900);
    })();
  }, [router]);

  return (
    <View className="flex-1 bg-background items-center justify-center px-8">
      {status === 'working' && (
        <>
          <ActivityIndicator />
          <Text className="text-text-secondary mt-4">Connecting Splitwise…</Text>
        </>
      )}
      {status === 'done' && (
        <>
          <Text className="text-5xl mb-3">✅</Text>
          <Text className="text-text-primary text-lg font-semibold">
            Splitwise connected!
          </Text>
        </>
      )}
      {status === 'error' && (
        <>
          <Text className="text-5xl mb-3">⚠️</Text>
          <Text className="text-text-primary text-lg font-semibold mb-1">
            Connection failed
          </Text>
          <Text className="text-text-secondary text-center mb-5">{detail}</Text>
          <Pressable
            onPress={() => router.replace('/(tabs)/profile')}
            className="px-5 py-3 bg-surface border border-border rounded-2xl active:opacity-80"
          >
            <Text className="text-text-secondary font-medium">Back to Profile</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
