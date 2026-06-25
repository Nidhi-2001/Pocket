import AsyncStorage from '@react-native-async-storage/async-storage';
import { colorScheme, useColorScheme } from 'nativewind';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';

export type ThemePref = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'pocket-theme-pref';

interface ThemeContextValue {
  pref: ThemePref;
  setPref: (p: ThemePref) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  pref: 'system',
  setPref: () => {},
});

/**
 * Holds the user's appearance preference (System / Light / Dark), persists it,
 * and pushes it into NativeWind's colorScheme — which toggles the `dark` class
 * and re-themes every CSS-variable token at once. 'system' follows the OS.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>('system');
  // Resolved scheme ('light' | 'dark'), following the OS when pref is 'system'.
  const { colorScheme: resolved } = useColorScheme();

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v === 'light' || v === 'dark' || v === 'system') {
        setPrefState(v);
        colorScheme.set(v);
      }
    });
  }, []);

  // On web, NativeWind doesn't toggle the root `dark` class for us, so the
  // `.dark:root` CSS variables in global.css never apply. Drive it from the
  // resolved scheme. (Native applies the variables through NativeWind's runtime.)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const root = document.documentElement;
    if (resolved === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }, [resolved]);

  function setPref(p: ThemePref) {
    setPrefState(p);
    colorScheme.set(p);
    AsyncStorage.setItem(STORAGE_KEY, p).catch(() => {});
  }

  return (
    <ThemeContext.Provider value={{ pref, setPref }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useThemePref = () => useContext(ThemeContext);
