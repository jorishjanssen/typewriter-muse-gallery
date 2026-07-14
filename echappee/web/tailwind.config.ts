import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        // Warm paper light theme / deep slate dark theme, punchy breakaway accent.
        paper: '#faf7f2',
        ink: '#1c1a17',
        night: '#16181d',
        snow: '#e8e6e3',
        accent: {
          DEFAULT: '#e04f1f',
          soft: '#e04f1f22',
        },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        serif: ['Charter', 'Georgia', 'Cambria', 'Times New Roman', 'serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
