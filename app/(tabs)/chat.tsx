import { Text, View } from 'react-native';

export default function ChatTab() {
  return (
    <View className="flex-1 bg-background items-center justify-center px-6">
      <Text className="text-5xl mb-4">💬</Text>
      <Text className="text-2xl font-bold text-text-primary mb-2">Chat</Text>
      <Text className="text-base text-text-secondary text-center">
        Ask Pocket anything about your money — grounded in your transaction
        history. Coming in Phase 5.
      </Text>
    </View>
  );
}
