import type { ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';
import { shadows } from '../../constants/theme';

interface CardProps extends ViewProps {
  children: ReactNode;
  className?: string;
  /** Drop the soft shadow (e.g. for nested/flat surfaces). */
  flat?: boolean;
}

/** Standard elevated surface used across screens. Extend with className. */
export function Card({ children, className = '', flat = false, style, ...rest }: CardProps) {
  return (
    <View
      className={`bg-surface rounded-3xl p-5 ${className}`}
      style={[flat ? undefined : shadows.sm, style]}
      {...rest}
    >
      {children}
    </View>
  );
}
