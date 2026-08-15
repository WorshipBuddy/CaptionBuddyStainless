/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{tsx,ts,html}', './public/**/*.html'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Satoshi', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        serif: ['Instrument Serif', 'serif'],
      },
    },
  },
  plugins: [],
};
