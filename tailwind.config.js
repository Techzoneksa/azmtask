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