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
          50:  '#f8f9fa',
          100: '#f1f3f5',
          200: '#e9ecef',
          300: '#dee2e6',
          400: '#ced4da',
          500: '#adb5bd',
          600: '#868e96',
          700: '#495057',
          800: '#343a40',
          850: '#2b3035',
          900: '#212529',
        },
        axis: {
          aggression:  '#E5484D',
          complexity:  '#8B5CF6',
          atmosphere:  '#06B6D4',
          emotion:     '#F59E0B',
          psychedelic: '#22C55E',
          concept:     '#F97316',
        },
        genre: {
          metal:      '#64748B',
          rock:       '#FB923C',
          pop:        '#F472B6',
          hiphop:     '#818CF8',
          electronic: '#22D3EE',
          folk:       '#A3E635',
        },
      },
    },
  },
  plugins: [],
};
