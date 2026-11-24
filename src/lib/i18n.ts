// Idioma de la app. La versión de Cuba va siempre en español. La internacional (/int/) en español o
// inglés: el del móvil la primera vez, y después el que elija la persona (LangSwitch).
//
// Cada texto se escribe en español y se pasa por t(): t('Reservar') → "Book" en inglés. Si a un texto
// le falta la traducción (EN en i18n.en.ts), sale en español: nunca queda un hueco.
// Con datos: t('Hola, {name}', { name }) → "Hi, Ana".
import { EN } from './i18n.en'
import { IS_INT } from './market'

export type Lang = 'es' | 'en'

const KEY = 'citora:lang'

function detect(): Lang {
  if (!IS_INT || typeof window === 'undefined') return 'es'
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'es' || saved === 'en') return saved
  } catch {
    /* sin almacenamiento: el del móvil */
  }
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language || 'es']
  return langs.some((l) => /^es\b/i.test(l)) && !/^en\b/i.test(langs[0]) ? 'es' : 'en'
}

/** Idioma de esta visita (cambiarlo recarga la página: ver setLang) */
export const LANG: Lang = detect()
export const IS_EN = LANG === 'en'

if (typeof document !== 'undefined') document.documentElement.lang = LANG

/** Cambia el idioma y recarga, para que toda la app (y PayPal, las fechas…) salga en el nuevo */
export function setLang(l: Lang): void {
  try {
    localStorage.setItem(KEY, l)
  } catch {
    /* sin almacenamiento: solo esta vez */
  }
  window.location.reload()
}

/** Texto en el idioma de la visita. vars: los {nombre} del texto */
export function t(es: string, vars?: Record<string, string | number | null | undefined>): string {
  let s = IS_EN ? EN[es] ?? es : es
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v ?? ''))
  return s
}

/** Singular o plural: tn(n, '{n} cita', '{n} citas') */
export function tn(n: number, one: string, many: string, vars?: Record<string, string | number | null | undefined>): string {
  return t(n === 1 ? one : many, { n, ...vars })
}

/** Locale para Intl (números y fechas) */
export const LOCALE = IS_EN ? 'en-US' : 'es-ES'
