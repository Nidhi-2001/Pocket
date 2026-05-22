import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { supabase } from '../../lib/supabase';

export default function Setup() {
  const [name, setName] = useState('');
  const [budget, setBudget] = useState('20000');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const trimmedName = name.trim();
    const budgetNum = parseInt(budget, 10);
    if (!trimmedName) {
      setError('Please enter your name.');
      return;
    }
    if (!budgetNum || budgetNum < 1000) {
      setError('Budget should be at least ₹1,000.');
      return;
    }

    setLoading(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      setError('Not signed in.');
      return;
    }

    const { error: err } = await supabase
      .from('profiles')
      .update({
        name: trimmedName,
        monthly_budget: budgetNum * 100, // store in paise
      })
      .eq('id', user.id);

    setLoading(false);
    if (err) {
      console.error('profile update error:', err);
      setError(err.message);
      return;
    }
    router.replace('/(tabs)/');
  }

  const disabled = loading || !name.trim() || !budget;

  return (
    <View className="flex-1 bg-background px-6 py-16 justify-between">
      <View className="mt-12">
        <Text className="text-3xl font-bold text-text-primary mb-3">
          Almost there
        </Text>
        <Text className="text-base text-text-secondary mb-10">
          Tell us a bit about you so we can personalise things.
        </Text>

        <Text className="text-sm font-medium text-text-secondary mb-2">
          What should we call you?
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Riya"
          placeholderTextColor="#9CA3AF"
          autoCapitalize="words"
          autoCorrect={false}
          className="bg-surface border border-border rounded-2xl px-4 py-4 text-lg text-text-primary mb-6"
        />

        <Text className="text-sm font-medium text-text-secondary mb-2">
          Monthly budget (₹)
        </Text>
        <TextInput
          value={budget}
          onChangeText={(t) => setBudget(t.replace(/\D/g, ''))}
          placeholder="20000"
          placeholderTextColor="#9CA3AF"
          keyboardType="number-pad"
          inputMode="numeric"
          className="bg-surface border border-border rounded-2xl px-4 py-4 text-lg text-text-primary"
        />
        <Text className="text-xs text-text-muted mt-2">
          You can change this anytime in Profile.
        </Text>

        {error && <Text className="text-danger mt-4 text-sm">{error}</Text>}
      </View>

      <Pressable
        onPress={save}
        disabled={disabled}
        className={`py-4 rounded-2xl items-center ${
          disabled ? 'bg-text-muted' : 'bg-primary active:opacity-80'
        }`}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text className="text-white font-semibold text-lg">Continue</Text>
        )}
      </Pressable>
    </View>
  );
}
