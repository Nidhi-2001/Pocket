import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { shadows } from '../../constants/theme';
import { getCurrency, majorToMinor } from '../../lib/currency';
import { formatCurrency, formatDateOnly } from '../../lib/formatters';
import { supabase } from '../../lib/supabase';
import type { Goal } from '../../types';

interface GoalCardProps {
  goal: Goal;
  onChange: () => void;
}

export function GoalCard({ goal, onChange }: GoalCardProps) {
  // Format every amount in the GOAL's currency (not the user's profile
  // currency) — a Tokyo trip stays in ¥ even if the user spends in USD.
  const currency = goal.currency;
  const cur = getCurrency(currency);
  const [addText, setAddText] = useState('');
  const [busy, setBusy] = useState(false);

  const completed = goal.status === 'completed';
  const progress =
    goal.target_amount > 0
      ? Math.min(100, (goal.current_amount / goal.target_amount) * 100)
      : 0;

  async function addSavings() {
    const major = parseInt(addText, 10);
    if (!major || major <= 0) return;
    setBusy(true);
    const newAmount = goal.current_amount + majorToMinor(major, currency);
    const newStatus =
      newAmount >= goal.target_amount ? 'completed' : goal.status;
    const { error } = await supabase
      .from('goals')
      .update({ current_amount: newAmount, status: newStatus })
      .eq('id', goal.id);
    setBusy(false);
    if (!error) {
      setAddText('');
      onChange();
    }
  }

  async function performDelete() {
    setBusy(true);
    const { error } = await supabase.from('goals').delete().eq('id', goal.id);
    setBusy(false);
    if (!error) onChange();
  }

  function confirmDelete() {
    if (Platform.OS === 'web') {
      if (window.confirm(`Delete goal "${goal.title}"?`)) performDelete();
    } else {
      Alert.alert('Delete goal', `Delete "${goal.title}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: performDelete },
      ]);
    }
  }

  return (
    <View className="bg-surface rounded-3xl p-5" style={shadows.sm}>
      <View className="flex-row items-start justify-between mb-3">
        <View className="flex-row items-center gap-3 flex-1 mr-2">
          <Text className="text-3xl">{goal.emoji}</Text>
          <Text
            className="text-lg font-semibold text-text-primary flex-1"
            numberOfLines={1}
          >
            {goal.title}
          </Text>
        </View>
        <Pressable
          onPress={confirmDelete}
          disabled={busy}
          className="p-1 -mr-1 active:opacity-60"
        >
          <Ionicons name="trash-outline" size={18} color="#9CA3AF" />
        </Pressable>
      </View>

      <Text className="text-2xl font-bold text-text-primary">
        {formatCurrency(goal.current_amount, currency)}
      </Text>
      <Text className="text-sm text-text-secondary mb-3">
        of {formatCurrency(goal.target_amount, currency)} ({progress.toFixed(0)}%)
      </Text>

      <View className="h-2.5 bg-surface-soft rounded-full overflow-hidden mb-3">
        <View
          className="h-full rounded-full"
          style={{
            width: `${progress}%`,
            backgroundColor: completed ? '#10B981' : '#6366F1',
          }}
        />
      </View>

      {goal.deadline && (
        <Text className="text-xs text-text-muted mb-3">
          Deadline · {formatDateOnly(goal.deadline)}
        </Text>
      )}

      {completed ? (
        <View className="flex-row items-center gap-2 py-2">
          <Text className="text-2xl">🎉</Text>
          <Text className="text-success font-semibold">Goal reached!</Text>
        </View>
      ) : (
        <View className="flex-row gap-2">
          <View className="flex-1 flex-row items-center bg-background border border-border rounded-xl px-3">
            <Text className="text-sm text-text-muted mr-1">{cur.symbol}</Text>
            <TextInput
              value={addText}
              onChangeText={(t) => setAddText(t.replace(/\D/g, ''))}
              placeholder={`Add ${cur.symbol} saved…`}
              placeholderTextColor="#9CA3AF"
              keyboardType="number-pad"
              inputMode="numeric"
              editable={!busy}
              className="flex-1 py-2 text-sm text-text-primary"
            />
          </View>
          <Pressable
            onPress={addSavings}
            disabled={busy || !addText}
            className={`px-4 py-2 rounded-xl items-center justify-center ${
              busy || !addText
                ? 'bg-text-muted'
                : 'bg-primary active:opacity-80'
            }`}
          >
            {busy ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <Text className="text-white font-medium text-sm">Add</Text>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}
