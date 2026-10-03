import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// VITE_BASE: "/" con dominio propio, "/citora/" en GitHub Pages (usuario.github.io/citora/)
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  build: { target: 'es2019', sourcemap: false },
})
