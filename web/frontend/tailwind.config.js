/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0a0a0a',
        foreground: '#fafafa',
        card: '#1a1a1a',
        'card-foreground': '#fafafa',
        primary: '#22c55e',
        'primary-foreground': '#052e16',
        secondary: '#a855f7',
        'secondary-foreground': '#faf5ff',
        muted: '#262626',
        'muted-foreground': '#a3a3a3',
        accent: '#a855f7',
        'accent-foreground': '#faf5ff',
        destructive: '#dc2626',
        'destructive-foreground': '#fef2f2',
        border: '#262626',
        input: '#262626',
        ring: '#22c55e',
      },
    },
  },
  plugins: [],
}

