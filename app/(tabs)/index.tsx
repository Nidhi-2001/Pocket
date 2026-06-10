import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { AddIncomeCard } from '../../components/home/AddIncomeCard';
import { CashFlowCard } from '../../components/home/CashFlowCard';
import { NetPositionCard } from '../../components/home/NetPositionCard';
import { NudgeCard } from '../../components/home/NudgeCard';
import { PersonalityCard } from '../../components/home/PersonalityCard';
import { TransactionRow } from '../../components/home/TransactionRow';
import { UploadStatementCard } from '../../components/home/UploadStatementCard';
import { useNudges } from '../../hooks/useNudges';
import { usePersonality } from '../../hooks/usePersonality';
import { useProfile } from '../../hooks/useProfile';
import { useTransactions } from '../../hooks/useTransactions';
import { supabase } from '../../lib/supabase';

export default function HomeTab() {
  const { profile } = useProfile();
  const { transactions, refetch: refetchTxs } = useTransactions({ limit: 10 });
  const { nudges, markRead, refetch: refetchNudges } = useNudges();
  const { personality, refetch: refetchPersonality } = usePersonality();

  const [generating, setGenerating] = useState<null | 'nudge' | 'personality'>(
    null,
  );
  const [genError, setGenError] = useState<string | null>(null);

  const monthStart = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1,
  );
  const monthTxs = transactions.filter(
    (tx) => new Date(tx.transacted_at) >= monthStart,
  );
  const monthlySpent = monthTxs
    .filter((tx) => tx.transaction_type === 'debit')
    .reduce((sum, tx) => sum + tx.amount, 0);
  const monthlyIncome = monthTxs
    .filter((tx) => tx.transaction_type === 'credit')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const recentFive = transactions.slice(0, 5);
  const topNudge = nudges[0];

  async function generate(kind: 'nudge' | 'personality') {
    setGenerating(kind);
    setGenError(null);
    const fn = kind === 'nudge' ? 'goal-nudge' : 'personality';
    const { error: err } = await supabase.functions.invoke(fn, { body: {} });
    setGenerating(null);
    if (err) {
      const ctx = (err as { context?: unknown }).context;
      if (ctx instanceof Response) {
        const body = await ctx.json().catch(() => null);
        setGenError(body?.error ?? `HTTP ${ctx.status}`);
      } else {
        setGenError(err.message || String(err));
      }
      return;
    }
    if (kind === 'nudge') refetchNudges();
    else refetchPersonality();
  }

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="px-6 pt-16 pb-4">
        <Text className="text-base text-text-secondary mb-1">
          Hey {profile?.name ?? 'there'} 👋
        </Text>
        <Text className="text-2xl font-bold text-text-primary">
          Let&apos;s see where your money went.
        </Text>
      </View>

      {topNudge && (
        <View className="px-6 mb-4">
          <NudgeCard nudge={topNudge} onDismiss={() => markRead(topNudge.id)} />
        </View>
      )}

      <View className="px-6 mb-6">
        <CashFlowCard
          income={monthlyIncome}
          expenses={monthlySpent}
          expectedIncome={profile?.expected_monthly_income ?? 0}
        />
      </View>

      <View className="px-6 mb-6">
        <NetPositionCard />
      </View>

      {personality && (
        <View className="px-6 mb-6">
          <PersonalityCard personality={personality} />
        </View>
      )}

      <View className="px-6 mb-2 flex-row items-center justify-between">
        <Text className="text-lg font-semibold text-text-primary">
          Recent transactions
        </Text>
      </View>

      <View className="px-6 mb-6">
        {recentFive.length === 0 ? (
          <View className="bg-surface border border-border rounded-2xl p-6 items-center">
            <Text className="text-3xl mb-2">📭</Text>
            <Text className="text-text-secondary text-center text-sm">
              No transactions yet. Paste a bank SMS below to add one.
            </Text>
          </View>
        ) : (
          <View className="gap-2">
            {recentFive.map((tx) => (
              <TransactionRow key={tx.id} tx={tx} />
            ))}
          </View>
        )}
      </View>

      <View className="px-6 mb-6">
        <Text className="text-xs text-text-muted uppercase mb-2 font-semibold tracking-wider">
          Pocket insights
        </Text>
        <View className="flex-row gap-2">
          <Pressable
            onPress={() => generate('nudge')}
            disabled={generating !== null}
            className="flex-1 flex-row items-center justify-center gap-2 bg-surface border border-border py-3 rounded-2xl active:opacity-80"
          >
            {generating === 'nudge' ? (
              <ActivityIndicator size="small" />
            ) : (
              <>
                <Ionicons name="bulb-outline" size={16} color="#4F46E5" />
                <Text className="text-sm font-medium text-text-primary">
                  New nudge
                </Text>
              </>
            )}
          </Pressable>
          <Pressable
            onPress={() => generate('personality')}
            disabled={generating !== null}
            className="flex-1 flex-row items-center justify-center gap-2 bg-surface border border-border py-3 rounded-2xl active:opacity-80"
          >
            {generating === 'personality' ? (
              <ActivityIndicator size="small" />
            ) : (
              <>
                <Ionicons name="sparkles-outline" size={16} color="#8B5CF6" />
                <Text className="text-sm font-medium text-text-primary">
                  Personality
                </Text>
              </>
            )}
          </Pressable>
        </View>
        {genError && (
          <Text className="text-danger text-xs mt-2">{genError}</Text>
        )}
      </View>

      <View className="px-6 pb-12">
        <Text className="text-xs text-text-muted uppercase mb-2 font-semibold tracking-wider">
          Add transactions
        </Text>
        <View className="gap-3">
          <AddIncomeCard onSuccess={refetchTxs} />
          <UploadStatementCard onSuccess={refetchTxs} />
        </View>
      </View>
    </ScrollView>
  );
}
