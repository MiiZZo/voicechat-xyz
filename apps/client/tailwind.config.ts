import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

export default {
  content: ['./index.html', './src/renderer/**/*.{ts,tsx}'],
  darkMode: ['class'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Geist"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Instrument Serif"', 'ui-serif', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        // Surfaces (zinc base, slightly warm)
        bg: { DEFAULT: 'hsl(240 10% 4%)', elevated: 'hsl(240 6% 10%)', muted: 'hsl(240 4% 14%)' },
        fg: { DEFAULT: 'hsl(0 0% 98%)', muted: 'hsl(240 5% 65%)', subtle: 'hsl(240 4% 46%)' },
        // Warm single accent — amber, like a desk lamp
        accent: {
          DEFAULT: 'hsl(43 96% 56%)',
          soft: 'hsl(43 96% 56% / 0.15)',
          fg: 'hsl(20 14% 4%)',
        },
        border: 'hsl(240 4% 16%)',
        input: 'hsl(240 4% 16%)',
        ring: 'hsl(43 96% 56%)',
        background: 'hsl(240 10% 4%)',
        foreground: 'hsl(0 0% 98%)',
        primary: { DEFAULT: 'hsl(0 0% 98%)', foreground: 'hsl(240 10% 4%)' },
        secondary: { DEFAULT: 'hsl(240 4% 16%)', foreground: 'hsl(0 0% 98%)' },
        muted: { DEFAULT: 'hsl(240 4% 16%)', foreground: 'hsl(240 5% 65%)' },
        destructive: { DEFAULT: 'hsl(346 77% 49%)', foreground: 'hsl(0 0% 98%)' },
        popover: { DEFAULT: 'hsl(240 6% 10%)', foreground: 'hsl(0 0% 98%)' },
        card: { DEFAULT: 'hsl(240 6% 10%)', foreground: 'hsl(0 0% 98%)' },
      },
      borderRadius: { lg: '0.625rem', md: '0.4rem', sm: '0.25rem' },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'speaking-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 0 hsl(43 96% 56% / 0.55)' },
          '50%': { boxShadow: '0 0 0 6px hsl(43 96% 56% / 0)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'speaking-pulse': 'speaking-pulse 1.6s ease-out infinite',
      },
    },
  },
  plugins: [animate],
} satisfies Config;
