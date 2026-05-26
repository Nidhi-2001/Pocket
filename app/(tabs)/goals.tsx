import { Text, View } from 'react-native';

export default function GoalsTab() {
  return (
    <View className="flex-1 bg-background items-center justify-center px-6">
      <Text className="text-5xl mb-4">🎯</Text>
      <Text className="text-2xl font-bold text-text-primary mb-2">Goals</Text>
      <Text className="text-base text-text-secondary text-center">
        Savings goals with an AI coach. Coming in Phase 6.
      </Text>
    </View>
  );
}
