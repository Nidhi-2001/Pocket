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
          light: '#EEF2FF',
        },
        accent: {
          DEFAULT: '#8B5CF6',
          light: '#F3EEFF',
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
        background: '#F5F6FB',
        surface: '#FFFFFF',
        'surface-soft': '#F1F2F9',
        text: {
          primary: '#0F172A',
          secondary: '#64748B',
          muted: '#94A3B8',
        },
        border: '#ECEDF3',
      },
      borderRadius: {
        '4xl': '28px',
      },
    },
  },
  plugins: [],
};
