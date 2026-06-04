import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { DonutChart, type DonutSegment } from '../../components/spends/DonutChart';
import { categories, type CategoryKey } from '../../constants/theme';
import { useCurrency } from '../../hooks/useCurrency';
import { useTransactions } from '../../hooks/useTransactions';
import { formatCurrency } from '../../lib/formatters';

interface CategorySummary extends DonutSegment {
  count: number;
  category: CategoryKey;
}

interface MerchantSummary {
  merchant: string;
  total: number;
  count: number;
  category: CategoryKey;
}

export default function SpendsTab() {
  const currency = useCurrency();
  const { transactions, loading } = useTransactions({
    monthOnly: true,
    debitsOnly: true,
  });

  const { summary, totalSpent, txCount } = useMemo(() => {
    const acc: Partial<Record<CategoryKey, { total: number; count: number }>> = {};
    for (const tx of transactions) {
      const cat = tx.category as CategoryKey;
      if (!acc[cat]) acc[cat] = { total: 0, count: 0 };
      acc[cat]!.total += tx.amount;
      acc[cat]!.count += 1;
    }
    const summary: CategorySummary[] = (Object.entries(acc) as [
      CategoryKey,
      { total: number; count: number },
    ][])
      .map(([cat, data]) => ({
        category: cat,
        label: cat,
        value: data.total,
        count: data.count,
        color: categories[cat].color,
      }))
      .sort((a, b) => b.value - a.value);

    const totalSpent = transactions.reduce((s, tx) => s + tx.amount, 0);
    return { summary, totalSpent, txCount: transactions.length };
  }, [transactions]);

  const topMerchants = useMemo<MerchantSummary[]>(() => {
    const m: Record<string, MerchantSummary> = {};
    for (const tx of transactions) {
      if (!m[tx.merchant]) {
        m[tx.merchant] = {
          merchant: tx.merchant,
          total: 0,
          count: 0,
          category: tx.category as CategoryKey,
        };
      }
      m[tx.merchant].total += tx.amount;
      m[tx.merchant].count += 1;
    }
    return Object.values(m)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [transactions]);

  const stats = useMemo(() => {
    if (transactions.length === 0) return null;
    const dayOfMonth = new Date().getDate();
    const dailyAvg = Math.round(totalSpent / dayOfMonth);

    const biggest = [...transactions].sort((a, b) => b.amount - a.amount)[0];

    return {
      dailyAvg,
      biggest,
      topCategory: summary[0],
    };
  }, [transactions, totalSpent, summary]);

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="px-6 pt-16 pb-2">
        <Text className="text-3xl font-bold text-text-primary mb-1">Spends</Text>
        <Text className="text-base text-text-secondary">
          This month at a glance.
        </Text>
      </View>

      {/* Donut chart */}
      <View className="py-6 items-center">
        {loading ? (
          <View style={{ height: 260 }} className="items-center justify-center">
            <ActivityIndicator />
          </View>
        ) : (
          <DonutChart
            segments={summary}
            centerSubLabel="Total spent"
            centerLabel={formatCurrency(totalSpent, currency)}
            bottomLabel={
              txCount > 0
                ? `${txCount} ${txCount === 1 ? 'transaction' : 'transactions'}`
                : undefined
            }
          />
        )}
      </View>

      {/* Stats grid — three small cards */}
      {stats && (
        <View className="px-6 mb-6 flex-row gap-2">
          <StatCard
            iconName="trending-up-outline"
            iconColor="#4F46E5"
            label="Daily avg"
            value={formatCurrency(stats.dailyAvg, currency)}
            sub={`day ${new Date().getDate()} of month`}
          />
          <StatCard
            iconName="flash-outline"
            iconColor="#F43F5E"
            label="Biggest"
            value={formatCurrency(stats.biggest.amount, currency)}
            sub={stats.biggest.merchant}
          />
          <StatCard
            iconName="trophy-outline"
            iconColor={stats.topCategory.color}
            label="Top category"
            value={stats.topCategory.label}
            sub={formatCurrency(stats.topCategory.value, currency)}
          />
        </View>
      )}

      {/* Top merchants */}
      {topMerchants.length > 0 && (
        <View className="px-6 mb-6">
          <Text className="text-lg font-semibold text-text-primary mb-3">
            Top merchants
          </Text>
          <View className="bg-surface border border-border rounded-2xl overflow-hidden">
            {topMerchants.map((m, idx) => {
              const catMeta = categories[m.category];
              return (
                <View
                  key={m.merchant}
                  className={`flex-row items-center px-4 py-3 ${
                    idx < topMerchants.length - 1 ? 'border-b border-border' : ''
                  }`}
                >
                  <Text className="text-text-muted text-sm font-medium w-6">
                    {idx + 1}
                  </Text>
                  <View
                    className="w-8 h-8 rounded-full items-center justify-center mr-3"
                    style={{ backgroundColor: catMeta.color + '22' }}
                  >
                    <Text className="text-base">{catMeta.emoji}</Text>
                  </View>
                  <View className="flex-1 mr-2">
                    <Text
                      className="text-base font-medium text-text-primary"
                      numberOfLines={1}
                    >
                      {m.merchant}
                    </Text>
                    <Text className="text-xs text-text-muted">
                      {m.count} {m.count === 1 ? 'visit' : 'visits'} · {m.category}
                    </Text>
                  </View>
                  <Text className="text-base font-semibold text-text-primary">
                    {formatCurrency(m.total, currency)}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* By category — each with a colored progress bar */}
      <View className="px-6 pb-12">
        <Text className="text-lg font-semibold text-text-primary mb-3">
          By category
        </Text>
        {summary.length === 0 ? (
          <View className="bg-surface border border-border rounded-2xl p-8 items-center">
            <Text className="text-5xl mb-3">🍃</Text>
            <Text className="text-base font-medium text-text-primary mb-1">
              No spending this month yet
            </Text>
            <Text className="text-sm text-text-secondary text-center">
              Add a transaction from Home and it&apos;ll show up here, sliced
              by category.
            </Text>
          </View>
        ) : (
          <View className="gap-3">
            {summary.map((seg) => {
              const pct = totalSpent > 0 ? (seg.value / totalSpent) * 100 : 0;
              const meta = categories[seg.category];
              return (
                <View
                  key={seg.category}
                  className="bg-surface border border-border rounded-2xl p-4"
                >
                  <View className="flex-row items-center mb-3">
                    <View
                      className="w-10 h-10 rounded-full items-center justify-center mr-3"
                      style={{ backgroundColor: seg.color + '22' }}
                    >
                      <Text className="text-xl">{meta.emoji}</Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-base font-semibold text-text-primary">
                        {seg.label}
                      </Text>
                      <Text className="text-xs text-text-muted">
                        {seg.count}{' '}
                        {seg.count === 1 ? 'transaction' : 'transactions'} ·{' '}
                        {pct.toFixed(0)}%
                      </Text>
                    </View>
                    <Text className="text-lg font-bold text-text-primary">
                      {formatCurrency(seg.value, currency)}
                    </Text>
                  </View>
                  {/* Progress bar */}
                  <View className="h-2 bg-background rounded-full overflow-hidden">
                    <View
                      className="h-full rounded-full"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: seg.color,
                      }}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

interface StatCardProps {
  iconName: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;
  label: string;
  value: string;
  sub?: string;
}

function StatCard({ iconName, iconColor, label, value, sub }: StatCardProps) {
  return (
    <View className="flex-1 bg-surface border border-border rounded-2xl p-3">
      <View
        className="w-7 h-7 rounded-full items-center justify-center mb-2"
        style={{ backgroundColor: iconColor + '22' }}
      >
        <Ionicons name={iconName} size={14} color={iconColor} />
      </View>
      <Text className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-1">
        {label}
      </Text>
      <Text className="text-base font-bold text-text-primary mb-0.5" numberOfLines={1}>
        {value}
      </Text>
      {sub && (
        <Text className="text-[11px] text-text-muted" numberOfLines={1}>
          {sub}
        </Text>
      )}
    </View>
  );
}
