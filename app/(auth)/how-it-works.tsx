import { Link } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { shadows } from '../../constants/theme';

const features = [
  {
    emoji: '⚡',
    title: 'Log spends in seconds',
    body: 'Just type or speak — "coffee at Blue Bottle 6" — and Pocket records and categorises it for you.',
  },
  {
    emoji: '📄',
    title: 'Snap a statement',
    body: 'Upload a bank or credit-card PDF and Pocket pulls out every transaction, skipping duplicates.',
  },
  {
    emoji: '👥',
    title: 'Track shared expenses',
    body: 'Connect Splitwise so what you paid becomes a transaction and what you owe folds into your balance.',
  },
  {
    emoji: '🎯',
    title: 'Budgets, goals & insights',
    body: 'Set monthly and per-category budgets, save toward goals, and get a daily AI insight about your money.',
  },
];

export default function HowItWorks() {
  return (
    <View className="flex-1 bg-background">
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 64, paddingBottom: 24 }}
      >
        <View className="items-center mb-8">
          <Text className="text-6xl mb-5">💸</Text>
          <Text className="text-3xl font-extrabold text-text-primary text-center mb-3 tracking-tight">
            Here&apos;s how Pocket works
          </Text>
          <Text className="text-base text-text-secondary text-center leading-relaxed">
            One place to see where your money goes — no spreadsheets, no tedious
            manual entry.
          </Text>
        </View>

        <View className="gap-3 mb-8">
          {features.map((f) => (
            <View key={f.title} className="bg-surface rounded-3xl p-5" style={shadows.sm}>
              <Text className="text-text-primary font-bold mb-1 text-base">
                {f.emoji}  {f.title}
              </Text>
              <Text className="text-text-secondary text-sm leading-relaxed">
                {f.body}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View className="px-6 pb-10 pt-2 bg-background">
        <Link href="/auth" asChild>
          <Pressable
            className="bg-primary py-4 rounded-2xl items-center active:opacity-80"
            style={shadows.brand}
          >
            <Text className="text-white font-semibold text-lg">Create your account</Text>
          </Pressable>
        </Link>
        <Text className="text-text-muted text-xs text-center mt-3">
          Your data is private and never sold. See our privacy policy anytime.
        </Text>
      </View>
    </View>
  );
}
