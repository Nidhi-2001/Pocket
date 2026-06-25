import { LinearGradient } from 'expo-linear-gradient';
import { useColorScheme } from 'nativewind';
import { Platform, View, type ViewStyle } from 'react-native';

const FILL: ViewStyle = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 };

/** Soft blur on the color orbs (web only) for a dreamy, diffuse glow. */
function orbBlur(px: number): ViewStyle {
  return { filter: `blur(${px}px)` } as unknown as ViewStyle;
}

/**
 * Ambient gradient + soft color orbs that sit behind everything, giving the
 * frosted GlassView surfaces something colorful to refract. Render as the first
 * child of a flex-1 screen wrapper, with the scrollable content on top.
 */
export function ScreenBackground() {
  const { colorScheme } = useColorScheme();
  const dark = colorScheme === 'dark';

  const base = dark
    ? (['#0A0E1A', '#160F33', '#0A0E1A'] as const)
    : (['#EAF0FF', '#F4ECFF', '#FFEFF6'] as const);
  const orbA = dark ? 'rgba(99,102,241,0.45)' : 'rgba(99,102,241,0.35)';
  const orbB = dark ? 'rgba(139,92,246,0.40)' : 'rgba(236,72,153,0.28)';
  const blur = Platform.OS === 'web' ? orbBlur(70) : null;

  return (
    <View style={FILL} pointerEvents="none">
      <LinearGradient colors={base} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={FILL} />
      <View
        style={[
          { position: 'absolute', top: -60, right: -50, width: 300, height: 300, borderRadius: 150, backgroundColor: orbA },
          blur,
        ]}
      />
      <View
        style={[
          { position: 'absolute', top: '38%', left: -90, width: 320, height: 320, borderRadius: 160, backgroundColor: orbB },
          blur,
        ]}
      />
    </View>
  );
}
