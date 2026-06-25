import { LinearGradient } from 'expo-linear-gradient';
import { Text, View } from 'react-native';
import { shadows } from '../../constants/theme';
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
    <LinearGradient
      colors={['#1E293B', '#1E3A8A']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[{ borderRadius: 28, padding: 20 }, shadows.md]}
    >
      <Text className="text-xs uppercase tracking-widest font-bold mb-2" style={{ color: '#BFDBFE' }}>
        Your {month} personality
      </Text>
      <View className="flex-row items-center gap-3 mb-4">
        <Text className="text-4xl">{personality.emoji}</Text>
        <Text className="text-2xl font-extrabold text-white flex-1">
          {personality.title}
        </Text>
      </View>

      {insights.length > 0 && (
        <View className="gap-2 mb-4">
          {insights.map((insight, i) => (
            <View key={i} className="flex-row gap-2">
              <Text style={{ color: '#BFDBFE' }}>•</Text>
              <Text className="text-sm flex-1 leading-relaxed" style={{ color: 'rgba(255,255,255,0.92)' }}>
                {insight}
              </Text>
            </View>
          ))}
        </View>
      )}

      {actions.length > 0 && (
        <View
          className="rounded-2xl p-3.5"
          style={{ backgroundColor: 'rgba(255,255,255,0.10)' }}
        >
          <Text className="text-xs uppercase mb-1 tracking-widest font-bold" style={{ color: '#BFDBFE' }}>
            Try this
          </Text>
          {actions.map((a, i) => (
            <Text key={i} className="text-sm text-white leading-relaxed">
              {a}
            </Text>
          ))}
        </View>
      )}
    </LinearGradient>
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
