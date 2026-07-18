/**
 * Design System - Typography
 * Font scales, sizes, weights, and line heights
 */

export const typography = {
  // Font Families
  families: {
    primary: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    mono: '"SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace',
    system: 'system-ui, -apple-system, sans-serif',
  },

  // Font Sizes
  sizes: {
    xs: '0.75rem', // 12px
    sm: '0.875rem', // 14px
    base: '1rem', // 16px
    lg: '1.125rem', // 18px
    xl: '1.25rem', // 20px
    '2xl': '1.5rem', // 24px
    '3xl': '1.875rem', // 30px
    '4xl': '2.25rem', // 36px
    '5xl': '3rem', // 48px
  },

  // Font Weights
  weights: {
    thin: 100,
    extralight: 200,
    light: 300,
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
    black: 900,
  },

  // Line Heights
  lineHeights: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.625,
    loose: 2,
    xs: 1.1,
    sm: 1.25,
    base: 1.5,
    lg: 1.75,
    xl: 1.875,
  },

  // Letter Spacing
  letterSpacing: {
    tighter: '-0.02em',
    tight: '-0.01em',
    normal: '0em',
    wide: '0.025em',
    wider: '0.05em',
    widest: '0.1em',
  },

  // Text Styles - Headings
  heading1: {
    fontSize: '3rem', // 48px
    fontWeight: 700,
    lineHeight: 1.2,
    letterSpacing: '-0.02em',
  },

  heading2: {
    fontSize: '2.25rem', // 36px
    fontWeight: 700,
    lineHeight: 1.2,
    letterSpacing: '-0.01em',
  },

  heading3: {
    fontSize: '1.875rem', // 30px
    fontWeight: 600,
    lineHeight: 1.2,
  },

  heading4: {
    fontSize: '1.5rem', // 24px
    fontWeight: 600,
    lineHeight: 1.25,
  },

  heading5: {
    fontSize: '1.25rem', // 20px
    fontWeight: 600,
    lineHeight: 1.25,
  },

  heading6: {
    fontSize: '1rem', // 16px
    fontWeight: 600,
    lineHeight: 1.5,
  },

  // Text Styles - Body
  body: {
    large: {
      fontSize: '1.125rem', // 18px
      fontWeight: 400,
      lineHeight: 1.625,
    },
    base: {
      fontSize: '1rem', // 16px
      fontWeight: 400,
      lineHeight: 1.5,
    },
    small: {
      fontSize: '0.875rem', // 14px
      fontWeight: 400,
      lineHeight: 1.5,
    },
    xs: {
      fontSize: '0.75rem', // 12px
      fontWeight: 400,
      lineHeight: 1.4,
    },
  },

  // Text Styles - Labels & Captions
  label: {
    large: {
      fontSize: '0.875rem', // 14px
      fontWeight: 500,
      lineHeight: 1.25,
      letterSpacing: '0.025em',
    },
    base: {
      fontSize: '0.875rem', // 14px
      fontWeight: 500,
      lineHeight: 1.25,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.05em',
    },
    small: {
      fontSize: '0.75rem', // 12px
      fontWeight: 600,
      lineHeight: 1.25,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.05em',
    },
  },

  // Text Styles - Special
  code: {
    fontSize: '0.875rem',
    fontFamily: '"SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace',
    fontWeight: 400,
    lineHeight: 1.6,
  },

  caption: {
    fontSize: '0.75rem', // 12px
    fontWeight: 400,
    lineHeight: 1.4,
    color: '#999',
  },

  subtitle: {
    fontSize: '0.875rem', // 14px
    fontWeight: 500,
    lineHeight: 1.5,
    color: '#666',
  },
};

/**
 * Utility function to create font styles
 */
export function createFontStyle(
  size: keyof typeof typography.sizes,
  weight: keyof typeof typography.weights = 'normal',
  lineHeight?: number | string
) {
  return {
    fontSize: typography.sizes[size],
    fontWeight: typography.weights[weight],
    lineHeight: lineHeight || typography.lineHeights.normal,
    fontFamily: typography.families.primary,
  };
}

/**
 * Truncate text to specified number of lines
 */
export function textTruncate(lines: number = 1) {
  return {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: '-webkit-box',
    WebkitLineClamp: lines,
    WebkitBoxOrient: 'vertical' as const,
  };
}
