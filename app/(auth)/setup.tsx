import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CurrencyPicker } from '../../components/ui/CurrencyPicker';
import { CURRENCIES, type CurrencyCode, getCurrency, majorToMinor } from '../../lib/currency';
import { supabase } from '../../lib/supabase';

const DEFAULT_BUDGET_MAJOR: Record<string, number> = {
  USD: 2000,
  EUR: 2000,
  GBP: 1500,
  JPY: 200000,
  INR: 20000,
  CNY: 14000,
  AUD: 3000,
  CAD: 2500,
  CHF: 1800,
  SGD: 2700,
  KRW: 2500000,
  AED: 7000,
};

export default function Setup() {
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('USD');
  const [budget, setBudget] = useState<string>('2000');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cur = getCurrency(currency);

  function handleCurrencyChange(code: CurrencyCode) {
    setCurrency(code);
    setBudget(String(DEFAULT_BUDGET_MAJOR[code] ?? 2000));
  }

  async function save() {
    const trimmedName = name.trim();
    const budgetMajor = parseInt(budget, 10);
    if (!trimmedName) {
      setError('Please enter your name.');
      return;
    }
    if (!budgetMajor || budgetMajor < 1) {
      setError(`Budget should be at least ${cur.symbol}1.`);
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
        currency,
        monthly_budget: majorToMinor(budgetMajor, currency),
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
    <ScrollView className="flex-1 bg-background">
      <View className="px-6 pt-16 pb-12">
        <Text className="text-3xl font-bold text-text-primary mb-2">
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
          placeholder="Your name"
          placeholderTextColor="#9CA3AF"
          autoCapitalize="words"
          autoCorrect={false}
          className="bg-surface border border-border rounded-2xl px-4 py-4 text-lg text-text-primary mb-6"
        />

        <Text className="text-sm font-medium text-text-secondary mb-2">
          Currency
        </Text>
        <CurrencyPicker value={currency} onChange={handleCurrencyChange} />
        <Text className="text-xs text-text-muted mt-2 mb-6">
          You can change this later in Profile. Pick the one your bank uses.
        </Text>

        <Text className="text-sm font-medium text-text-secondary mb-2">
          Monthly budget ({cur.symbol})
        </Text>
        <View className="flex-row items-center bg-surface border border-border rounded-2xl px-4">
          <Text className="text-lg text-text-muted mr-2">{cur.symbol}</Text>
          <TextInput
            value={budget}
            onChangeText={(t) => setBudget(t.replace(/\D/g, ''))}
            placeholder={String(DEFAULT_BUDGET_MAJOR[currency] ?? 2000)}
            placeholderTextColor="#9CA3AF"
            keyboardType="number-pad"
            inputMode="numeric"
            className="flex-1 py-4 text-lg text-text-primary"
          />
        </View>
        <Text className="text-xs text-text-muted mt-2 mb-6">
          You can change this anytime in Profile.
        </Text>

        {error && <Text className="text-danger text-sm mb-3">{error}</Text>}

        <Pressable
          onPress={save}
          disabled={disabled}
          className={`py-4 rounded-2xl items-center mt-4 ${
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
    </ScrollView>
  );
}
