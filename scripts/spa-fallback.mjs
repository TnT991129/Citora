// GitHub Pages no sabe que /barberia-leo es una página de la app.
// Copiamos index.html como 404.html para que cualquier enlace abra la app.
import { copyFileSync } from 'node:fs'
copyFileSync('dist/index.html', 'dist/404.html')
console.log('404.html creado')
