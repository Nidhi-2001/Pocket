import { format, parseISO } from 'date-fns';
import { DEFAULT_CURRENCY, formatMoney } from './currency';

/**
 * Format an integer minor-unit amount as a money string in the given
 * currency. Re-exported from ./currency for convenience.
 *
 *   formatCurrency(1234, 'USD')  → "$12"
 *   formatCurrency(29900, 'INR') → "₹299"
 *
 * The currency argument is required for correctness, but defaults to USD
 * if the caller hasn't loaded a profile yet — that way money never
 * renders as a raw integer.
 */
export function formatCurrency(
  minorUnits: number,
  currency: string = DEFAULT_CURRENCY,
  withDecimals = false,
): string {
  return formatMoney(minorUnits, currency, { withDecimals });
}

/**
 * Format an ISO timestamp using the device's local timezone.
 * Default pattern: "24 Mar, 2:30 PM".
 */
export function formatDate(iso: string, pattern = 'd MMM, h:mm a'): string {
  return format(parseISO(iso), pattern);
}

/** Date-only formatting: "24 Mar 2026". */
export function formatDateOnly(iso: string): string {
  return format(parseISO(iso), 'd MMM yyyy');
}
