import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/renderer/**/*.{ts,tsx}'],
  darkMode: ['class'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(240 4% 16%)',
        input: 'hsl(240 4% 16%)',
        ring: 'hsl(240 5% 65%)',
        background: 'hsl(240 10% 4%)',
        foreground: 'hsl(0 0% 98%)',
        primary: { DEFAULT: 'hsl(263 70% 50%)', foreground: 'hsl(0 0% 98%)' },
        secondary: { DEFAULT: 'hsl(240 4% 16%)', foreground: 'hsl(0 0% 98%)' },
        muted: { DEFAULT: 'hsl(240 4% 16%)', foreground: 'hsl(240 5% 65%)' },
        destructive: { DEFAULT: 'hsl(0 63% 45%)', foreground: 'hsl(0 0% 98%)' },
      },
      borderRadius: { lg: '0.5rem', md: '0.375rem', sm: '0.25rem' },
    },
  },
} satisfies Config;
