// Edge Function: envía notificaciones push (Web Push) cuando la base de datos avisa de una cita
// nueva, cancelada, confirmada o cambiada (ver _notify_push y el disparador appointments_notify
// en supabase/schema.sql). Se despliega una sola vez; después la base de datos la llama sola.
//
// Variables de entorno necesarias (supabase secrets set ...):
//   PUSH_SHARED_SECRET   - frase secreta cualquiera; debe ser igual a platform_settings.push_shared_secret
//   VAPID_PUBLIC_KEY     - de scripts/generate-vapid-keys.mjs
//   VAPID_PRIVATE_KEY    - de scripts/generate-vapid-keys.mjs
//   VAPID_SUBJECT        - "mailto:tu-correo@ejemplo.com" (contacto, lo exige el estándar Web Push)
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya los pone Supabase automáticamente.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4'
import webpush from 'npm:web-push@3.6.7'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') || 'mailto:soporte@example.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

interface Payload {
  business_id: string | null
  kind: 'owner' | 'customer' | 'admin'
  appointment_id: string | null
  title: string
  body: string
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const secret = req.headers.get('x-push-secret') || ''
  if (!secret || secret !== Deno.env.get('PUSH_SHARED_SECRET')) {
    return new Response('No autorizado', { status: 401 })
  }

  let payload: Payload
  try {
    payload = await req.json()
  } catch {
    return new Response('JSON inválido', { status: 400 })
  }

  const table = payload.kind === 'admin' ? 'admin_push_subscriptions' : 'push_subscriptions'
  let query = supabase.from(table).select('id, endpoint, p256dh, auth')
  if (payload.kind === 'owner') query = query.eq('kind', 'owner').eq('business_id', payload.business_id)
  else if (payload.kind === 'customer') query = query.eq('kind', 'customer').eq('appointment_id', payload.appointment_id)
  const { data: subs, error } = await query
  if (error) return new Response(error.message, { status: 500 })
  if (!subs || subs.length === 0) return new Response('ok (sin suscriptores)', { status: 200 })

  const notification = JSON.stringify({ title: payload.title, body: payload.body })
  const expired: string[] = []

  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        notification,
      )
    } catch (e) {
      // 404/410: el navegador invalidó esta suscripción (desinstaló la app, borró datos, etc.)
      const status = (e as { statusCode?: number })?.statusCode
      if (status === 404 || status === 410) expired.push(s.endpoint)
    }
  }))

  if (expired.length > 0) {
    await supabase.from(table).delete().in('endpoint', expired)
  }

  return new Response('ok', { status: 200 })
})
