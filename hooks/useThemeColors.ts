import { useColorScheme } from 'nativewind';
import { colors, darkColors } from '../constants/theme';

/**
 * Returns the active palette (light or dark) for code that sets colors via
 * inline `style` instead of NativeWind className tokens. Re-renders when the
 * color scheme changes. className-based tokens (bg-surface, text-text-primary,
 * …) switch automatically via the CSS variables in global.css.
 */
export function useThemeColors() {
  const { colorScheme } = useColorScheme();
  return colorScheme === 'dark' ? darkColors : colors;
}
