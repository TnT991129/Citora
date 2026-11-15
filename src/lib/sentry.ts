// Monitoreo de errores (Sentry). Mientras VITE_SENTRY_DSN esté vacía, no hace nada: la app
// funciona igual, solo sin avisos de errores. Se activa poniendo esa variable (ver .env.example).
// Sentry se descarga aparte, después de abrir la app: así no pesa en la primera carga (importa con
// datos móviles). Los errores de antes de que termine de cargar se guardan y se envían después.
import { Component, createElement, type ErrorInfo, type ReactNode } from 'react'

type SentryApi = typeof import('@sentry/react')

const dsn = import.meta.env.VITE_SENTRY_DSN
let sentry: SentryApi | null = null
const pending: unknown[] = []

export function initSentry(): void {
  if (!dsn) return
  const load = () =>
    import('@sentry/react')
      .then((S) => {
        S.init({
          dsn,
          environment: import.meta.env.MODE,
          // Sin seguimiento de sesiones de usuario ni "replay" de pantalla: solo errores.
          tracesSampleRate: 0,
        })
        sentry = S
        pending.splice(0).forEach((e) => S.captureException(e))
      })
      .catch(() => {
        /* sin conexión: sin avisos de errores, la app sigue igual */
      })
  // Cuando el navegador esté libre, para no competir con la carga de la página
  if ('requestIdleCallback' in window) window.requestIdleCallback(() => void load(), { timeout: 4000 })
  else setTimeout(() => void load(), 2000)
}

export function reportError(error: unknown): void {
  if (!dsn) return
  if (sentry) sentry.captureException(error)
  else if (pending.length < 20) pending.push(error)
}

/** Si una pantalla falla, enseña el aviso (fallback) en vez de una página en blanco, y lo envía a Sentry */
export class SentryErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(Object.assign(error, { componentStack: info.componentStack }))
  }

  render() {
    return this.state.failed ? this.props.fallback : createElement('div', { style: { display: 'contents' } }, this.props.children)
  }
}
