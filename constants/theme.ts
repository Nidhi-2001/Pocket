export const colors = {
  primary: '#4F46E5',
  primaryLight: '#EEF2FF',
  success: '#10B981',
  danger: '#F43F5E',
  background: '#F9FAFB',
  surface: '#FFFFFF',
  textPrimary: '#111827',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  border: '#E5E7EB',
} as const;

export const categories = {
  Food: { emoji: '🍕', color: '#F59E0B' },
  Transport: { emoji: '🚗', color: '#3B82F6' },
  Shopping: { emoji: '🛍️', color: '#8B5CF6' },
  Entertainment: { emoji: '🎬', color: '#EC4899' },
  Other: { emoji: '💸', color: '#6B7280' },
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
  full: 999,
} as const;

export type CategoryKey = keyof typeof categories;
