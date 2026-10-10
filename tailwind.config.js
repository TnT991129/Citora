/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Color de marca de cada negocio (se cambia en tiempo real con la variable --brand-rgb)
        brand: 'rgb(var(--brand-rgb) / <alpha-value>)',
        // Color de Citora
        citora: {
          50: '#eef0ff', 100: '#e0e3ff', 200: '#c6cbff', 300: '#a3a8fd', 400: '#7f7ff9',
          500: '#6461f1', 600: '#5243e5', 700: '#4636ca', 800: '#3a2ea3', 900: '#332c81',
        },
      },
      fontFamily: {
        sans: ['var(--app-font)'],
      },
    },
  },
  plugins: [],
}
