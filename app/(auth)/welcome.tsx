import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

export default function Welcome() {
  return (
    <View className="flex-1 bg-background px-6 py-16 justify-between">
      <View />

      <View className="items-center">
        <Text className="text-7xl mb-6">💰</Text>
        <Text className="text-4xl font-bold text-text-primary mb-3">
          Pocket
        </Text>
        <Text className="text-xl text-text-secondary text-center mb-8">
          Your money, finally explained
        </Text>
        <Text className="text-base text-text-muted text-center px-2 leading-relaxed">
          We read your bank SMS, sort every transaction into the right bucket,
          and tell you what&apos;s actually going on with your money. No
          spreadsheets, no manual entry.
        </Text>
      </View>

      <Link href="/sms-permission" asChild>
        <Pressable className="bg-primary py-4 rounded-2xl items-center active:opacity-80">
          <Text className="text-white font-semibold text-lg">Get started</Text>
        </Pressable>
      </Link>
    </View>
  );
}
