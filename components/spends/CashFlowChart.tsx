import { Text, View } from 'react-native';
import { shadows } from '../../constants/theme';
import { GlassView } from '../ui/GlassView';
import { formatCurrency } from '../../lib/formatters';

export interface FlowSegment {
  label: string;
  value: number;
  color: string;
}

interface CashFlowChartProps {
  income: FlowSegment[];
  expenses: FlowSegment[];
  currency: string;
}

/**
 * A single horizontal-stacked-bars chart that puts income and expenses
 * on the same x-axis so the user can compare them at a glance. Each
 * bar's width is relative to the LARGER of the two totals; each bar
 * is further sub-divided into colored segments by source/category.
 *
 * Renders a legend below so users can map colors to labels without a
 * separate chart per side.
 */
export function CashFlowChart({ income, expenses, currency }: CashFlowChartProps) {
  const totalIncome = income.reduce((s, seg) => s + seg.value, 0);
  const totalExpenses = expenses.reduce((s, seg) => s + seg.value, 0);
  const max = Math.max(totalIncome, totalExpenses, 1);

  const incomeBarPct = (totalIncome / max) * 100;
  const expensesBarPct = (totalExpenses / max) * 100;
  const net = totalIncome - totalExpenses;

  return (
    <GlassView className="rounded-2xl p-5" style={shadows.sm}>
      <Text className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-5">
        Income vs Expenses
      </Text>

      {/* Income row */}
      <Row
        label="Income"
        total={totalIncome}
        currency={currency}
        valueColor="#10B981"
        sign="+"
        barPct={incomeBarPct}
        segments={income}
      />

      <View style={{ height: 20 }} />

      {/* Expenses row */}
      <Row
        label="Expenses"
        total={totalExpenses}
        currency={currency}
        valueColor="#EF4444"
        sign="-"
        barPct={expensesBarPct}
        segments={expenses}
      />

      {/* Net */}
      <View className="mt-5 pt-4 border-t border-border flex-row items-center justify-between">
        <Text className="text-sm font-semibold text-text-secondary">Net</Text>
        <Text
          className="text-lg font-bold"
          style={{ color: net >= 0 ? '#10B981' : '#EF4444' }}
        >
          {net >= 0 ? '+' : ''}
          {formatCurrency(net, currency)}
        </Text>
      </View>

      {/* Legends */}
      {(income.length > 0 || expenses.length > 0) && (
        <View className="mt-4 pt-4 border-t border-border gap-3">
          {income.length > 0 && (
            <Legend title="Income sources" segments={income} />
          )}
          {expenses.length > 0 && (
            <Legend title="Expense categories" segments={expenses} />
          )}
        </View>
      )}
    </GlassView>
  );
}

interface RowProps {
  label: string;
  total: number;
  currency: string;
  valueColor: string;
  sign: '+' | '-';
  barPct: number;
  segments: FlowSegment[];
}

function Row({ label, total, currency, valueColor, sign, barPct, segments }: RowProps) {
  return (
    <View>
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-sm font-medium text-text-primary">{label}</Text>
        <Text className="text-base font-bold" style={{ color: valueColor }}>
          {sign}
          {formatCurrency(total, currency)}
        </Text>
      </View>
      {/* Container is full-width grey track, inner is the colored bar */}
      <View className="h-10 bg-background rounded-xl overflow-hidden">
        <View
          className="h-full flex-row"
          style={{ width: `${barPct}%` }}
        >
          {segments.map((s, i) => {
            const segPct = total > 0 ? (s.value / total) * 100 : 0;
            return (
              <View
                key={`${label}-${i}-${s.label}`}
                style={{ width: `${segPct}%`, backgroundColor: s.color }}
                className="h-full"
              />
            );
          })}
        </View>
      </View>
    </View>
  );
}

interface LegendProps {
  title: string;
  segments: FlowSegment[];
}

function Legend({ title, segments }: LegendProps) {
  return (
    <View>
      <Text className="text-[10px] text-text-muted uppercase tracking-wider mb-2 font-semibold">
        {title}
      </Text>
      <View className="flex-row flex-wrap gap-x-3 gap-y-1.5">
        {segments.map((s, i) => (
          <View key={`${title}-${i}`} className="flex-row items-center gap-1.5">
            <View
              className="w-2.5 h-2.5 rounded-sm"
              style={{ backgroundColor: s.color }}
            />
            <Text className="text-xs text-text-secondary">{s.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
