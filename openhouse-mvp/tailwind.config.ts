import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)'],
        mono: ['var(--font-mono)'],
        heading: ['var(--font-inter)'],
      },
      colors: {
        // ShadCN base colors (using CSS custom properties directly)
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        popover: {
          DEFAULT: 'var(--popover)',
          foreground: 'var(--popover-foreground)',
        },
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--destructive-foreground)',
        },
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        chart: {
          '1': 'var(--chart-1)',
          '2': 'var(--chart-2)',
          '3': 'var(--chart-3)',
          '4': 'var(--chart-4)',
          '5': 'var(--chart-5)',
        },
        
        // OpenHouse custom tokens
        'openhouse-bg': 'var(--openhouse-bg)',
        'openhouse-fg': 'var(--openhouse-fg)',
        'openhouse-bg-muted': 'var(--openhouse-bg-muted)',
        'openhouse-bg-secondary': 'var(--openhouse-bg-muted)', // fix: add secondary bg for hover states (Cursor Rule 13)
        'openhouse-fg-muted': 'var(--openhouse-fg-muted)',
        'openhouse-primary': 'var(--openhouse-primary)', // fix: add missing primary color (Cursor Rule 13)
        'openhouse-accent': 'var(--openhouse-accent)',
        'openhouse-accent-fg': 'var(--openhouse-accent-fg)',
        'openhouse-border': 'var(--openhouse-border)',
        'openhouse-success': 'var(--openhouse-success)',
        'openhouse-warning': 'var(--openhouse-warning)',
        'openhouse-danger': 'var(--openhouse-danger)',
        'openhouse-white': 'var(--openhouse-white)', // fix: add missing white color (Cursor Rule 13)
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        xl: 'calc(var(--radius) + 4px)',
        '2xl': 'calc(var(--radius) + 8px)',
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
  plugins: [],
}

export default config 