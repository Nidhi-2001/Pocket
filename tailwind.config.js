/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#6366F1',
          dark: '#4F46E5',
          deep: '#4338CA',
          light: 'rgb(var(--primary-light) / <alpha-value>)',
        },
        accent: {
          DEFAULT: '#8B5CF6',
          light: 'rgb(var(--accent-light) / <alpha-value>)',
        },
        success: {
          DEFAULT: '#10B981',
          dark: '#059669',
        },
        danger: {
          DEFAULT: '#F43F5E',
          dark: '#E11D48',
        },
        warning: '#F59E0B',
        background: 'rgb(var(--background) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-soft': 'rgb(var(--surface-soft) / <alpha-value>)',
        text: {
          primary: 'rgb(var(--text-primary) / <alpha-value>)',
          secondary: 'rgb(var(--text-secondary) / <alpha-value>)',
          muted: 'rgb(var(--text-muted) / <alpha-value>)',
        },
        border: 'rgb(var(--border) / <alpha-value>)',
      },
      borderRadius: {
        '4xl': '28px',
      },
    },
  },
  plugins: [],
};
