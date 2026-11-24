// Botón de idioma (ES / EN). Solo en la versión internacional: la de Cuba va siempre en español.
import { IS_INT } from '../lib/market'
import { LANG, setLang } from '../lib/i18n'

export function LangSwitch({ onImage, className = '' }: { onImage?: boolean; className?: string }) {
  if (!IS_INT) return null
  const next = LANG === 'es' ? 'en' : 'es'
  return (
    <button
      type="button"
      onClick={() => setLang(next)}
      aria-label={next === 'en' ? 'Switch to English' : 'Cambiar a español'}
      title={next === 'en' ? 'English' : 'Español'}
      className={`flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-xs font-extrabold tracking-wide transition ${
        onImage ? 'bg-white/15 text-white backdrop-blur hover:bg-white/25' : 'text-slate-600 hover:bg-slate-100'
      } ${className}`}
    >
      {next.toUpperCase()}
    </button>
  )
}
