import { useEffect, useState } from 'react'
import { load, save } from './storage'

// Modo claro u oscuro. Sin elección guardada se sigue el del móvil.
// (index.html aplica la clase antes de pintar, para que no parpadee.)
export type Theme = 'light' | 'dark'

const KEY = 'citora:tema'
const listeners = new Set<(t: Theme) => void>()

function systemTheme(): Theme {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function currentTheme(): Theme {
  const saved = load<Theme | null>(KEY, null)
  return saved === 'dark' || saved === 'light' ? saved : systemTheme()
}

export function applyTheme(t: Theme): void {
  document.documentElement.classList.toggle('dark', t === 'dark')
  document.documentElement.style.colorScheme = t
}

export function setTheme(t: Theme): void {
  save(KEY, t)
  applyTheme(t)
  listeners.forEach((fn) => fn(t))
}

/** Tema actual; todos los botones de cambio se mantienen al día */
export function useTheme(): [Theme, () => void] {
  const [theme, setState] = useState<Theme>(currentTheme)
  useEffect(() => {
    listeners.add(setState)
    return () => {
      listeners.delete(setState)
    }
  }, [])
  return [theme, () => setTheme(theme === 'dark' ? 'light' : 'dark')]
}
