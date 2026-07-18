/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'slate': {
          '900': '#0f1419',
          '800': '#1a1f26',
          '700': '#2d3139',
        },
        'purple': {
          '600': '#a78bfa',
          '700': '#9370d4',
        },
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideInUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        glow: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(167, 139, 250, 0.5)' },
          '50%': { boxShadow: '0 0 40px rgba(167, 139, 250, 0.8)' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 0.6s ease',
        slideInUp: 'slideInUp 0.5s ease',
        glow: 'glow 2s infinite',
      },
    },
  },
  plugins: [],
}
