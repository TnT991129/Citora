import * as Sentry from '@sentry/react'

/**
 * Monitoreo de errores (Sentry). Mientras VITE_SENTRY_DSN esté vacía, no hace nada: la app
 * funciona igual, solo sin avisos de errores. Se activa poniendo esa variable (ver .env.example).
 */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // Sin seguimiento de sesiones de usuario ni "replay" de pantalla: solo errores.
    tracesSampleRate: 0,
  })
}

export const SentryErrorBoundary = Sentry.ErrorBoundary
