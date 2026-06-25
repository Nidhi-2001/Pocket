import { useColorScheme } from 'nativewind';
import type { ReactNode } from 'react';
import { Platform, View, type ViewProps, type ViewStyle } from 'react-native';

/** backdrop-filter is web-only CSS and not part of RN's ViewStyle types. */
function webBlur(px: number): ViewStyle {
  return {
    backdropFilter: `blur(${px}px) saturate(160%)`,
    WebkitBackdropFilter: `blur(${px}px) saturate(160%)`,
  } as unknown as ViewStyle;
}

/**
 * Returns the frosted-glass style object (tint + light border + web blur) for
 * the active color scheme. Use on components that can't be a GlassView
 * (Pressable, Link children, etc.): style={[useGlassStyle(), shadows.sm]}.
 */
export function useGlassStyle(blur = 18): ViewStyle {
  const { colorScheme } = useColorScheme();
  const dark = colorScheme === 'dark';
  const tint: ViewStyle = dark
    ? { backgroundColor: 'rgba(38,46,74,0.45)', borderColor: 'rgba(255,255,255,0.12)', borderWidth: 1 }
    : { backgroundColor: 'rgba(255,255,255,0.55)', borderColor: 'rgba(255,255,255,0.75)', borderWidth: 1 };
  return { ...tint, ...(Platform.OS === 'web' ? webBlur(blur) : null) };
}

interface GlassProps extends ViewProps {
  children?: ReactNode;
  /** Blur radius in px (web). */
  blur?: number;
}

/**
 * Frosted-glass surface. Semi-transparent tint + light hairline border so the
 * ambient background (see ScreenBackground) refracts through, plus a real
 * backdrop blur on web. Native falls back to the translucent tint (add
 * expo-blur later for true native blur). Spread `style` to set radius/padding.
 */
export function GlassView({ children, blur = 18, style, ...rest }: GlassProps) {
  const glass = useGlassStyle(blur);
  return (
    <View style={[glass, style]} {...rest}>
      {children}
    </View>
  );
}
