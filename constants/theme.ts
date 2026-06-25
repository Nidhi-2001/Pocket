export const colors = {
  primary: '#334155',
  primaryDark: '#1E293B',
  primaryDeep: '#0F172A',
  primaryLight: '#F1F5F9',
  accent: '#64748B',
  success: '#10B981',
  successDark: '#059669',
  danger: '#EF4444',
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
  primaryLight: '#1E293B',
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
  // Signature brand gradient — graphite slate. Minimal/monochrome, hero + FAB.
  brand: ['#475569', '#334155', '#1E293B'] as const,
  brandDeep: ['#334155', '#1E293B', '#0F172A'] as const,
  success: ['#10B981', '#34D399'] as const,
  danger: ['#EF4444', '#F87171'] as const,
  // Subtle light wash for soft cards.
  wash: ['#F1F5F9', '#E2E8F0'] as const,
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
  Shopping: { emoji: '🛍️', color: '#14B8A6' },
  Entertainment: { emoji: '🎬', color: '#F97316' },
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
