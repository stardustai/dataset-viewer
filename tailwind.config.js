/** @type {import('tailwindcss').Config} */
import typography from '@tailwindcss/typography';

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['Fira Code', 'Monaco', 'monospace'],
      },
      colors: {
        primary: {
          50: '#f0f9ff',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
        // Enable CSS variables for gray colors in pure black theme
        gray: {
          600: 'rgb(var(--gray-600, 75 85 99) / <alpha-value>)',
          700: 'rgb(var(--gray-700, 55 65 81) / <alpha-value>)',
          800: 'rgb(var(--gray-800, 31 41 55) / <alpha-value>)',
          900: 'rgb(var(--gray-900, 17 24 39) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [
    typography,
  ],
}
