import type { ReactNode } from 'react';
import { type ViewProps } from 'react-native';
import { shadows } from '../../constants/theme';
import { GlassView } from './GlassView';

interface CardProps extends ViewProps {
  children: ReactNode;
  className?: string;
  /** Drop the soft shadow (e.g. for nested/flat surfaces). */
  flat?: boolean;
}

/** Standard frosted-glass surface used across screens. Extend with className. */
export function Card({ children, className = '', flat = false, style, ...rest }: CardProps) {
  return (
    <GlassView
      className={`rounded-3xl p-5 ${className}`}
      style={[flat ? undefined : shadows.sm, style]}
      {...rest}
    >
      {children}
    </GlassView>
  );
}
