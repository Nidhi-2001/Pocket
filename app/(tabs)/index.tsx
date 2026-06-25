import { LinearGradient } from 'expo-linear-gradient';
import { useCallback } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { gradients, shadows } from '../../constants/theme';
import { CashFlowCard } from '../../components/home/CashFlowCard';
import { GlassView } from '../../components/ui/GlassView';
import { ScreenBackground } from '../../components/ui/ScreenBackground';
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

  const displayName = profile?.name ?? 'there';
  const initial = displayName.trim().charAt(0).toUpperCase() || '👋';

  return (
    <View className="flex-1 bg-background">
      <ScreenBackground />
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 96 }}>
      <View className="px-6 pt-16 pb-4 flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-sm text-text-secondary mb-1 font-medium">
            Hey {displayName} 👋
          </Text>
          <Text className="text-[26px] leading-8 font-extrabold text-text-primary tracking-tight">
            Where your money went
          </Text>
        </View>
        <LinearGradient
          colors={gradients.brand}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
            shadows.brand,
          ]}
        >
          <Text className="text-white text-lg font-bold">{initial}</Text>
        </LinearGradient>
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

      <View className="px-6 mb-3 flex-row items-center justify-between">
        <Text className="text-lg font-bold text-text-primary tracking-tight">
          Recent transactions
        </Text>
      </View>

      <View className="px-6 mb-6">
        {recentFive.length === 0 ? (
          <GlassView className="rounded-3xl p-7 items-center" style={shadows.sm}>
            <Text className="text-4xl mb-2">📭</Text>
            <Text className="text-text-secondary text-center text-sm">
              No transactions yet. Tap the ✨ button to add one.
            </Text>
          </GlassView>
        ) : (
          <View className="gap-2">
            {recentFive.map((tx) => (
              <TransactionRow key={tx.id} tx={tx} />
            ))}
          </View>
        )}
      </View>

      <View className="px-6 pb-12">
        <Text className="text-xs text-text-muted uppercase mb-3 font-bold tracking-widest">
          Add transactions
        </Text>
        <View className="gap-3">
          <UploadStatementCard onSuccess={refetchTxs} />
        </View>
      </View>
      </ScrollView>
    </View>
  );
}
