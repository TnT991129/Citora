// Bloquear el scroll de la página mientras hay una ventana o un panel abierto.
// Con solo "overflow: hidden" en el body, el iPhone (sobre todo con la app instalada) a veces deja las
// barras fijas (el menú de abajo) a media pantalla al cerrar la ventana. Así no: la página se fija en
// su sitio y al cerrar vuelve exactamente al mismo scroll. Admite ventanas una encima de otra.

let locks = 0
let savedY = 0

export function lockScroll(): () => void {
  if (typeof document === 'undefined') return () => {}
  if (locks === 0) {
    savedY = window.scrollY
    const s = document.body.style
    s.position = 'fixed'
    s.top = `-${savedY}px`
    s.left = '0'
    s.right = '0'
    s.width = '100%'
    s.overflow = 'hidden'
  }
  locks++
  let released = false
  return () => {
    if (released) return
    released = true
    locks--
    if (locks > 0) return
    const s = document.body.style
    s.position = ''
    s.top = ''
    s.left = ''
    s.right = ''
    s.width = ''
    s.overflow = ''
    window.scrollTo(0, savedY)
  }
}
