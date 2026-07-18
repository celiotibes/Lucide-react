/**
 * Design System Index
 * Centralized export of all design system utilities
 */

export * from './colors';
export * from './typography';
export * from './spacing';

import { colors } from './colors';
import { typography } from './typography';
import { spacing, sizes, borderRadius, shadows, zIndex, breakpoints } from './spacing';

/**
 * Complete design system configuration
 */
export const designSystem = {
  colors,
  typography,
  spacing,
  sizes,
  borderRadius,
  shadows,
  zIndex,
  breakpoints,
};

/**
 * Get design token by path
 * Example: getToken('colors.primary.500')
 */
export function getToken(path: string): any {
  return path.split('.').reduce((obj: any, key) => obj?.[key], designSystem);
}

/**
 * Theme provider configuration for Tailwind
 */
export const tailwindConfig = {
  theme: {
    extend: {
      colors: {
        primary: colors.primary,
        success: colors.success,
        warning: colors.warning,
        error: colors.error,
        info: colors.info,
        neutral: colors.neutral,
      },
      spacing: spacing,
      fontSize: typography.sizes,
      fontWeight: typography.weights,
      lineHeight: typography.lineHeights,
      letterSpacing: typography.letterSpacing,
      borderRadius: borderRadius,
      boxShadow: shadows,
      zIndex: zIndex,
      breakpoints: breakpoints,
    },
  },
};

export default designSystem;
