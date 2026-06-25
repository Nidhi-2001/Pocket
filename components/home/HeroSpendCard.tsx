import { Text, View } from 'react-native';
import { useCurrency } from '../../hooks/useCurrency';
import { formatCurrency } from '../../lib/formatters';

interface HeroSpendCardProps {
  spent: number; // minor units
  budget: number; // minor units
}

/**
 * Big purple card at the top of Home. Shows month-to-date debit spend
 * against the user's monthly budget, with a progress bar.
 */
export function HeroSpendCard({ spent, budget }: HeroSpendCardProps) {
  const currency = useCurrency();
  const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
  const overBudget = spent > budget;
  const remaining = Math.max(0, budget - spent);

  return (
    <View className="bg-primary rounded-3xl p-6">
      <Text
        className="text-sm font-medium mb-1"
        style={{ color: '#EEF2FF' }}
      >
        This month&apos;s spend
      </Text>
      <Text className="text-white text-4xl font-bold mb-5">
        {formatCurrency(spent, currency)}
      </Text>

      <View
        className="h-2 rounded-full overflow-hidden mb-2"
        style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
      >
        <View
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            backgroundColor: overBudget ? '#EF4444' : '#FFFFFF',
          }}
        />
      </View>

      <Text className="text-sm" style={{ color: '#EEF2FF' }}>
        {overBudget
          ? `${formatCurrency(spent - budget, currency)} over budget`
          : `${formatCurrency(remaining, currency)} left of ${formatCurrency(budget, currency)} budget`}
      </Text>
    </View>
  );
}
