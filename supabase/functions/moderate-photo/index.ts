// Edge Function: revisa con IA (Sightengine) cada foto nueva de la galería de un negocio, para
// bloquear contenido inapropiado antes de que se vea en su web pública (ver _notify_moderation y
// el disparador gallery_photos_notify en supabase/schema.sql). Se despliega una sola vez; después
// la base de datos la llama sola cada vez que se sube una foto.
//
// Variables de entorno necesarias (supabase secrets set ...):
//   PUSH_SHARED_SECRET     - la misma frase secreta que usa notify-push (platform_settings.push_shared_secret)
//   SIGHTENGINE_USER       - de tu cuenta en sightengine.com (API User)
//   SIGHTENGINE_SECRET     - de tu cuenta en sightengine.com (API Secret)
// Mientras SIGHTENGINE_USER/SIGHTENGINE_SECRET no estén configuradas, las fotos se aprueban solas
// (sin revisión) para no bloquear la galería por una función a medio configurar.
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya los pone Supabase automáticamente.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

interface Payload {
  photo_id: string
  url: string
}

// Umbral de confianza (0 a 1) a partir del cual se rechaza una foto
const THRESHOLD = 0.5

async function approve(photoId: string) {
  await supabase.from('gallery_photos').update({ moderation_status: 'aprobada', moderation_note: null }).eq('id', photoId)
}

async function reject(photoId: string, note: string) {
  await supabase.from('gallery_photos').update({ moderation_status: 'rechazada', moderation_note: note }).eq('id', photoId)
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

  const apiUser = Deno.env.get('SIGHTENGINE_USER')
  const apiSecret = Deno.env.get('SIGHTENGINE_SECRET')
  if (!apiUser || !apiSecret) {
    await approve(payload.photo_id)
    return new Response('ok (sin revisión: Sightengine no configurado)', { status: 200 })
  }

  try {
    const params = new URLSearchParams({
      url: payload.url,
      models: 'nudity-2.1,offensive,gore-2.0',
      api_user: apiUser,
      api_secret: apiSecret,
    })
    const res = await fetch(`https://api.sightengine.com/1.0/check.json?${params}`)
    const data = await res.json()
    if (data.status !== 'success') throw new Error(data.error?.message || 'Error de Sightengine')

    const nudity = data.nudity || {}
    const scores = [
      nudity.sexual_activity, nudity.sexual_display, nudity.erotica,
      data.offensive?.prob, data.gore?.prob,
    ].map((n) => Number(n) || 0)
    const worst = Math.max(...scores, 0)

    if (worst >= THRESHOLD) {
      await reject(payload.photo_id, 'Esta foto no cumple las normas de contenido (revisión automática) y no se muestra en tu web.')
    } else {
      await approve(payload.photo_id)
    }
  } catch (e) {
    // Si Sightengine falla (caída, clave mal puesta, etc.), la foto se queda "pendiente" (no sale
    // en la web pública) y la base de datos la vuelve a mandar cada hora durante un día (ver
    // _approve_unmoderated_photos); solo si en todo ese día no se pudo revisar, se aprueba sola.
    console.error('moderate-photo', e)
    return new Response('Error al revisar (se reintentará)', { status: 502 })
  }

  return new Response('ok', { status: 200 })
})
