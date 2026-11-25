// Notificaciones push (Web Push): suscribir o quitar este dispositivo/navegador.
// Necesita HTTPS, Service Worker y que el dueño haya desplegado supabase/functions/notify-push
// (ver VITE_VAPID_PUBLIC_KEY). Si falta algo, pushSupported() da false y no se muestra nada.
import { supabase } from './supabase'
import { t } from './i18n'

const VAPID_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY || '').trim()

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const base64Safe = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64Safe)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export function pushSupported(): boolean {
  return Boolean(VAPID_KEY) && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function pushPermission(): NotificationPermission | 'unsupported' {
  if (!pushSupported()) return 'unsupported'
  return Notification.permission
}

/**
 * Por qué no se pudieron activar los avisos (ver pushProblemMessage):
 *   denied    el navegador o el móvil los tiene bloqueados para esta web
 *   dismissed la persona cerró la pregunta sin aceptar
 *   server    el móvil aceptó, pero no se pudo guardar en Citora
 *   error     otro fallo del navegador
 */
export type PushProblem = 'denied' | 'dismissed' | 'server' | 'error'

/** El service worker listo, o null si no llega en unos segundos (si no, la espera no acaba nunca) */
async function readyRegistration(): Promise<ServiceWorkerRegistration | null> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 8000)),
  ])
}

async function getOrCreateSubscription(): Promise<PushSubscription | PushProblem> {
  try {
    const reg = await readyRegistration()
    if (!reg) return 'error'
    const existing = await reg.pushManager.getSubscription()
    if (existing) return existing
    const permission = await Notification.requestPermission()
    if (permission === 'denied') return 'denied'
    if (permission !== 'granted') return 'dismissed'
    return await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_KEY) as BufferSource })
  } catch {
    return Notification.permission === 'denied' ? 'denied' : 'error'
  }
}

/** Explicación de qué hacer cuando no se pudieron activar los avisos, según el móvil */
export function pushProblemMessage(p: PushProblem): string {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  if (p === 'denied') {
    return ios
      ? t('Los avisos están bloqueados en este iPhone. Ve a Ajustes del iPhone → Notificaciones → Citora y activa «Permitir notificaciones». Luego vuelve a intentarlo.')
      : t('El navegador tiene bloqueados los avisos de esta web. Toca el icono que hay a la izquierda de la dirección (citora-app.com) → Permisos → Notificaciones → Permitir. Luego recarga la página y vuelve a intentarlo.')
  }
  if (p === 'dismissed') return t('No aceptaste el permiso. Vuelve a pulsar y, cuando el navegador pregunte, elige «Permitir».')
  if (p === 'server') return t('Tu móvil aceptó los avisos, pero no se pudieron guardar. Revisa tu conexión y vuelve a intentarlo.')
  return t('No se pudieron activar en este navegador. Recarga la página y vuelve a intentarlo; si sigue igual, instala la app desde el menú del navegador («Añadir a pantalla de inicio») y actívalos desde ahí.')
}

function subKeys(sub: PushSubscription): { endpoint: string; p256dh: string; auth: string } {
  const json = sub.toJSON()
  return { endpoint: sub.endpoint, p256dh: json.keys?.p256dh || '', auth: json.keys?.auth || '' }
}

/** El cliente acepta avisos de su cita (recordatorio, confirmación, cancelación, cambio) */
export async function subscribeCustomerPush(token: string): Promise<true | PushProblem> {
  if (!pushSupported()) return 'error'
  const sub = await getOrCreateSubscription()
  if (typeof sub === 'string') return sub
  const { endpoint, p256dh, auth } = subKeys(sub)
  const { error } = await supabase.rpc('save_customer_push_subscription', { p_token: token, p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth })
  return error ? 'server' : true
}

/** El dueño acepta avisos de citas nuevas, canceladas o cambiadas por sus clientes */
export async function subscribeOwnerPush(): Promise<true | PushProblem> {
  if (!pushSupported()) return 'error'
  const sub = await getOrCreateSubscription()
  if (typeof sub === 'string') return sub
  const { endpoint, p256dh, auth } = subKeys(sub)
  const { error } = await supabase.rpc('save_owner_push_subscription', { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth })
  return error ? 'server' : true
}

/** El administrador acepta avisos de la plataforma (ej. negocio nuevo registrado) */
export async function subscribeAdminPush(): Promise<true | PushProblem> {
  if (!pushSupported()) return 'error'
  const sub = await getOrCreateSubscription()
  if (typeof sub === 'string') return sub
  const { endpoint, p256dh, auth } = subKeys(sub)
  const { error } = await supabase.rpc('save_admin_push_subscription', { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth })
  return error ? 'server' : true
}

/** Quita este dispositivo de los avisos (cliente, dueño o administrador) */
export async function unsubscribePush(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  await supabase.rpc('delete_push_subscription', { p_endpoint: sub.endpoint })
  await sub.unsubscribe()
}

/** true si este dispositivo ya está suscrito (independiente de a qué cita/negocio) */
export async function isPushSubscribed(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false
  const reg = await readyRegistration()
  if (!reg) return false
  return Boolean(await reg.pushManager.getSubscription())
}
