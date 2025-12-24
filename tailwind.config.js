/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './admin/**/*.{html,js}',
    './sidepanel/**/*.{html,js}',
    // Extension content scripts don't use Tailwind (injected into HubSpot)
  ],
  theme: {
    extend: {
      // Map RevGuide design tokens to Tailwind
      colors: {
        // Primary Brand Color (lime green)
        primary: {
          DEFAULT: '#b2ef63',
          dark: '#9ed655',
          light: '#c5f58a',
          subtle: 'rgba(178, 239, 99, 0.12)',
        },
        // Semantic Colors
        info: {
          DEFAULT: '#3b82f6',
          bg: '#eff6ff',
        },
        success: {
          DEFAULT: '#22c55e',
          bg: '#f0fdf4',
        },
        warning: {
          DEFAULT: '#f59e0b',
          bg: '#fffbeb',
        },
        danger: {
          DEFAULT: '#ef4444',
          bg: '#fef2f2',
        },
        // Background Colors
        bg: {
          DEFAULT: '#f7f8fa',
          elevated: '#ffffff',
          subtle: '#f3f4f6',
          muted: '#e5e7eb',
        },
        // Surface Colors
        surface: {
          DEFAULT: '#ffffff',
          hover: '#f9fafb',
          active: '#f3f4f6',
        },
        // Border Colors
        border: {
          DEFAULT: '#e1e3e8',
          subtle: '#f0f1f3',
          strong: '#d1d5db',
        },
        // Text Colors
        text: {
          primary: '#111827',
          secondary: '#374151',
          tertiary: '#6b7280',
          muted: '#9ca3af',
          disabled: '#d1d5db',
          inverse: '#ffffff',
        },
      },
      fontFamily: {
        sans: ['Manrope', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['SF Mono', 'Monaco', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        xs: ['0.6875rem', { lineHeight: '1.25' }],   // 11px
        sm: ['0.75rem', { lineHeight: '1.5' }],      // 12px
        base: ['0.875rem', { lineHeight: '1.5' }],  // 14px
        md: ['1rem', { lineHeight: '1.5' }],        // 16px
        lg: ['1.125rem', { lineHeight: '1.25' }],   // 18px
        xl: ['1.25rem', { lineHeight: '1.25' }],    // 20px
        '2xl': ['1.5rem', { lineHeight: '1.25' }],  // 24px
        '3xl': ['1.875rem', { lineHeight: '1.25' }],// 30px
      },
      spacing: {
        // RevGuide uses 4px base scale
        '0': '0',
        '1': '0.25rem',   // 4px
        '2': '0.5rem',    // 8px
        '3': '0.75rem',   // 12px
        '4': '1rem',      // 16px
        '5': '1.25rem',   // 20px
        '6': '1.5rem',    // 24px
        '8': '2rem',      // 32px
        '10': '2.5rem',   // 40px
        '12': '3rem',     // 48px
        '16': '4rem',     // 64px
      },
      borderRadius: {
        none: '0',
        sm: '0.25rem',   // 4px
        DEFAULT: '0.5rem', // 8px
        md: '0.5rem',    // 8px
        lg: '0.75rem',   // 12px
        xl: '1rem',      // 16px
        full: '9999px',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(0, 0, 0, 0.04)',
        DEFAULT: '0 2px 4px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.06)',
        md: '0 2px 4px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.06)',
        lg: '0 4px 8px rgba(0, 0, 0, 0.04), 0 2px 4px rgba(0, 0, 0, 0.06)',
        xl: '0 8px 16px rgba(0, 0, 0, 0.06), 0 4px 8px rgba(0, 0, 0, 0.04)',
        focus: '0 0 0 3px rgba(178, 239, 99, 0.25)',
      },
      transitionDuration: {
        fast: '150ms',
        DEFAULT: '200ms',
        slow: '300ms',
      },
      zIndex: {
        dropdown: '100',
        sticky: '200',
        'modal-backdrop': '900',
        modal: '1000',
        tooltip: '1100',
        notification: '1200',
      },
    },
  },
  plugins: [],
}
