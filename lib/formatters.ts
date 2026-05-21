import { formatInTimeZone } from 'date-fns-tz';

const IST = 'Asia/Kolkata';

/**
 * Format an amount stored in paise as an Indian-Rupee string.
 * 129900 → "₹1,299"   (whole rupees by default)
 * 129950 → "₹1,299.50" (when withPaise = true)
 */
export function formatCurrency(paise: number, withPaise = false): string {
  const rupees = paise / 100;
  return rupees.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: withPaise ? 2 : 0,
    maximumFractionDigits: withPaise ? 2 : 0,
  });
}

/** Format an ISO datetime in IST. Defaults to "24 Mar, 2:30 PM". */
export function formatDateIST(iso: string, pattern = 'd MMM, h:mm a'): string {
  return formatInTimeZone(iso, IST, pattern);
}

/** Just the date part: "24 Mar 2026". */
export function formatDateOnlyIST(iso: string): string {
  return formatInTimeZone(iso, IST, 'd MMM yyyy');
}
