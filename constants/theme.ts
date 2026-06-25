export const colors = {
  primary: '#6366F1',
  primaryDark: '#4F46E5',
  primaryDeep: '#4338CA',
  primaryLight: '#EEF2FF',
  accent: '#8B5CF6',
  success: '#10B981',
  successDark: '#059669',
  danger: '#F43F5E',
  warning: '#F59E0B',
  background: '#F5F6FB',
  surface: '#FFFFFF',
  surfaceSoft: '#F1F2F9',
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  border: '#ECEDF3',
} as const;

/**
 * Dark-mode equivalents for code that sets colors via inline `style` (e.g. the
 * tab bar, navigator background) and can't use the CSS-variable className
 * tokens. Keep these in sync with the `.dark:root` block in global.css.
 * Brand/accent/success/danger are identical in both themes.
 */
export const darkColors = {
  ...colors,
  primaryLight: '#1E2547',
  background: '#0B1020',
  surface: '#161D31',
  surfaceSoft: '#202840',
  textPrimary: '#F1F5F9',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  border: '#28304A',
} as const;

/** Reusable gradient stops (direction decided at the call site). */
export const gradients = {
  // Signature brand gradient — indigo → violet. Used on the hero + FAB.
  brand: ['#6366F1', '#7C6FF2', '#8B5CF6'] as const,
  brandDeep: ['#4F46E5', '#6D5DF0', '#8B5CF6'] as const,
  success: ['#10B981', '#34D399'] as const,
  danger: ['#F43F5E', '#FB7185'] as const,
  // Subtle light wash for soft cards.
  wash: ['#F5F6FB', '#EEF1FB'] as const,
} as const;

/**
 * Soft elevation presets. RN shadow props translate to CSS box-shadow on web,
 * so these work on both. Spread into a `style` prop.
 */
export const shadows = {
  sm: {
    shadowColor: '#1E293B',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  md: {
    shadowColor: '#1E293B',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  // Colored glow for the brand hero / FAB.
  brand: {
    shadowColor: '#6366F1',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
} as const;

export const categories = {
  Food: { emoji: '🍕', color: '#F59E0B' },
  Transport: { emoji: '🚗', color: '#3B82F6' },
  Shopping: { emoji: '🛍️', color: '#8B5CF6' },
  Entertainment: { emoji: '🎬', color: '#EC4899' },
  Other: { emoji: '💸', color: '#64748B' },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
} as const;

export type CategoryKey = keyof typeof categories;
