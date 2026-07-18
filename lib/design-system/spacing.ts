/**
 * Design System - Spacing & Sizing
 * Consistent spacing scale and sizing utilities
 */

export const spacing = {
  // Spacing Scale (8px base unit)
  0: '0px',
  1: '0.25rem', // 4px
  2: '0.5rem', // 8px
  3: '0.75rem', // 12px
  4: '1rem', // 16px
  5: '1.25rem', // 20px
  6: '1.5rem', // 24px
  7: '1.75rem', // 28px
  8: '2rem', // 32px
  9: '2.25rem', // 36px
  10: '2.5rem', // 40px
  12: '3rem', // 48px
  16: '4rem', // 64px
  20: '5rem', // 80px
  24: '6rem', // 96px
  28: '7rem', // 112px
  32: '8rem', // 128px
};

export const sizes = {
  // Common component sizes
  full: '100%',
  screen: '100vw',
  min: 'min-content',
  max: 'max-content',
  fit: 'fit-content',

  // Fixed sizes
  xs: '20rem', // 320px
  sm: '24rem', // 384px
  md: '28rem', // 448px
  lg: '32rem', // 512px
  xl: '36rem', // 576px
  '2xl': '42rem', // 672px
  '3xl': '48rem', // 768px
  '4xl': '56rem', // 896px
  '5xl': '64rem', // 1024px
  '6xl': '72rem', // 1152px
  '7xl': '80rem', // 1280px',

  // Container sizes
  container: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
  },

  // Icon sizes
  icon: {
    xs: '16px',
    sm: '20px',
    md: '24px',
    lg: '32px',
    xl: '40px',
    '2xl': '48px',
  },

  // Button sizes
  button: {
    xs: '24px',
    sm: '32px',
    md: '40px',
    lg: '48px',
    xl: '56px',
  },

  // Input sizes
  input: {
    xs: '24px',
    sm: '32px',
    md: '40px',
    lg: '48px',
  },
};

/**
 * Padding and margin utilities
 */
export const paddingScale = {
  xs: spacing[2], // 8px
  sm: spacing[3], // 12px
  md: spacing[4], // 16px
  lg: spacing[6], // 24px
  xl: spacing[8], // 32px
  '2xl': spacing[12], // 48px
};

/**
 * Gap scale for flexbox/grid
 */
export const gapScale = {
  xs: spacing[2], // 8px
  sm: spacing[3], // 12px
  md: spacing[4], // 16px
  lg: spacing[6], // 24px
  xl: spacing[8], // 32px
  '2xl': spacing[12], // 48px
};

/**
 * Border radius scale
 */
export const borderRadius = {
  none: '0px',
  xs: '0.125rem', // 2px
  sm: '0.25rem', // 4px
  base: '0.375rem', // 6px
  md: '0.5rem', // 8px
  lg: '0.75rem', // 12px
  xl: '1rem', // 16px
  '2xl': '1.5rem', // 24px
  '3xl': '2rem', // 32px
  full: '9999px',
};

/**
 * Shadow scale
 */
export const shadows = {
  none: 'none',
  xs: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  sm: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
  base: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  md: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
  lg: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
  xl: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.05)',
};

/**
 * Z-index scale
 */
export const zIndex = {
  hide: -1,
  base: 0,
  dropdown: 1000,
  sticky: 1020,
  fixed: 1030,
  modalBackdrop: 1040,
  modal: 1050,
  popover: 1060,
  tooltip: 1070,
  notification: 1080,
};

/**
 * Responsive breakpoints
 */
export const breakpoints = {
  xs: '0px',
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
};

/**
 * Create responsive value
 */
export function createResponsive<T>(mobile: T, tablet?: T, desktop?: T) {
  return {
    xs: mobile,
    sm: mobile,
    md: tablet || mobile,
    lg: desktop || tablet || mobile,
    xl: desktop || tablet || mobile,
    '2xl': desktop || tablet || mobile,
  };
}

/**
 * Utility to create consistent spacing groups
 */
export const spacingGroups = {
  // Compact spacing (small components)
  compact: {
    padding: paddingScale.xs,
    gap: gapScale.xs,
    borderRadius: borderRadius.sm,
  },

  // Normal spacing (standard components)
  normal: {
    padding: paddingScale.md,
    gap: gapScale.md,
    borderRadius: borderRadius.md,
  },

  // Comfortable spacing (large components/sections)
  comfortable: {
    padding: paddingScale.lg,
    gap: gapScale.lg,
    borderRadius: borderRadius.lg,
  },

  // Spacious spacing (full sections/containers)
  spacious: {
    padding: paddingScale.xl,
    gap: gapScale.xl,
    borderRadius: borderRadius.xl,
  },
};
