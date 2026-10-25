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
          50: '#fff5f2', 100: '#ffe8e1', 200: '#ffd0c2', 300: '#ffab8f', 400: '#ff8360',
          500: '#fb6b47', 600: '#f0532e', 700: '#cc3e1f', 800: '#a3331b', 900: '#7f2c19',
        },
      },
      fontFamily: {
        sans: ['var(--app-font)'],
      },
    },
  },
  plugins: [],
}
