import { cleanPhone } from './format'

// Con qué WhatsApp se envían los mensajes desde este móvil. Hay dueños con dos (el personal y
// WhatsApp Business): el enlace normal (wa.me) abre el que el móvil elija, casi siempre el personal.
// En Android se puede pedir WhatsApp Business directamente; en iPhone no hay forma de elegirlo.
export type WaApp = 'normal' | 'business'
const WA_APP_KEY = 'citora.whatsapp-app'
const BUSINESS_PACKAGE = 'com.whatsapp.w4b'

export function isAndroid(): boolean {
  return typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)
}

export function getWaApp(): WaApp {
  try {
    return localStorage.getItem(WA_APP_KEY) === 'business' ? 'business' : 'normal'
  } catch {
    return 'normal'
  }
}

export function setWaApp(app: WaApp): void {
  try {
    if (app === 'business') localStorage.setItem(WA_APP_KEY, 'business')
    else localStorage.removeItem(WA_APP_KEY)
  } catch { /* sin almacenamiento: se queda el normal */ }
}

/** Abre WhatsApp con un mensaje ya escrito (con WhatsApp Business si este móvil Android lo eligió) */
export function waLink(phone: string, text: string, app: WaApp = getWaApp()): string {
  const p = cleanPhone(phone)
  const q = encodeURIComponent(text)
  const web = `https://wa.me/${p}?text=${q}`
  if (app === 'business' && isAndroid()) {
    // Si WhatsApp Business no está instalado, abre el enlace normal
    return `intent://send/?phone=${p}&text=${q}#Intent;scheme=whatsapp;package=${BUSINESS_PACKAGE};S.browser_fallback_url=${encodeURIComponent(web)};end`
  }
  return web
}

export function shareLink(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}
