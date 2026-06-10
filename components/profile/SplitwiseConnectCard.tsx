import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useSplitwiseConnection } from '../../hooks/useSplitwiseConnection';
import { buildSplitwiseAuthorizeUrl } from '../../lib/splitwise';
import { supabase } from '../../lib/supabase';

function randomState(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Profile card to connect / disconnect the user's Splitwise account.
 * Connecting redirects the browser to Splitwise's OAuth authorize page;
 * the /splitwise-callback route finishes the exchange.
 */
export function SplitwiseConnectCard() {
  const { connected, refetch } = useSplitwiseConnection();

  function connect() {
    if (typeof window === 'undefined') return;
    const state = randomState();
    window.localStorage.setItem('sw_oauth_state', state);
    window.location.href = buildSplitwiseAuthorizeUrl(state);
  }

  async function disconnect() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('splitwise_connections').delete().eq('user_id', user.id);
    refetch();
  }

  return (
    <View className="bg-surface border border-border rounded-2xl p-5">
      <View className="flex-row items-center gap-3">
        <View
          className="w-9 h-9 rounded-full items-center justify-center"
          style={{ backgroundColor: '#10B98122' }}
        >
          <Ionicons name="people-outline" size={18} color="#10B981" />
        </View>
        <View className="flex-1">
          <Text className="text-base font-semibold text-text-primary">Splitwise</Text>
          <Text className="text-xs text-text-muted">
            {connected === null
              ? 'Checking connection…'
              : connected
                ? 'Connected — your splits sync into Pocket.'
                : 'Connect to track splits and shared expenses.'}
          </Text>
        </View>
      </View>

      {connected === null ? (
        <View className="mt-3 py-2.5 items-center">
          <ActivityIndicator size="small" />
        </View>
      ) : connected ? (
        <Pressable
          onPress={disconnect}
          className="mt-3 py-2.5 rounded-xl border border-border items-center active:opacity-80"
        >
          <Text className="text-sm font-medium text-text-secondary">Disconnect</Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={connect}
          className="mt-3 py-2.5 rounded-xl bg-primary items-center active:opacity-80"
        >
          <Text className="text-sm font-semibold text-white">Connect Splitwise</Text>
        </Pressable>
      )}
    </View>
  );
}
