import { createContext, useContext } from 'react';
import { DEFAULT_CURRENCY } from '../lib/currency';

/**
 * Currency context — populated once from the user's profile in
 * app/_layout.tsx and read by every screen that displays money.
 *
 * Falls back to DEFAULT_CURRENCY ('USD') if no provider is present, so
 * unit tests and stories don't crash.
 */
export const CurrencyContext = createContext<string>(DEFAULT_CURRENCY);

export function useCurrency(): string {
  return useContext(CurrencyContext);
}
