import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { formatCurrency } from '../../lib/formatters';
import { supabase } from '../../lib/supabase';

interface Profile {
  name: string;
  monthly_budget: number;
}

export default function ProfileTab() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('profiles')
      .select('name, monthly_budget')
      .maybeSingle()
      .then(({ data }) => setProfile(data ?? null));
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="px-6 pt-16 pb-6">
        <Text className="text-3xl font-bold text-text-primary">Profile</Text>
      </View>

      <View className="px-6 pb-6">
        <View className="bg-surface border border-border rounded-2xl p-5 mb-3">
          <Text className="text-xs text-text-muted uppercase mb-1">Name</Text>
          <Text className="text-lg text-text-primary font-medium">
            {profile?.name ?? '—'}
          </Text>
        </View>

        <View className="bg-surface border border-border rounded-2xl p-5 mb-3">
          <Text className="text-xs text-text-muted uppercase mb-1">Email</Text>
          <Text className="text-lg text-text-primary font-medium">
            {email ?? '—'}
          </Text>
        </View>

        <View className="bg-surface border border-border rounded-2xl p-5">
          <Text className="text-xs text-text-muted uppercase mb-1">
            Monthly budget
          </Text>
          <Text className="text-lg text-text-primary font-medium">
            {profile ? formatCurrency(profile.monthly_budget) : '—'}
          </Text>
        </View>
      </View>

      <View className="px-6 pt-6 pb-12">
        <Pressable
          onPress={signOut}
          className="flex-row items-center justify-center gap-2 border border-border bg-surface py-4 rounded-2xl active:opacity-80"
        >
          <Ionicons name="log-out-outline" size={18} color="#6B7280" />
          <Text className="text-text-secondary font-medium">Sign out</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
