import { Text, View } from 'react-native';
import { shadows } from '../../constants/theme';
import { GlassView } from '../ui/GlassView';
import { useCurrency } from '../../hooks/useCurrency';
import { useNetPosition } from '../../hooks/useNetPosition';
import { formatCurrency } from '../../lib/formatters';

const GREEN = '#10B981';
const RED = '#F43F5E';

/**
 * Cumulative "where you stand" summary — net flow (all recorded income vs
 * spend) adjusted by your live Splitwise balance, so the headline reflects
 * money you owe / are owed. Updates automatically via useNetPosition.
 */
export function NetPositionCard() {
  const currency = useCurrency();
  const { netFlow, oweMinor, owedToMeMinor, netPosition } = useNetPosition();

  return (
    <GlassView className="rounded-3xl p-5" style={shadows.sm}>
      <Text className="text-xs text-text-muted uppercase tracking-widest font-bold mb-2">
        Net position
      </Text>
      <Text
        className="text-4xl font-extrabold"
        style={{ color: netPosition >= 0 ? GREEN : RED }}
      >
        {netPosition >= 0 ? '+' : ''}
        {formatCurrency(netPosition, currency)}
      </Text>
      <Text className="text-xs text-text-muted mb-4">
        {oweMinor > 0 || owedToMeMinor > 0
          ? 'After settling Splitwise'
          : 'All recorded money in minus out'}
      </Text>

      <View className="gap-2.5 pt-4 border-t border-border">
        <Line
          label="Net flow (in − out)"
          amount={netFlow}
          currency={currency}
        />
        {oweMinor > 0 && (
          <Line
            label="You owe on Splitwise"
            amount={-oweMinor}
            currency={currency}
          />
        )}
        {owedToMeMinor > 0 && (
          <Line
            label="Owed to you on Splitwise"
            amount={owedToMeMinor}
            currency={currency}
          />
        )}
      </View>
    </GlassView>
  );
}

function Line({
  label,
  amount,
  currency,
}: {
  label: string;
  amount: number;
  currency: string;
}) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-sm text-text-secondary">{label}</Text>
      <Text
        className="text-sm font-semibold"
        style={{ color: amount >= 0 ? GREEN : RED }}
      >
        {amount >= 0 ? '+' : '−'}
        {formatCurrency(Math.abs(amount), currency)}
      </Text>
    </View>
  );
}
