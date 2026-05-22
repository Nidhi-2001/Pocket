import { Link } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

const benefits = [
  {
    emoji: '✅',
    title: 'Only your bank SMS',
    body: 'Messages from HDFC, ICICI, SBI, Axis and similar. Never your personal chats.',
  },
  {
    emoji: '🔒',
    title: 'Your data stays yours',
    body: 'SMS text is parsed and discarded. Only the structured transaction (amount, merchant, category) is stored.',
  },
  {
    emoji: '⚡',
    title: 'No manual entry',
    body: 'Every spend lands in Pocket automatically — categorised and ready to review.',
  },
];

export default function SmsPermission() {
  return (
    <View className="flex-1 bg-background">
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 64, paddingBottom: 24 }}
      >
        <View className="items-center mb-8">
          <Text className="text-6xl mb-5">📱</Text>
          <Text className="text-3xl font-bold text-text-primary text-center mb-3">
            Read your bank SMS
          </Text>
          <Text className="text-base text-text-secondary text-center leading-relaxed">
            We need permission to read bank notification SMS so we can track
            your transactions for you.
          </Text>
        </View>

        <View className="gap-3 mb-8">
          {benefits.map((b) => (
            <View key={b.title} className="bg-surface border border-border rounded-2xl p-4">
              <Text className="text-text-primary font-semibold mb-1">
                {b.emoji}  {b.title}
              </Text>
              <Text className="text-text-secondary text-sm leading-relaxed">
                {b.body}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View className="px-6 pb-10 pt-2 bg-background">
        <Link href="/otp" asChild>
          <Pressable className="bg-primary py-4 rounded-2xl items-center active:opacity-80">
            <Text className="text-white font-semibold text-lg">Continue</Text>
          </Pressable>
        </Link>
        <Text className="text-text-muted text-xs text-center mt-3">
          You can change SMS permission anytime in your phone settings.
        </Text>
      </View>
    </View>
  );
}
