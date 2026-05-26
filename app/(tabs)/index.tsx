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
import { HeroSpendCard } from '../../components/home/HeroSpendCard';
import { TransactionRow } from '../../components/home/TransactionRow';
import { useProfile } from '../../hooks/useProfile';
import { useTransactions } from '../../hooks/useTransactions';
import { supabase } from '../../lib/supabase';

export default function HomeTab() {
  const { profile } = useProfile();
  const { transactions, refetch } = useTransactions({ limit: 10 });

  const [smsText, setSmsText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parseHint, setParseHint] = useState<string | null>(null);

  // Month-to-date debit total for the hero card. Computed client-side from
  // the recent-10 set; for a heavier user we'd swap this for a dedicated
  // aggregate query.
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const monthlySpent = transactions
    .filter(
      (tx) =>
        tx.transaction_type === 'debit' &&
        new Date(tx.transacted_at) >= monthStart,
    )
    .reduce((sum, tx) => sum + tx.amount, 0);

  const recentFive = transactions.slice(0, 5);

  async function parseSms() {
    if (!smsText.trim()) return;
    setParsing(true);
    setError(null);
    setParseHint(null);
    const { data, error: err } = await supabase.functions.invoke('parse-sms', {
      body: { smsText: smsText.trim() },
    });
    setParsing(false);

    if (err) {
      const ctx = (err as { context?: unknown }).context;
      if (ctx instanceof Response) {
        const body = await ctx.json().catch(() => null);
        setError(body?.error ?? `HTTP ${ctx.status}`);
      } else {
        setError(err.message || String(err));
      }
      return;
    }

    if (data && typeof data === 'object') {
      if ('valid' in data && data.valid === false) {
        setParseHint('Not a transaction SMS — nothing was added.');
      } else if ('duplicate' in data && data.duplicate) {
        setParseHint('Already imported — this looks like the same transaction.');
      } else {
        setParseHint('Added to your transactions ✓');
        setSmsText('');
        refetch();
      }
    }
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

      <View className="px-6 mb-6">
        <HeroSpendCard
          spent={monthlySpent}
          budget={profile?.monthly_budget ?? 2_000_000}
        />
      </View>

      <View className="px-6 mb-2 flex-row items-center justify-between">
        <Text className="text-lg font-semibold text-text-primary">
          Recent transactions
        </Text>
        {transactions.length > 5 && (
          <Text className="text-sm text-primary font-medium">See all</Text>
        )}
      </View>

      <View className="px-6 mb-8">
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

      <View className="px-6 pb-12">
        <Text className="text-xs text-text-muted uppercase mb-2 font-semibold tracking-wider">
          Add a transaction
        </Text>
        <View className="bg-surface border border-border rounded-2xl p-4">
          <Text className="text-sm text-text-secondary mb-3">
            Paste a bank notification SMS and we&apos;ll parse it.
          </Text>
          <TextInput
            value={smsText}
            onChangeText={(t) => {
              setSmsText(t);
              setError(null);
              setParseHint(null);
            }}
            placeholder="Dear UPI user A/C *1234 debited Rs.299..."
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={4}
            style={{ textAlignVertical: 'top', minHeight: 80 }}
            className="bg-background border border-border rounded-xl px-3 py-3 text-sm text-text-primary mb-3"
          />
          <Pressable
            onPress={parseSms}
            disabled={parsing || !smsText.trim()}
            className={`flex-row items-center justify-center gap-2 py-3 rounded-xl ${
              parsing || !smsText.trim()
                ? 'bg-text-muted'
                : 'bg-primary active:opacity-80'
            }`}
          >
            {parsing ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <>
                <Ionicons name="sparkles" size={16} color="white" />
                <Text className="text-white font-semibold text-sm">
                  Parse with AI
                </Text>
              </>
            )}
          </Pressable>

          {error && (
            <Text className="text-danger text-xs mt-3">{error}</Text>
          )}
          {parseHint && (
            <Text className="text-success text-xs mt-3">{parseHint}</Text>
          )}
        </View>
      </View>
    </ScrollView>
  );
}
