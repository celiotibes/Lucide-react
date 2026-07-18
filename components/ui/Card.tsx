'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { shadows, spacing } from '@/lib/design-system/spacing';
import { colors } from '@/lib/design-system/colors';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'outlined' | 'filled';
  interactive?: boolean;
  pressure?: boolean;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'default', interactive = false, pressure = false, ...props }, ref) => {
    const variantStyles = {
      default: `bg-white ${shadows.base} border border-${colors.neutral[200]}`,
      elevated: `bg-white ${shadows.lg}`,
      outlined: `bg-transparent border border-${colors.neutral[300]}`,
      filled: `bg-${colors.neutral[50]}`,
    };

    return (
      <div
        ref={ref}
        className={cn(
          'rounded-lg p-4 transition-all duration-200',
          variantStyles[variant],
          interactive && 'cursor-pointer hover:shadow-md',
          pressure && 'active:shadow-sm active:scale-98',
          className
        )}
        {...props}
      />
    );
  }
);

Card.displayName = 'Card';

export default Card;

// Card subcomponents
export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('mb-3 pb-3 border-b border-neutral-200', className)} {...props} />
  )
);
CardHeader.displayName = 'CardHeader';

export const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2 ref={ref} className={cn('text-lg font-semibold text-neutral-900', className)} {...props} />
));
CardTitle.displayName = 'CardTitle';

export const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-sm text-neutral-600', className)} {...props} />
));
CardDescription.displayName = 'CardDescription';

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('text-sm text-neutral-700', className)} {...props} />
  )
);
CardContent.displayName = 'CardContent';

export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('mt-4 pt-4 border-t border-neutral-200 flex gap-2', className)} {...props} />
  )
);
CardFooter.displayName = 'CardFooter';
