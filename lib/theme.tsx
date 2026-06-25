import AsyncStorage from '@react-native-async-storage/async-storage';
import { colorScheme } from 'nativewind';
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

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v === 'light' || v === 'dark' || v === 'system') setPrefState(v);
    });
  }, []);

  // Resolve the preference to an explicit light/dark scheme (following the OS
  // when 'system'), then push that into NativeWind and — on web — toggle the
  // root `dark` class so the `.dark:root` CSS variables apply.
  //
  // We always hand NativeWind an explicit 'light'/'dark' (never 'system'):
  // in 'system' mode NativeWind strips the web `dark` class (it expects a
  // prefers-color-scheme media query to drive `dark:` variants), which left our
  // CSS-variable theme out of sync. Resolving here keeps the class stable and
  // works the same on native (NativeWind applies `.dark:root` vars for the
  // explicit scheme).
  useEffect(() => {
    const mq =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.matchMedia?.('(prefers-color-scheme: dark)')
        : null;
    const apply = () => {
      const dark = pref === 'dark' || (pref === 'system' && !!mq?.matches);
      colorScheme.set(dark ? 'dark' : 'light');
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        document.documentElement.classList.toggle('dark', dark);
      }
    };
    apply();
    if (pref === 'system' && mq) {
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  }, [pref]);

  function setPref(p: ThemePref) {
    setPrefState(p);
    AsyncStorage.setItem(STORAGE_KEY, p).catch(() => {});
  }

  return (
    <ThemeContext.Provider value={{ pref, setPref }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useThemePref = () => useContext(ThemeContext);
