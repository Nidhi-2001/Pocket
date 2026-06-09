import { Text, View } from 'react-native';
import { useCurrency } from '../../hooks/useCurrency';
import { formatCurrency } from '../../lib/formatters';

interface CashFlowCardProps {
  income: number; // minor units, sum of this month's credits
  expenses: number; // minor units, sum of this month's debits
  expectedIncome?: number; // minor units, optional target
}

/**
 * Big purple card at the top of Home. Shows month-to-date income +
 * expenses + net, with a progress bar showing what fraction of income
 * has been spent. Replaces the old spend-only hero.
 */
export function CashFlowCard({
  income,
  expenses,
  expectedIncome = 0,
}: CashFlowCardProps) {
  const currency = useCurrency();
  const net = income - expenses;
  const pctSpent = income > 0 ? Math.min(100, (expenses / income) * 100) : 0;
  const overspent = expenses > income && income > 0;

  return (
    <View className="bg-primary rounded-3xl p-6">
      <Text
        style={{ color: '#EEF2FF' }}
        className="text-xs uppercase tracking-wider font-semibold mb-4"
      >
        This month&apos;s cash flow
      </Text>

      <View className="flex-row mb-5">
        <Metric label="Income" value={`+${formatCurrency(income, currency)}`} valueColor="white" />
        <View
          style={{
            width: 1,
            backgroundColor: 'rgba(255,255,255,0.2)',
            marginHorizontal: 8,
          }}
        />
        <Metric
          label="Expenses"
          value={`-${formatCurrency(expenses, currency)}`}
          valueColor="white"
        />
        <View
          style={{
            width: 1,
            backgroundColor: 'rgba(255,255,255,0.2)',
            marginHorizontal: 8,
          }}
        />
        <Metric
          label="Net"
          value={`${net >= 0 ? '+' : ''}${formatCurrency(net, currency)}`}
          valueColor={net >= 0 ? 'white' : '#FCA5A5'}
        />
      </View>

      <View
        className="h-2 rounded-full overflow-hidden mb-2"
        style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
      >
        <View
          className="h-full rounded-full"
          style={{
            width: `${pctSpent}%`,
            backgroundColor: overspent ? '#F43F5E' : '#FFFFFF',
          }}
        />
      </View>

      <Text style={{ color: '#EEF2FF' }} className="text-xs">
        {income > 0
          ? overspent
            ? `Spent ${pctSpent.toFixed(0)}% of income — over by ${formatCurrency(expenses - income, currency)}`
            : `Spent ${pctSpent.toFixed(0)}% of income · saving ${(100 - pctSpent).toFixed(0)}%`
          : expectedIncome > 0
            ? `Expected ${formatCurrency(expectedIncome, currency)} income this month`
            : 'No income recorded yet — set your expected monthly income in Profile'}
      </Text>
    </View>
  );
}

interface MetricProps {
  label: string;
  value: string;
  valueColor: string;
}

function Metric({ label, value, valueColor }: MetricProps) {
  return (
    <View className="flex-1">
      <Text style={{ color: '#C7D2FE' }} className="text-[11px] mb-1">
        {label}
      </Text>
      <Text
        className="text-lg font-bold"
        style={{ color: valueColor }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}
