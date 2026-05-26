import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import type { Nudge } from '../../types';

interface NudgeCardProps {
  nudge: Nudge;
  onDismiss: () => void;
}

const TYPE_META: Record<Nudge['type'], { emoji: string; tint: string }> = {
  budget_warning: { emoji: '⚠️', tint: '#F43F5E' },
  goal_check: { emoji: '🎯', tint: '#4F46E5' },
  weekly_digest: { emoji: '📊', tint: '#10B981' },
  personality: { emoji: '✨', tint: '#8B5CF6' },
};

export function NudgeCard({ nudge, onDismiss }: NudgeCardProps) {
  const meta = TYPE_META[nudge.type] ?? TYPE_META.weekly_digest;
  return (
    <View
      className="border rounded-2xl p-4 flex-row gap-3"
      style={{ backgroundColor: meta.tint + '12', borderColor: meta.tint + '40' }}
    >
      <Text className="text-2xl">{meta.emoji}</Text>
      <View className="flex-1">
        <Text
          className="text-xs uppercase font-semibold tracking-wider mb-1"
          style={{ color: meta.tint }}
        >
          {nudge.type.replace('_', ' ')}
        </Text>
        <Text className="text-sm text-text-primary leading-relaxed">
          {nudge.message}
        </Text>
      </View>
      <Pressable
        onPress={onDismiss}
        className="p-1 -mr-1 -mt-1 active:opacity-60"
      >
        <Ionicons name="close" size={18} color="#9CA3AF" />
      </Pressable>
    </View>
  );
}
