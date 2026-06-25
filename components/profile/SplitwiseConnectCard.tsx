import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import { useSplitwiseConnection } from '../../hooks/useSplitwiseConnection';
import { buildSplitwiseAuthorizeUrl } from '../../lib/splitwise';
import { supabase } from '../../lib/supabase';
import { GlassView } from '../ui/GlassView';
import { shadows } from '../../constants/theme';

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

  async function connect() {
    const url = buildSplitwiseAuthorizeUrl(randomState());
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') window.location.href = url;
    } else {
      // Opens the system browser; Splitwise redirects back via the
      // pocket://splitwise-callback deep link to the /splitwise-callback route.
      await Linking.openURL(url);
    }
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
    <GlassView className="rounded-2xl p-5" style={shadows.sm}>
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
    </GlassView>
  );
}
