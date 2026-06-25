import { Text, View } from 'react-native';
import type { OwedItem } from '../../hooks/useSplitwiseBalances';
import { shadows } from '../../constants/theme';
import { GlassView } from '../ui/GlassView';
import { formatCurrency } from '../../lib/formatters';

interface OwedBarChartProps {
  items: OwedItem[]; // people the user owes, largest first
  totalMinor: number; // total owed (single-currency for now)
  currency: string; // currency for the header total
}

// Warm palette so multiple people are visually distinct. Recycled if needed.
const OWE_COLORS = ['#F43F5E', '#FB7185', '#F97316', '#F59E0B', '#EC4899', '#A855F7'];

/**
 * Horizontal bar chart of how much the user owes each person on Splitwise.
 * Bar length is relative to the largest debt; each row shows the person and
 * the formatted amount (in that balance's own currency). Mirrors the visual
 * vocabulary of CashFlowChart (surface card, grey track, colored bar).
 */
export function OwedBarChart({ items, totalMinor, currency }: OwedBarChartProps) {
  const max = Math.max(...items.map((i) => i.amountMinor), 1);

  return (
    <GlassView className="rounded-2xl p-5" style={shadows.sm}>
      <View className="flex-row items-center justify-between mb-1">
        <Text className="text-xs text-text-muted uppercase tracking-wider font-semibold">
          You owe
        </Text>
        <Text className="text-base font-bold text-danger">
          {formatCurrency(totalMinor, currency)}
        </Text>
      </View>
      <Text className="text-xs text-text-muted mb-5">
        Across {items.length} {items.length === 1 ? 'person' : 'people'} on Splitwise
      </Text>

      <View className="gap-4">
        {items.map((item, i) => {
          const pct = (item.amountMinor / max) * 100;
          const color = OWE_COLORS[i % OWE_COLORS.length];
          return (
            <View key={`${item.name}-${i}`}>
              <View className="flex-row items-center justify-between mb-1.5">
                <Text
                  className="text-sm font-medium text-text-primary"
                  numberOfLines={1}
                >
                  {item.name}
                </Text>
                <Text className="text-sm font-bold text-text-primary">
                  {formatCurrency(item.amountMinor, item.currency)}
                </Text>
              </View>
              {/* Grey track + colored bar. Min 4% so tiny debts stay visible. */}
              <View className="h-8 bg-background rounded-xl overflow-hidden">
                <View
                  className="h-full rounded-xl"
                  style={{ width: `${Math.max(pct, 4)}%`, backgroundColor: color }}
                />
              </View>
            </View>
          );
        })}
      </View>
    </GlassView>
  );
}
