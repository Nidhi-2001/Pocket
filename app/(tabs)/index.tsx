import { useCallback } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { CashFlowCard } from '../../components/home/CashFlowCard';
import { InsightCard } from '../../components/home/InsightCard';
import { NetPositionCard } from '../../components/home/NetPositionCard';
import { NudgeCard } from '../../components/home/NudgeCard';
import { PersonalityCard } from '../../components/home/PersonalityCard';
import { TransactionRow } from '../../components/home/TransactionRow';
import { UploadStatementCard } from '../../components/home/UploadStatementCard';
import { useNudges } from '../../hooks/useNudges';
import { usePersonality } from '../../hooks/usePersonality';
import { useProfile } from '../../hooks/useProfile';
import { useTransactions } from '../../hooks/useTransactions';
import { runNudgeChecks } from '../../lib/nudges';
import { supabase } from '../../lib/supabase';

export default function HomeTab() {
  const { profile } = useProfile();
  const { transactions, refetch: refetchTxs } = useTransactions({ limit: 10 });
  const { nudges, markRead, refetch: refetchNudges } = useNudges();
  const { personality } = usePersonality();

  // Generate any due alerts (daily reminder, weekend summary, budget warning)
  // whenever Home gains focus — so changing the budget on Profile and coming
  // back re-checks. Deduped inside runNudgeChecks so it won't spam.
  useFocusEffect(
    useCallback(() => {
      runNudgeChecks().then((created) => {
        if (created > 0) refetchNudges();
      });
    }, [refetchNudges]),
  );

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

      <View className="px-6 mb-4">
        <InsightCard />
      </View>

      {nudges.length > 0 && (
        <View className="px-6 mb-4 gap-3">
          {nudges.map((n) => (
            <NudgeCard key={n.id} nudge={n} onDismiss={() => markRead(n.id)} />
          ))}
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
              No transactions yet. Use the bar at the top to add one.
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

      <View className="px-6 pb-12">
        <Text className="text-xs text-text-muted uppercase mb-2 font-semibold tracking-wider">
          Add transactions
        </Text>
        <View className="gap-3">
          <UploadStatementCard onSuccess={refetchTxs} />
        </View>
      </View>
    </ScrollView>
  );
}
