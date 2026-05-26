import { Text, View } from 'react-native';
import type { Personality } from '../../types';

interface PersonalityCardProps {
  personality: Personality;
}

export function PersonalityCard({ personality }: PersonalityCardProps) {
  const month = formatMonth(personality.month);
  const insights = Array.isArray(personality.insights)
    ? (personality.insights as string[])
    : [];
  const actions = Array.isArray(personality.actions)
    ? (personality.actions as string[])
    : [];

  return (
    <View
      className="rounded-3xl p-5 border"
      style={{ backgroundColor: '#1F2937', borderColor: '#374151' }}
    >
      <Text className="text-xs text-text-muted uppercase tracking-wider mb-2">
        Your {month} personality
      </Text>
      <View className="flex-row items-center gap-3 mb-4">
        <Text className="text-4xl">{personality.emoji}</Text>
        <Text className="text-2xl font-bold text-white flex-1">
          {personality.title}
        </Text>
      </View>

      {insights.length > 0 && (
        <View className="gap-2 mb-4">
          {insights.map((insight, i) => (
            <View key={i} className="flex-row gap-2">
              <Text className="text-text-muted">•</Text>
              <Text className="text-sm text-white flex-1 leading-relaxed">
                {insight}
              </Text>
            </View>
          ))}
        </View>
      )}

      {actions.length > 0 && (
        <View
          className="rounded-2xl p-3"
          style={{ backgroundColor: '#374151' }}
        >
          <Text className="text-xs text-text-muted uppercase mb-1 tracking-wider">
            Try this
          </Text>
          {actions.map((a, i) => (
            <Text key={i} className="text-sm text-white leading-relaxed">
              {a}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

function formatMonth(yyyymm: string): string {
  // 'YYYY-MM' → 'Mar 2026'
  const [y, m] = yyyymm.split('-').map(Number);
  if (!y || !m) return yyyymm;
  const date = new Date(Date.UTC(y, m - 1, 1));
  return date.toLocaleString('en-IN', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
