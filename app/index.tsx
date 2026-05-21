import { StatusBar } from 'expo-status-bar';
import { Text, View } from 'react-native';

export default function Home() {
  return (
    <View className="flex-1 items-center justify-center bg-background p-6">
      <Text className="text-3xl font-bold text-text-primary mb-2">Pocket</Text>
      <Text className="text-base text-text-secondary">
        Your money, finally explained
      </Text>
      <StatusBar style="auto" />
    </View>
  );
}
