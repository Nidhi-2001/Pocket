import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { shadows } from '../../constants/theme';
import { GlassView } from '../ui/GlassView';
import type { Nudge } from '../../types';

interface NudgeCardProps {
  nudge: Nudge;
  onDismiss: () => void;
}

const TYPE_META: Record<Nudge['type'], { emoji: string; tint: string }> = {
  budget_warning: { emoji: '⚠️', tint: '#EF4444' },
  goal_check: { emoji: '🎯', tint: '#64748B' },
  weekly_digest: { emoji: '📊', tint: '#10B981' },
  personality: { emoji: '✨', tint: '#64748B' },
  daily_reminder: { emoji: '📝', tint: '#F59E0B' },
};

export function NudgeCard({ nudge, onDismiss }: NudgeCardProps) {
  const meta = TYPE_META[nudge.type] ?? TYPE_META.weekly_digest;
  return (
    <GlassView className="rounded-3xl p-4 flex-row gap-3" style={shadows.sm}>
      <Text className="text-2xl">{meta.emoji}</Text>
      <View className="flex-1">
        <Text
          className="text-xs uppercase font-bold tracking-widest mb-1"
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
    </GlassView>
  );
}
