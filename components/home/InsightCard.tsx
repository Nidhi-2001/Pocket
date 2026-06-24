import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useInsight } from '../../hooks/useInsight';

const PURPLE = '#8B5CF6';

/**
 * Proactive AI insight card on Home. Shows today's single LLM-generated,
 * number-grounded observation (✨ + "today"), dismissable, and tappable to the
 * related category on Spends. Friendly placeholder when there's not enough data.
 */
export function InsightCard() {
  const router = useRouter();
  const { insight, loading, dismiss } = useInsight();

  if (loading && !insight) {
    return (
      <View className="bg-surface border border-border rounded-2xl p-4 flex-row items-center gap-3">
        <Ionicons name="sparkles" size={18} color={PURPLE} />
        <Text className="text-sm text-text-muted flex-1">Looking at your money…</Text>
        <ActivityIndicator size="small" />
      </View>
    );
  }

  if (!insight) {
    return (
      <View className="bg-surface border border-border rounded-2xl p-4 flex-row items-start gap-3">
        <Ionicons name="sparkles-outline" size={18} color={PURPLE} />
        <Text className="flex-1 text-sm text-text-secondary leading-relaxed">
          Log a few more transactions and I&apos;ll start surfacing insights about
          your money here.
        </Text>
      </View>
    );
  }

  const tappable = !!insight.related_category;

  return (
    <View
      className="rounded-2xl p-4 border"
      style={{ backgroundColor: PURPLE + '10', borderColor: PURPLE + '33' }}
    >
      <View className="flex-row items-start gap-3">
        <Ionicons name="sparkles" size={18} color={PURPLE} />
        <View className="flex-1">
          <View className="flex-row items-center justify-between mb-1">
            <Text
              className="text-[11px] uppercase font-semibold tracking-wider"
              style={{ color: PURPLE }}
            >
              Insight · today
            </Text>
            <Pressable onPress={dismiss} hitSlop={8} className="active:opacity-60">
              <Ionicons name="close" size={16} color="#9CA3AF" />
            </Pressable>
          </View>
          <Pressable
            onPress={tappable ? () => router.push('/spends') : undefined}
            disabled={!tappable}
          >
            <Text className="text-sm text-text-primary leading-relaxed">
              {insight.insight_text}
            </Text>
            {tappable && (
              <Text className="text-xs mt-1.5 font-medium" style={{ color: PURPLE }}>
                View {insight.related_category} →
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}
