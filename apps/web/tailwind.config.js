/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        surface: {
          50: '#f8f9fa',
          100: '#f1f3f5',
          200: '#e9ecef',
          700: '#495057',
          800: '#343a40',
          900: '#212529',
        },
        axis: {
          aggression:  '#ef4444',
          complexity:  '#8b5cf6',
          atmosphere:  '#06b6d4',
          emotion:     '#ec4899',
          psychedelic: '#10b981',
          concept:     '#f59e0b',
        },
      },
    },
  },
  plugins: [],
};
