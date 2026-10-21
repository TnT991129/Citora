import { useTheme } from '../lib/theme'

/** Botón para pasar de modo claro a oscuro y al revés. "onImage": sobre la portada de color. */
export function ThemeToggle({ onImage, className = '' }: { onImage?: boolean; className?: string }) {
  const [theme, toggle] = useTheme()
  const dark = theme === 'dark'
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      title={dark ? 'Modo claro' : 'Modo oscuro'}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition ${
        onImage ? 'bg-white/15 text-white hover:bg-white/25' : 'text-slate-600 hover:bg-slate-100'
      } ${className}`}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {dark ? (
          <path d="M12 3v2M12 19v2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M3 12h2M19 12h2M5.6 18.4L7 17M17 7l1.4-1.4M12 16a4 4 0 100-8 4 4 0 000 8z" />
        ) : (
          <path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" />
        )}
      </svg>
    </button>
  )
}
