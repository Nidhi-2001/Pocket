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
    ? (['#0A0F1E', '#0D1730', '#0A0F1E'] as const)
    : (['#EEF3FB', '#E6EEF9', '#EFF4F9'] as const);
  const orbA = dark ? 'rgba(37,99,235,0.45)' : 'rgba(37,99,235,0.30)';
  const orbB = dark ? 'rgba(14,165,233,0.38)' : 'rgba(20,184,166,0.22)';
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
