// Notificaciones push (Web Push): suscribir o quitar este dispositivo/navegador.
// Necesita HTTPS, Service Worker y que el dueño haya desplegado supabase/functions/notify-push
// (ver VITE_VAPID_PUBLIC_KEY). Si falta algo, pushSupported() da false y no se muestra nada.
import { supabase } from './supabase'

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

async function getOrCreateSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready
  const existing = await reg.pushManager.getSubscription()
  if (existing) return existing
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return null
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_KEY) as BufferSource })
}

function subKeys(sub: PushSubscription): { endpoint: string; p256dh: string; auth: string } {
  const json = sub.toJSON()
  return { endpoint: sub.endpoint, p256dh: json.keys?.p256dh || '', auth: json.keys?.auth || '' }
}

/** El cliente acepta avisos de su cita (recordatorio, confirmación, cancelación, cambio) */
export async function subscribeCustomerPush(token: string): Promise<boolean> {
  if (!pushSupported()) return false
  const sub = await getOrCreateSubscription()
  if (!sub) return false
  const { endpoint, p256dh, auth } = subKeys(sub)
  const { error } = await supabase.rpc('save_customer_push_subscription', { p_token: token, p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth })
  return !error
}

/** El dueño acepta avisos de citas nuevas, canceladas o cambiadas por sus clientes */
export async function subscribeOwnerPush(): Promise<boolean> {
  if (!pushSupported()) return false
  const sub = await getOrCreateSubscription()
  if (!sub) return false
  const { endpoint, p256dh, auth } = subKeys(sub)
  const { error } = await supabase.rpc('save_owner_push_subscription', { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth })
  return !error
}

/** El administrador acepta avisos de la plataforma (ej. negocio nuevo registrado) */
export async function subscribeAdminPush(): Promise<boolean> {
  if (!pushSupported()) return false
  const sub = await getOrCreateSubscription()
  if (!sub) return false
  const { endpoint, p256dh, auth } = subKeys(sub)
  const { error } = await supabase.rpc('save_admin_push_subscription', { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth })
  return !error
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
  const reg = await navigator.serviceWorker.ready
  return Boolean(await reg.pushManager.getSubscription())
}
