import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { supabase } from '../../lib/supabase';

export default function TabsHome() {
  const [name, setName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('profiles')
      .select('name')
      .single()
      .then(({ data }) => {
        setName(data?.name ?? null);
        setLoading(false);
      });
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <View className="flex-1 bg-background px-6 py-16 items-center justify-center">
      {loading ? (
        <ActivityIndicator />
      ) : (
        <>
          <Text className="text-5xl mb-4">👋</Text>
          <Text className="text-3xl font-bold text-text-primary mb-2">
            Hey {name ?? 'there'}
          </Text>
          <Text className="text-base text-text-secondary text-center mb-10">
            You&apos;re in. Your real dashboard will live here in Phase 4 —
            transactions, budget, the works.
          </Text>
          <Pressable
            onPress={signOut}
            className="border border-border bg-surface px-6 py-3 rounded-2xl active:opacity-80"
          >
            <Text className="text-text-secondary text-sm">Sign out</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
