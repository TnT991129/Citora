// GitHub Pages no sabe que /barberia-leo es una página de la app.
// Copiamos index.html como 404.html para que cualquier enlace abra la app.
// La versión internacional (/int/) tiene además su propia portada de verdad (int/index.html), para que
// sus enlaces para compartir (/int/?c=...) respondan bien y no con "404" (ver src/lib/market.ts).
import { copyFileSync, mkdirSync } from 'node:fs'
copyFileSync('dist/index.html', 'dist/404.html')
mkdirSync('dist/int', { recursive: true })
copyFileSync('dist/index.html', 'dist/int/index.html')
console.log('404.html e int/index.html creados')
