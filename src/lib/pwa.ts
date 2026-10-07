// App instalable: cada negocio se instala con su nombre, su color y su logo.
// El manifiesto se genera en el navegador porque cada negocio es distinto.
import { useEffect, useState } from 'react'

const BASE = import.meta.env.BASE_URL || '/'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

/** Se llama una vez al arrancar: guarda el aviso de instalación de Chrome/Android para usarlo luego */
export function initPwa(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    listeners.forEach((l) => l())
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    listeners.forEach((l) => l())
  })
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(`${BASE}sw.js`, { scope: BASE }).catch(() => {
        /* sin service worker la app sigue funcionando */
      })
    })
  }
}

export function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
}

export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/** Estado del botón "Instalar": 'prompt' (Android/Chrome), 'ios' (instrucciones) o null (no disponible / ya instalada) */
export function useInstall(): { mode: 'prompt' | 'ios' | null; install: () => Promise<boolean> } {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force((n) => n + 1)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])
  const mode = isStandalone() ? null : deferred ? 'prompt' : isIos() ? 'ios' : null
  const install = async () => {
    if (!deferred) return false
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    deferred = null
    listeners.forEach((l) => l())
    return outcome === 'accepted'
  }
  return { mode, install }
}

/** Icono cuadrado PNG: el logo si se puede leer, o la inicial sobre el color de marca */
async function makeIcon(size: number, name: string, color: string, logo: string | null): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = color
  ctx.fillRect(0, 0, size, size)
  if (logo) {
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image()
        i.crossOrigin = 'anonymous'
        i.onload = () => resolve(i)
        i.onerror = reject
        i.src = logo
      })
      // Margen del 10% para que los iconos redondeados de Android no corten el logo
      const pad = size * 0.1
      const side = Math.min(img.width, img.height)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, size, size)
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, pad, pad, size - pad * 2, size - pad * 2)
      return canvas.toDataURL('image/png')
    } catch {
      ctx.fillStyle = color
      ctx.fillRect(0, 0, size, size)
    }
  }
  ctx.fillStyle = '#ffffff'
  ctx.font = `800 ${Math.round(size * 0.5)}px Inter, system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText((name.trim()[0] || 'C').toUpperCase(), size / 2, size / 2 + size * 0.03)
  return canvas.toDataURL('image/png')
}

function setLink(rel: string, href: string) {
  let el = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.rel = rel
    document.head.appendChild(el)
  }
  el.href = href
}

function setMeta(name: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.name = name
    document.head.appendChild(el)
  }
  el.content = content
}

let current = ''

/**
 * Pone el manifiesto de la app que se está viendo.
 * path: ruta dentro de la web, sin barra inicial (ej. "barberia-leo" o "panel").
 */
export async function setAppManifest(opts: { name: string; shortName?: string; path: string; color: string; logo?: string | null }): Promise<void> {
  const key = JSON.stringify(opts)
  if (key === current) return
  current = key
  const origin = window.location.origin
  const start = `${origin}${BASE}${opts.path}`
  const [i192, i512] = await Promise.all([
    makeIcon(192, opts.name, opts.color, opts.logo || null),
    makeIcon(512, opts.name, opts.color, opts.logo || null),
  ])
  if (key !== current) return // cambió de página mientras se dibujaban los iconos
  const manifest = {
    name: opts.name,
    short_name: (opts.shortName || opts.name).slice(0, 24),
    start_url: start,
    scope: start,
    id: start,
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: opts.color,
    lang: 'es',
    icons: [
      { src: i192, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: i512, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: i512, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
  setLink('manifest', `data:application/manifest+json;charset=utf-8,${encodeURIComponent(JSON.stringify(manifest))}`)
  setLink('apple-touch-icon', i192)
  setMeta('apple-mobile-web-app-capable', 'yes')
  setMeta('mobile-web-app-capable', 'yes')
  setMeta('apple-mobile-web-app-title', manifest.short_name)
  setMeta('apple-mobile-web-app-status-bar-style', 'default')
}
