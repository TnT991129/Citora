// Edge Function: pago automático de la mensualidad con PayPal (versión internacional, /int/).
// La llaman los botones de PayPal del panel del dueño (PlanPage):
//   { action: 'create', plan: 'basico' | 'ultra', months: 1..24 }  → crea el pedido en PayPal, con el
//        precio que calcula la base de datos (online_order_price), y devuelve su id
//   { action: 'capture', order_id }  → cobra el pedido que el dueño aprobó en PayPal y, si PayPal
//        confirma el cobro, suma los meses (online_payment_complete). Devuelve hasta cuándo está pagado.
// Nadie aprueba nada a mano: si PayPal dice que se cobró, el negocio queda pagado.
//
// Variables de entorno (supabase secrets set ...):
//   PAYPAL_CLIENT_ID  - de la app de PayPal (developer.paypal.com → Apps & Credentials); el mismo que
//                       platform_settings.paypal_client_id
//   PAYPAL_SECRET     - la clave secreta de esa app (nunca va en el navegador ni en la base de datos)
//   PAYPAL_ENV        - 'live' para cobrar de verdad; cualquier otro valor usa el modo de pruebas (sandbox)
// SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY ya los pone Supabase automáticamente.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const PAYPAL_API = Deno.env.get('PAYPAL_ENV') === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

/** Error para el navegador: un código corto (ver src/lib/errors.ts) */
const fail = (code: string, status = 400) => json({ error: code }, status)

async function paypalToken(): Promise<string> {
  const id = Deno.env.get('PAYPAL_CLIENT_ID')
  const secret = Deno.env.get('PAYPAL_SECRET')
  if (!id || !secret) throw new Error('PAGO_NO_CONFIGURADO')
  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${id}:${secret}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) throw new Error('PAGO_NO_CONFIGURADO')
  return (await res.json()).access_token
}

async function paypal(path: string, token: string, body?: unknown, requestId?: string) {
  const res = await fetch(`${PAYPAL_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      // Si se repite la misma petición (ej. la conexión se cortó), PayPal no cobra dos veces
      ...(requestId ? { 'PayPal-Request-Id': requestId } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, data }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return fail('METODO', 405)

  // Quién llama: el dueño con su sesión
  const auth = req.headers.get('Authorization') || ''
  const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  })
  const { data: userData } = await asUser.auth.getUser()
  const user = userData?.user
  if (!user) return fail('SIN_SESION', 401)

  const { data: biz } = await admin.from('businesses').select('id, name, code, market').eq('owner_id', user.id).maybeSingle()
  if (!biz) return fail('SIN_NEGOCIO')
  if (biz.market !== 'int') return fail('NEGOCIO_NO_EXISTE')

  let input: { action?: string; plan?: string; months?: number; order_id?: string }
  try {
    input = await req.json()
  } catch {
    return fail('DATOS_INVALIDOS')
  }

  try {
    const token = await paypalToken()

    if (input.action === 'create') {
      const plan = input.plan === 'ultra' ? 'ultra' : 'basico'
      const months = Math.round(Number(input.months))
      const { data: price, error } = await admin.rpc('online_order_price', { p_business: biz.id, p_plan: plan, p_months: months })
      if (error) return fail(error.message.match(/[A-Z_]{5,}/)?.[0] || 'DATOS_INVALIDOS')
      const amount = Number(price).toFixed(2)
      const planName = plan === 'ultra' ? 'Citora Equipo' : 'Citora Solo'
      const { ok, data } = await paypal('/v2/checkout/orders', token, {
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: biz.code,
          custom_id: biz.id,
          description: `${planName} · ${months} ${months === 1 ? 'mes' : 'meses'} · ${biz.name}`.slice(0, 127),
          amount: { currency_code: 'USD', value: amount },
        }],
        application_context: { brand_name: 'Citora', shipping_preference: 'NO_SHIPPING', user_action: 'PAY_NOW' },
      })
      if (!ok || !data.id) return fail('PAGO_FALLIDO', 502)
      const { error: insErr } = await admin.from('online_orders').insert({
        business_id: biz.id, provider_order_id: data.id, plan, months, amount: Number(amount),
      })
      if (insErr) return fail('PAGO_FALLIDO', 500)
      return json({ id: data.id })
    }

    if (input.action === 'capture') {
      const orderId = String(input.order_id || '')
      // Solo sus propios pedidos
      const { data: order } = await admin.from('online_orders').select('id, status').eq('provider_order_id', orderId).eq('business_id', biz.id).maybeSingle()
      if (!order) return fail('PEDIDO_NO_EXISTE', 404)
      const { ok, data } = await paypal(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, token, undefined, `capture-${orderId}`)
      const capture = data?.purchase_units?.[0]?.payments?.captures?.[0]
      // Ya cobrado antes (ej. se repitió la petición): se da por bueno con lo que diga PayPal
      const completed = (ok && data.status === 'COMPLETED' && capture?.status === 'COMPLETED')
        || data?.details?.[0]?.issue === 'ORDER_ALREADY_CAPTURED'
      if (!completed) return fail('PAGO_NO_COMPLETADO', 402)
      let amount = capture?.amount?.value
      let currency = capture?.amount?.currency_code
      let captureId = capture?.id
      if (!amount) {
        // Ya estaba cobrado: se lee el pedido para saber cuánto
        const res = await fetch(`${PAYPAL_API}/v2/checkout/orders/${encodeURIComponent(orderId)}`, { headers: { Authorization: `Bearer ${token}` } })
        const o = await res.json()
        const c = o?.purchase_units?.[0]?.payments?.captures?.[0]
        if (o?.status !== 'COMPLETED' || c?.status !== 'COMPLETED') return fail('PAGO_NO_COMPLETADO', 402)
        amount = c.amount.value
        currency = c.amount.currency_code
        captureId = c.id
      }
      const { data: until, error } = await admin.rpc('online_payment_complete', {
        p_order: orderId, p_amount: Number(amount), p_currency: currency, p_capture: captureId,
      })
      if (error) return fail(error.message.match(/[A-Z_]{5,}/)?.[0] || 'PAGO_FALLIDO', 500)
      return json({ paid_until: until })
    }

    return fail('DATOS_INVALIDOS')
  } catch (e) {
    const code = e instanceof Error && /^[A-Z_]+$/.test(e.message) ? e.message : 'PAGO_FALLIDO'
    return fail(code, 500)
  }
})
