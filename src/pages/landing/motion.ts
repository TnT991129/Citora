// Animaciones de la portada sin librerías: solo IntersectionObserver, scroll con requestAnimationFrame
// y variables CSS. Nada se anima si el móvil tiene activado "reducir movimiento".
import { useEffect, useRef, useState, type PointerEvent } from 'react'

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/**
 * Hace aparecer los elementos [data-reveal] de dentro del contenedor cuando entran en pantalla
 * (les pone data-shown; la animación está en landing.css). Cada uno aparece una sola vez.
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const els = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'))
    if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
      els.forEach((e) => (e.dataset.shown = ''))
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          ;(e.target as HTMLElement).dataset.shown = ''
          io.unobserve(e.target)
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    )
    els.forEach((e) => io.observe(e))
    return () => io.disconnect()
  }, [])
  return ref
}

/**
 * Pone en cada [data-progress] de dentro del contenedor la variable CSS --p (de 0 a 1):
 * - "through" (por defecto): 0 cuando el elemento asoma por abajo, 1 cuando sale por arriba.
 * - "exit": 0 con el elemento arriba del todo, 1 cuando ya se ha ido (para la portada).
 * Se escribe directo en el estilo, sin volver a pintar React en cada movimiento.
 */
export function useScrollProgress<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  useEffect(() => {
    const root = ref.current
    if (!root || prefersReducedMotion()) return
    const els = Array.from(root.querySelectorAll<HTMLElement>('[data-progress]'))
    let frame = 0
    const update = () => {
      frame = 0
      const vh = window.innerHeight
      for (const el of els) {
        const r = el.getBoundingClientRect()
        if (r.bottom < -vh || r.top > vh * 2) continue
        const p = el.dataset.progress === 'exit' ? -r.top / Math.max(1, r.height) : (vh - r.top) / (vh + r.height)
        el.style.setProperty('--p', Math.min(1, Math.max(0, p)).toFixed(4))
      }
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])
  return ref
}

/** ¿Está el elemento a la vista? (para pausar animaciones en bucle que no se ven) */
export function useInView<T extends HTMLElement>(margin = '0px') {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || !('IntersectionObserver' in window)) {
      setInView(true)
      return
    }
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin: margin })
    io.observe(el)
    return () => io.disconnect()
  }, [margin])
  return { ref, inView }
}

/** Número que sube hasta su valor en ~0,7 s cuando cambia (calculadora, precio) */
export function useCountUp(value: number, active = true): number {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    if (!active || prefersReducedMotion()) {
      from.current = value
      setShown(value)
      return
    }
    const start = performance.now()
    const a = from.current
    let frame = 0
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 700)
      const eased = 1 - Math.pow(1 - k, 3)
      setShown(Math.round(a + (value - a) * eased))
      if (k < 1) frame = requestAnimationFrame(tick)
      else from.current = value
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, active])
  return shown
}

/** Al pasar el ratón, mueve un brillo que sigue al cursor (variables --mx/--my). Solo con ratón. */
export function spotlight(e: PointerEvent<HTMLElement>): void {
  if (e.pointerType !== 'mouse') return
  const el = e.currentTarget
  const r = el.getBoundingClientRect()
  el.style.setProperty('--mx', `${e.clientX - r.left}px`)
  el.style.setProperty('--my', `${e.clientY - r.top}px`)
}
