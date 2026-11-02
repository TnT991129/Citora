import { useState } from 'react'

/**
 * Botón para recargar la página: en la app instalada no hay barra del navegador ni se puede
 * deslizar hacia abajo para actualizar. Antes pide al service worker la última versión publicada.
 */
export function RefreshButton({ onImage, className = '' }: { onImage?: boolean; className?: string }) {
  const [busy, setBusy] = useState(false)
  const refresh = async () => {
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker?.getRegistration()
      await reg?.update()
    } catch {
      /* sin service worker se recarga igual */
    }
    window.location.reload()
  }
  return (
    <button
      type="button"
      onClick={refresh}
      disabled={busy}
      aria-label="Actualizar la página"
      title="Actualizar"
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition ${
        onImage ? 'bg-white/15 text-white hover:bg-white/25' : 'text-slate-600 hover:bg-slate-100'
      } ${className}`}
    >
      <svg viewBox="0 0 24 24" className={`h-5 w-5 ${busy ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M20 12a8 8 0 11-2.34-5.66M20 4v4.5h-4.5" />
      </svg>
    </button>
  )
}
