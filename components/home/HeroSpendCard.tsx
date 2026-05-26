import { Text, View } from 'react-native';
import { formatCurrency } from '../../lib/formatters';

interface HeroSpendCardProps {
  spent: number; // paise
  budget: number; // paise
}

/**
 * Big purple card at the top of Home. Shows month-to-date debit spend
 * against the user's monthly budget, with a progress bar.
 */
export function HeroSpendCard({ spent, budget }: HeroSpendCardProps) {
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
        {formatCurrency(spent)}
      </Text>

      <View
        className="h-2 rounded-full overflow-hidden mb-2"
        style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
      >
        <View
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            backgroundColor: overBudget ? '#F43F5E' : '#FFFFFF',
          }}
        />
      </View>

      <Text className="text-sm" style={{ color: '#EEF2FF' }}>
        {overBudget
          ? `${formatCurrency(spent - budget)} over budget`
          : `${formatCurrency(remaining)} left of ${formatCurrency(budget)} budget`}
      </Text>
    </View>
  );
}
