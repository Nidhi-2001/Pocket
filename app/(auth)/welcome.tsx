import { LinearGradient } from 'expo-linear-gradient';
import { Link } from 'expo-router';
import { Linking, Pressable, Text, View } from 'react-native';
import { gradients, shadows } from '../../constants/theme';

const PRIVACY_URL = 'https://github.com/Nidhi-2001/Pocket/blob/main/PRIVACY.md';

export default function Welcome() {
  return (
    <LinearGradient
      colors={gradients.brandDeep}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ flex: 1 }}
    >
      {/* decorative orbs */}
      <View
        style={{
          position: 'absolute',
          top: -60,
          right: -40,
          width: 220,
          height: 220,
          borderRadius: 110,
          backgroundColor: 'rgba(255,255,255,0.10)',
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: 120,
          left: -60,
          width: 200,
          height: 200,
          borderRadius: 100,
          backgroundColor: 'rgba(255,255,255,0.07)',
        }}
      />

      <View className="flex-1 px-6 py-16 justify-between">
        <View />

        <View className="items-center">
          <View
            className="w-24 h-24 rounded-4xl items-center justify-center mb-7"
            style={{ backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' }}
          >
            <Text className="text-6xl">💰</Text>
          </View>
          <Text className="text-5xl font-extrabold text-white mb-3 tracking-tight">
            Pocket
          </Text>
          <Text className="text-xl text-white/90 text-center mb-8 font-medium">
            Your money, finally explained
          </Text>
          <Text className="text-base text-white/70 text-center px-2 leading-relaxed">
            We read your bank SMS, sort every transaction into the right bucket,
            and tell you what&apos;s actually going on with your money. No
            spreadsheets, no manual entry.
          </Text>
        </View>

        <View>
          <Link href="/how-it-works" asChild>
            <Pressable
              className="bg-white py-4 rounded-2xl items-center active:opacity-90"
              style={shadows.md}
            >
              <Text className="text-primary-dark font-bold text-lg">Get started</Text>
            </Pressable>
          </Link>
          <Link href="/auth?mode=login" asChild>
            <Pressable className="mt-4 py-2 items-center active:opacity-80">
              <Text className="text-white/90 font-medium text-base">
                I already have an account · Log in
              </Text>
            </Pressable>
          </Link>
          <Pressable
            onPress={() => Linking.openURL(PRIVACY_URL)}
            className="mt-2 py-1 items-center active:opacity-70"
          >
            <Text className="text-white/55 text-xs">Privacy policy</Text>
          </Pressable>
        </View>
      </View>
    </LinearGradient>
  );
}
