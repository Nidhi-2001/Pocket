import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { shadows } from '../../constants/theme';
import { GlassView } from '../ui/GlassView';
import { useInsight } from '../../hooks/useInsight';

const PURPLE = '#2563EB';

/**
 * Proactive AI insight card on Home. Shows today's single LLM-generated,
 * number-grounded observation (✨ + "today"), dismissable, and tappable to the
 * related category on Spends. Friendly placeholder when there's not enough data.
 */
export function InsightCard() {
  const router = useRouter();
  const { insight, loading, dismissedToday, dismiss } = useInsight();

  // Dismissed today → respect it, hide the card entirely (don't fall back to
  // the new-user placeholder).
  if (!insight && dismissedToday) return null;

  if (loading && !insight) {
    return (
      <GlassView className="rounded-3xl p-4 flex-row items-center gap-3" style={shadows.sm}>
        <IconChip />
        <Text className="text-sm text-text-muted flex-1">Looking at your money…</Text>
        <ActivityIndicator size="small" />
      </GlassView>
    );
  }

  if (!insight) {
    return (
      <GlassView className="rounded-3xl p-4 flex-row items-start gap-3" style={shadows.sm}>
        <IconChip outline />
        <Text className="flex-1 text-sm text-text-secondary leading-relaxed pt-1">
          Log a few more transactions and I&apos;ll start surfacing insights about
          your money here.
        </Text>
      </GlassView>
    );
  }

  const tappable = !!insight.related_category;

  return (
    <GlassView className="rounded-3xl p-4" style={shadows.sm}>
      <View className="flex-row items-start gap-3">
        <IconChip />
        <View className="flex-1">
          <View className="flex-row items-center justify-between mb-1">
            <Text
              className="text-[11px] uppercase font-bold tracking-widest"
              style={{ color: PURPLE }}
            >
              Insight · today
            </Text>
            <Pressable onPress={dismiss} hitSlop={8} className="active:opacity-60">
              <Ionicons name="close" size={16} color="#94A3B8" />
            </Pressable>
          </View>
          <Pressable
            onPress={tappable ? () => router.push('/spends') : undefined}
            disabled={!tappable}
          >
            <Text className="text-[15px] text-text-primary leading-relaxed font-medium">
              {insight.insight_text}
            </Text>
            {tappable && (
              <Text className="text-xs mt-2 font-bold" style={{ color: PURPLE }}>
                View {insight.related_category} →
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </GlassView>
  );
}

function IconChip({ outline = false }: { outline?: boolean }) {
  return (
    <View
      className="w-8 h-8 rounded-xl items-center justify-center"
      style={{ backgroundColor: PURPLE + '1F' }}
    >
      <Ionicons name={outline ? 'sparkles-outline' : 'sparkles'} size={16} color={PURPLE} />
    </View>
  );
}
