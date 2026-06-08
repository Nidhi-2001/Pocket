import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { GoalCard } from '../../components/goals/GoalCard';
import { CurrencyDropdown } from '../../components/ui/CurrencyDropdown';
import { useCurrency } from '../../hooks/useCurrency';
import { useGoals } from '../../hooks/useGoals';
import { type CurrencyCode, getCurrency, majorToMinor } from '../../lib/currency';
import { supabase } from '../../lib/supabase';

export default function GoalsTab() {
  const userCurrency = useCurrency();
  const { goals, loading, refetch } = useGoals();
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newEmoji, setNewEmoji] = useState('🎯');
  const [newCurrency, setNewCurrency] = useState<CurrencyCode>(
    (userCurrency as CurrencyCode) ?? 'USD',
  );
  const [newAmount, setNewAmount] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setShowNew(false);
    setNewTitle('');
    setNewEmoji('🎯');
    setNewCurrency((userCurrency as CurrencyCode) ?? 'USD');
    setNewAmount('');
    setError(null);
  }

  async function createGoal() {
    const target = parseInt(newAmount, 10);
    if (!newTitle.trim() || !target || target <= 0) {
      setError('Title and target amount are required.');
      return;
    }
    setCreating(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setCreating(false);
      setError('Not signed in.');
      return;
    }
    const { error: err } = await supabase.from('goals').insert({
      user_id: user.id,
      title: newTitle.trim(),
      emoji: newEmoji.trim() || '🎯',
      target_amount: majorToMinor(target, newCurrency),
      currency: newCurrency,
    });
    setCreating(false);
    if (err) {
      setError(err.message);
      return;
    }
    reset();
    refetch();
  }

  const newCur = getCurrency(newCurrency);

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="px-6 pt-16 pb-4 flex-row items-start justify-between">
        <View className="flex-1">
          <Text className="text-3xl font-bold text-text-primary mb-1">
            Goals
          </Text>
          <Text className="text-base text-text-secondary">
            Save for things that matter.
          </Text>
        </View>
        <Pressable
          onPress={() => (showNew ? reset() : setShowNew(true))}
          className="w-12 h-12 rounded-full bg-primary items-center justify-center active:opacity-80"
        >
          <Ionicons name={showNew ? 'close' : 'add'} size={24} color="white" />
        </Pressable>
      </View>

      {showNew && (
        <View className="px-6 mb-6">
          <View className="bg-surface border border-border rounded-2xl p-5">
            <Text className="text-base font-semibold text-text-primary mb-4">
              New goal
            </Text>

            <View className="flex-row gap-3 mb-4">
              <View>
                <Text className="text-xs text-text-secondary mb-1">Emoji</Text>
                <TextInput
                  value={newEmoji}
                  onChangeText={(t) => setNewEmoji(t.slice(0, 2))}
                  placeholder="🎯"
                  className="bg-background border border-border rounded-xl px-3 py-2 text-2xl text-center"
                  style={{ width: 64 }}
                />
              </View>
              <View className="flex-1">
                <Text className="text-xs text-text-secondary mb-1">
                  Title
                </Text>
                <TextInput
                  value={newTitle}
                  onChangeText={setNewTitle}
                  placeholder="Tokyo trip"
                  placeholderTextColor="#9CA3AF"
                  className="bg-background border border-border rounded-xl px-3 py-2 text-base text-text-primary"
                />
              </View>
            </View>

            <Text className="text-xs text-text-secondary mb-1">Currency</Text>
            <CurrencyDropdown
              value={newCurrency}
              onChange={setNewCurrency}
              label="Currency for this goal"
            />

            <Text className="text-xs text-text-secondary mb-1 mt-4">
              Target amount ({newCur.symbol})
            </Text>
            <View className="flex-row items-center bg-background border border-border rounded-xl px-3 mb-4">
              <Text className="text-base text-text-muted mr-2">
                {newCur.symbol}
              </Text>
              <TextInput
                value={newAmount}
                onChangeText={(t) => setNewAmount(t.replace(/\D/g, ''))}
                placeholder="50000"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                inputMode="numeric"
                className="flex-1 py-2 text-base text-text-primary"
              />
            </View>

            {error && (
              <Text className="text-danger text-sm mb-3">{error}</Text>
            )}

            <Pressable
              onPress={createGoal}
              disabled={creating || !newTitle.trim() || !newAmount}
              className={`py-3 rounded-xl items-center ${
                creating || !newTitle.trim() || !newAmount
                  ? 'bg-text-muted'
                  : 'bg-primary active:opacity-80'
              }`}
            >
              {creating ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text className="text-white font-semibold">Create goal</Text>
              )}
            </Pressable>
          </View>
        </View>
      )}

      <View className="px-6 pb-12">
        {loading ? (
          <View className="py-8 items-center">
            <ActivityIndicator />
          </View>
        ) : goals.length === 0 ? (
          <View className="bg-surface border border-border rounded-2xl p-8 items-center">
            <Text className="text-5xl mb-3">🎯</Text>
            <Text className="text-base font-medium text-text-primary mb-1">
              No goals yet
            </Text>
            <Text className="text-sm text-text-secondary text-center">
              Tap + to create your first one. A Tokyo trip, a laptop, an
              emergency fund — whatever you&apos;re saving for.
            </Text>
          </View>
        ) : (
          <View className="gap-3">
            {goals.map((g) => (
              <GoalCard key={g.id} goal={g} onChange={refetch} />
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
