/**
 * Theme mirrors the WorshipBuddy design system (design.worshipbuddy.org).
 * CaptionBuddy's product colour is Violet — it is the only product colour this
 * app is allowed to use as an accent.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: ['./src/renderer/**/*.{tsx,ts,html}', './public/**/*.html'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Satoshi', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        serif: ['Instrument Serif', 'Georgia', 'serif'],
      },
      colors: {
        // Global neutrals
        bg: '#FAFAF9',
        surface: '#F4F4F0',
        border: '#E4E4E7',
        ink: '#18181B',
        muted: '#71717A',
        dark: {
          DEFAULT: '#0F172A',
          mid: '#162032',
        },
        // CaptionBuddy — Violet
        capb: {
          DEFAULT: '#5B3FB0',
          light: '#E5DEF7',
          dark: '#3F2B82',
        },
        // Semantic states
        info: '#3B82F6',
        success: '#22C55E',
        warning: '#F59E0B',
        error: '#EF4444',
        /**
         * Operator UI surface tokens. These resolve through CSS custom
         * properties so the control panel can swap between the light and dark
         * themes with a single `data-ui-theme` attribute — see global.css.
         * Note that `/opacity` modifiers do not work on var()-backed colours;
         * use a token that already carries the right alpha.
         */
        ui: {
          bg: 'var(--ui-bg)',
          surface: 'var(--ui-surface)',
          card: 'var(--ui-card)',
          border: 'var(--ui-border)',
          'border-strong': 'var(--ui-border-strong)',
          text: 'var(--ui-text)',
          muted: 'var(--ui-muted)',
          faint: 'var(--ui-faint)',
          accent: 'var(--ui-accent)',
          hover: 'var(--ui-hover)',
          live: 'var(--ui-live)',
        },
      },
      borderRadius: {
        sm: '4px',
        md: '8px',
        lg: '12px',
        xl: '16px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)',
        hover: '0 4px 20px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)',
      },
      spacing: {
        // 8px base unit, named to match the system's spacing scale
        '2xs': '4px',
        xs: '8px',
        sm: '16px',
        md: '24px',
        lg: '32px',
        xl: '48px',
        '2xl': '64px',
        '3xl': '96px',
      },
      fontSize: {
        hero: ['80px', { lineHeight: '1.04', fontWeight: '400' }],
        display: ['52px', { lineHeight: '1.1', fontWeight: '400' }],
        title: ['36px', { lineHeight: '1.1', fontWeight: '400' }],
        heading: ['24px', { lineHeight: '1.3', fontWeight: '600' }],
        'body-lg': ['18px', { lineHeight: '1.65' }],
        body: ['16px', { lineHeight: '1.6' }],
        'body-sm': ['14px', { lineHeight: '1.6' }],
        'mono-md': ['13px', { lineHeight: '1.4', fontWeight: '500' }],
        'mono-sm': ['11px', { lineHeight: '1.4', fontWeight: '500' }],
      },
      transitionTimingFunction: {
        enter: 'cubic-bezier(0.21, 0.47, 0.32, 0.98)',
      },
    },
  },
  plugins: [],
};
