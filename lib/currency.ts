// Currency registry and money formatting.
//
// Amounts in the database are stored as integer MINOR UNITS of the user's
// chosen currency:
//   - USD: cents (decimalDigits = 2)  →  1234 minor = $12.34
//   - INR: paise (decimalDigits = 2)  →  29900 minor = ₹299
//   - JPY: yen  (decimalDigits = 0)  →  1234 minor = ¥1,234  (no subdivision)
//
// formatMoney() converts minor units → a locale-formatted string for the
// given currency. Default rendering hides minor units (rounded to the
// nearest major unit); pass { withDecimals: true } to show them.

export interface Currency {
  code: CurrencyCode;
  symbol: string;
  name: string;
  locale: string; // Intl locale used for formatting
  decimalDigits: number;
}

export type CurrencyCode =
  | 'USD'
  | 'EUR'
  | 'GBP'
  | 'JPY'
  | 'INR'
  | 'CNY'
  | 'AUD'
  | 'CAD'
  | 'CHF'
  | 'SGD'
  | 'KRW'
  | 'AED';

export const CURRENCIES: Record<CurrencyCode, Currency> = {
  USD: { code: 'USD', symbol: '$',  name: 'US Dollar',         locale: 'en-US', decimalDigits: 2 },
  EUR: { code: 'EUR', symbol: '€',  name: 'Euro',              locale: 'de-DE', decimalDigits: 2 },
  GBP: { code: 'GBP', symbol: '£',  name: 'British Pound',     locale: 'en-GB', decimalDigits: 2 },
  JPY: { code: 'JPY', symbol: '¥',  name: 'Japanese Yen',      locale: 'ja-JP', decimalDigits: 0 },
  INR: { code: 'INR', symbol: '₹',  name: 'Indian Rupee',      locale: 'en-IN', decimalDigits: 2 },
  CNY: { code: 'CNY', symbol: '¥',  name: 'Chinese Yuan',      locale: 'zh-CN', decimalDigits: 2 },
  AUD: { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', locale: 'en-AU', decimalDigits: 2 },
  CAD: { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar',   locale: 'en-CA', decimalDigits: 2 },
  CHF: { code: 'CHF', symbol: 'Fr', name: 'Swiss Franc',       locale: 'de-CH', decimalDigits: 2 },
  SGD: { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar',  locale: 'en-SG', decimalDigits: 2 },
  KRW: { code: 'KRW', symbol: '₩',  name: 'Korean Won',        locale: 'ko-KR', decimalDigits: 0 },
  AED: { code: 'AED', symbol: 'د.إ',name: 'UAE Dirham',        locale: 'en-AE', decimalDigits: 2 },
};

export const DEFAULT_CURRENCY: CurrencyCode = 'USD';

export const CURRENCY_LIST: Currency[] = Object.values(CURRENCIES);

interface FormatMoneyOptions {
  withDecimals?: boolean;
}

/**
 * Format an integer minor-unit amount as a locale-correct money string.
 *   formatMoney(1234, 'USD')                      → "$12"
 *   formatMoney(1234, 'USD', { withDecimals: true }) → "$12.34"
 *   formatMoney(29900, 'INR')                     → "₹299"
 *   formatMoney(1234, 'JPY')                      → "¥1,234"  (JPY has 0 decimals)
 */
export function formatMoney(
  minorUnits: number,
  code: string = DEFAULT_CURRENCY,
  opts: FormatMoneyOptions = {},
): string {
  const cur = (CURRENCIES as Record<string, Currency>)[code] ?? CURRENCIES[DEFAULT_CURRENCY];
  const major = minorUnits / Math.pow(10, cur.decimalDigits);
  return new Intl.NumberFormat(cur.locale, {
    style: 'currency',
    currency: cur.code,
    minimumFractionDigits: opts.withDecimals ? cur.decimalDigits : 0,
    maximumFractionDigits: opts.withDecimals ? cur.decimalDigits : 0,
  }).format(major);
}

/** Get the major-unit value for a given currency. Useful for input parsing. */
export function minorToMajor(minorUnits: number, code: string = DEFAULT_CURRENCY): number {
  const cur = (CURRENCIES as Record<string, Currency>)[code] ?? CURRENCIES[DEFAULT_CURRENCY];
  return minorUnits / Math.pow(10, cur.decimalDigits);
}

/** Convert a major-unit number (what users type) to minor units (what DB stores). */
export function majorToMinor(major: number, code: string = DEFAULT_CURRENCY): number {
  const cur = (CURRENCIES as Record<string, Currency>)[code] ?? CURRENCIES[DEFAULT_CURRENCY];
  return Math.round(major * Math.pow(10, cur.decimalDigits));
}

/** Look up a Currency object by code, falling back to the default. */
export function getCurrency(code: string | null | undefined): Currency {
  if (!code) return CURRENCIES[DEFAULT_CURRENCY];
  return (CURRENCIES as Record<string, Currency>)[code] ?? CURRENCIES[DEFAULT_CURRENCY];
}
