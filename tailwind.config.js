import forms from '@tailwindcss/forms';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './pages/**/*.{ts,tsx}',
    './features/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#4f46e5', dark: '#4338ca', light: '#818cf8' },
        'background-light': '#f8fafc',
        'background-dark': '#020617',
        'surface-dark': '#0f172a',
        'surface-light': '#ffffff',
        'border-dark': '#1e293b',
        'border-light': '#e2e8f0',
        success: '#10b981',
        warning: '#f59e0b',
        error: '#ef4444',
      },
      fontFamily: {
        display: ['Outfit', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
      boxShadow: {
        premium: '0 20px 25px -5px rgb(15 23 42 / 0.10), 0 10px 10px -5px rgb(15 23 42 / 0.04)',
      },
      animation: {
        'fade-in': 'fadeIn 0.35s ease-out',
        blob: 'blob 7s infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        blob: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(30px, -50px) scale(1.1)' },
          '66%': { transform: 'translate(-20px, 20px) scale(0.9)' },
        },
      },
    },
  },
  plugins: [forms],
};
