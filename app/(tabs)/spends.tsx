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

export default function SpendsTab() {
  const currency = useCurrency();
  const { transactions, loading } = useTransactions({
    monthOnly: true,
    debitsOnly: true,
  });

  const { summary, totalSpent } = useMemo(() => {
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
    return { summary, totalSpent };
  }, [transactions]);

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="px-6 pt-16 pb-2">
        <Text className="text-3xl font-bold text-text-primary mb-1">Spends</Text>
        <Text className="text-base text-text-secondary">
          This month at a glance.
        </Text>
      </View>

      <View className="py-8 items-center">
        {loading ? (
          <View style={{ height: 220 }} className="items-center justify-center">
            <ActivityIndicator />
          </View>
        ) : (
          <DonutChart
            segments={summary}
            centerLabel={formatCurrency(totalSpent, currency)}
            centerSubLabel="Spent"
          />
        )}
      </View>

      <View className="px-6 pb-12">
        <Text className="text-lg font-semibold text-text-primary mb-3">
          By category
        </Text>
        {summary.length === 0 ? (
          <View className="bg-surface border border-border rounded-2xl p-6 items-center">
            <Text className="text-3xl mb-2">🍃</Text>
            <Text className="text-text-secondary text-center text-sm">
              No spending this month yet. Add a transaction from Home and it
              will show up here, sliced by category.
            </Text>
          </View>
        ) : (
          <View className="gap-2">
            {summary.map((seg) => {
              const pct = totalSpent > 0 ? (seg.value / totalSpent) * 100 : 0;
              const meta = categories[seg.category];
              return (
                <View
                  key={seg.category}
                  className="flex-row items-center bg-surface border border-border rounded-2xl p-4"
                >
                  <View
                    className="w-10 h-10 rounded-full items-center justify-center mr-3"
                    style={{ backgroundColor: seg.color + '22' }}
                  >
                    <Text className="text-xl">{meta.emoji}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-base font-medium text-text-primary">
                      {seg.label}
                    </Text>
                    <Text className="text-xs text-text-muted">
                      {seg.count} transaction{seg.count !== 1 ? 's' : ''} ·{' '}
                      {pct.toFixed(0)}%
                    </Text>
                  </View>
                  <Text className="text-base font-semibold text-text-primary">
                    {formatCurrency(seg.value, currency)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
