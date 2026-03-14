/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  // Scope all Tailwind utilities under .tw so they don't conflict with existing CSS
  // Using important to ensure Tailwind wins when applied
  important: '.tw',
  theme: {
    extend: {
      colors: {
        border: 'var(--glass-border)',
        input: 'var(--glass-border)',
        ring: 'var(--accent-primary)',
        background: 'var(--bg-primary)',
        foreground: 'var(--text-primary)',
        primary: {
          DEFAULT: 'var(--accent-primary)',
          foreground: 'var(--text-inverse)',
        },
        secondary: {
          DEFAULT: 'var(--bg-tertiary)',
          foreground: 'var(--text-primary)',
        },
        destructive: {
          DEFAULT: 'var(--accent-danger)',
          foreground: '#ffffff',
        },
        muted: {
          DEFAULT: 'var(--bg-tertiary)',
          foreground: 'var(--text-secondary)',
        },
        accent: {
          DEFAULT: 'var(--glass-bg-hover)',
          foreground: 'var(--text-primary)',
        },
        popover: {
          DEFAULT: 'var(--bg-secondary)',
          foreground: 'var(--text-primary)',
        },
        card: {
          DEFAULT: 'var(--bg-secondary)',
          foreground: 'var(--text-primary)',
        },
        success: {
          DEFAULT: 'var(--accent-success)',
          foreground: '#ffffff',
        },
        warning: {
          DEFAULT: 'var(--accent-warning)',
          foreground: '#ffffff',
        },
        danger: {
          DEFAULT: 'var(--accent-danger)',
          foreground: '#ffffff',
        },
      },
      borderRadius: {
        lg: 'var(--radius-md)',
        md: 'var(--radius-sm)',
        sm: '6px',
      },
      fontFamily: {
        sans: ['"Inter"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  corePlugins: {
    preflight: false, // Don't reset existing styles
  },
  plugins: [
    require('tailwindcss/plugin')(function ({ addUtilities }) {
      addUtilities({
        '.animate-in': {
          animationDuration: '150ms',
          animationTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
          animationFillMode: 'both',
        },
        '.animate-out': {
          animationDuration: '150ms',
          animationTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
          animationFillMode: 'both',
        },
        '.fade-in-0': { animationName: 'fadeIn', '--tw-enter-opacity': '0' },
        '.fade-out-0': { animationName: 'fadeOut', '--tw-exit-opacity': '0' },
        '.zoom-in-95': { animationName: 'zoomIn', '--tw-enter-scale': '0.95' },
        '.zoom-out-95': { animationName: 'zoomOut', '--tw-exit-scale': '0.95' },
        '.slide-in-from-top-2': { animationName: 'slideInFromTop', '--tw-enter-translate-y': '-0.5rem' },
        '.slide-in-from-bottom-2': { animationName: 'slideInFromBottom', '--tw-enter-translate-y': '0.5rem' },
        '.slide-in-from-left-2': { animationName: 'slideInFromLeft', '--tw-enter-translate-x': '-0.5rem' },
        '.slide-in-from-right-2': { animationName: 'slideInFromRight', '--tw-enter-translate-x': '0.5rem' },
      });
    }),
  ],
};
