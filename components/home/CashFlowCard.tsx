import { LinearGradient } from 'expo-linear-gradient';
import { Text, View } from 'react-native';
import { gradients, shadows } from '../../constants/theme';
import { useCurrency } from '../../hooks/useCurrency';
import { formatCurrency } from '../../lib/formatters';

interface CashFlowCardProps {
  income: number; // minor units, sum of this month's credits
  expenses: number; // minor units, sum of this month's debits
  expectedIncome?: number; // minor units, optional target
}

/**
 * Gradient hero at the top of Home. Shows month-to-date income + expenses + net,
 * with a progress bar for the fraction of income spent.
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
    <LinearGradient
      colors={gradients.brand}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[{ borderRadius: 28, overflow: 'hidden' }, shadows.brand]}
    >
      {/* decorative orbs */}
      <View
        style={{
          position: 'absolute',
          top: -40,
          right: -30,
          width: 140,
          height: 140,
          borderRadius: 70,
          backgroundColor: 'rgba(255,255,255,0.12)',
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: -50,
          left: -20,
          width: 120,
          height: 120,
          borderRadius: 60,
          backgroundColor: 'rgba(255,255,255,0.08)',
        }}
      />

      <View className="p-6">
        <Text
          style={{ color: '#E0E7FF' }}
          className="text-xs uppercase tracking-widest font-bold mb-4"
        >
          This month&apos;s cash flow
        </Text>

        <View className="flex-row mb-5">
          <Metric label="Income" value={`+${formatCurrency(income, currency)}`} valueColor="#FFFFFF" />
          <Divider />
          <Metric
            label="Expenses"
            value={`-${formatCurrency(expenses, currency)}`}
            valueColor="#FFFFFF"
          />
          <Divider />
          <Metric
            label="Net"
            value={`${net >= 0 ? '+' : ''}${formatCurrency(net, currency)}`}
            valueColor={net >= 0 ? '#FFFFFF' : '#FECDD3'}
          />
        </View>

        <View
          className="h-2.5 rounded-full overflow-hidden mb-2.5"
          style={{ backgroundColor: 'rgba(255,255,255,0.22)' }}
        >
          <View
            className="h-full rounded-full"
            style={{
              width: `${pctSpent}%`,
              backgroundColor: overspent ? '#FECACA' : '#FFFFFF',
            }}
          />
        </View>

        <Text style={{ color: '#E0E7FF' }} className="text-xs font-medium">
          {income > 0
            ? overspent
              ? `Spent ${pctSpent.toFixed(0)}% of income — over by ${formatCurrency(expenses - income, currency)}`
              : `Spent ${pctSpent.toFixed(0)}% of income · saving ${(100 - pctSpent).toFixed(0)}%`
            : expectedIncome > 0
              ? `Expected ${formatCurrency(expectedIncome, currency)} income this month`
              : 'No income recorded yet — set your expected monthly income in Profile'}
        </Text>
      </View>
    </LinearGradient>
  );
}

function Divider() {
  return (
    <View
      style={{
        width: 1,
        backgroundColor: 'rgba(255,255,255,0.22)',
        marginHorizontal: 10,
      }}
    />
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
      <Text style={{ color: '#C7D2FE' }} className="text-[11px] font-medium mb-1">
        {label}
      </Text>
      <Text
        className="text-xl font-extrabold"
        style={{ color: valueColor }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}
