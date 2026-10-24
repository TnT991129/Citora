import { useEffect, useRef, useState } from 'react'

/**
 * Icono de ayuda (?). Al tocarlo muestra una explicación corta. Funciona con toque (no solo con
 * el ratón), para que sirva igual en el móvil. align: de qué lado se abre la burbuja.
 */
export function HelpTip({ text, align = 'left' }: { text: string; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [open])

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        aria-label="Más información"
        aria-expanded={open}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[11px] font-bold text-slate-600 hover:bg-slate-300"
      >
        ?
      </button>
      {open && (
        <span
          className={`absolute top-full z-20 mt-1.5 w-64 max-w-[80vw] rounded-xl bg-slate-900 px-3 py-2 text-xs leading-relaxed text-white shadow-lg ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {text}
        </span>
      )}
    </span>
  )
}
