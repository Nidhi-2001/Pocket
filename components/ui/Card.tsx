import type { ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';

interface CardProps extends ViewProps {
  children: ReactNode;
  className?: string;
}

/** Standard rounded surface used across screens. Extend with className. */
export function Card({ children, className = '', ...rest }: CardProps) {
  return (
    <View
      className={`bg-surface border border-border rounded-2xl p-4 ${className}`}
      {...rest}
    >
      {children}
    </View>
  );
}
