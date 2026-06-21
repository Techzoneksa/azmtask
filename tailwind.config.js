/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'azm-green': '#1a5f3c',
        'azm-green-light': '#2a7a50',
        'azm-green-dark': '#0d4a2d',
        'azm-orange': '#d97706',
        'azm-orange-light': '#f59e0b',
        'azm-gray': '#f3f4f6',
        'azm-gray-dark': '#6b7280',
        'dark-bg': '#0F172A',
        'dark-sidebar': '#111827',
        'dark-card': '#1E293B',
        'dark-card-secondary': '#162033',
        'dark-modal': '#111827',
        'dark-input': '#111827',
        'dark-text': '#F8FAFC',
        'dark-text-secondary': '#CBD5E1',
        'dark-text-muted': '#94A3B8',
        'dark-text-disabled': '#64748B',
        'dark-border': 'rgba(255,255,255,0.12)',
        'dark-border-card': 'rgba(255,255,255,0.10)',
        'dark-border-input': 'rgba(255,255,255,0.14)',
        'dark-border-active': 'rgba(16,185,129,0.35)',
      },
      fontFamily: {
        'tahoma': ['Tahoma', 'Arial', 'sans-serif'],
      },
      animation: {
        'slide-up': 'slideUp 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}