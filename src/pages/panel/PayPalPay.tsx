// Pago automático de la mensualidad con PayPal (versión internacional). Los botones son los oficiales
// de PayPal: se paga con cuenta PayPal o con tarjeta sin cuenta. El precio lo pone la base de datos y
// el cobro lo confirma el servidor (supabase/functions/paypal-checkout): al terminar, los meses ya
// están sumados, sin que nadie apruebe nada.
import { useEffect, useRef, useState } from 'react'
import { Alert, PageLoader } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import { t } from '../../lib/i18n'

interface PayPalButtonsApi {
  Buttons: (opts: {
    style?: Record<string, string | number>
    createOrder: () => Promise<string>
    onApprove: (data: { orderID: string }) => Promise<void>
    onError: (err: unknown) => void
    onCancel?: () => void
  }) => { render: (el: HTMLElement) => Promise<void>; close: () => Promise<void> }
}

declare global {
  interface Window {
    paypal?: PayPalButtonsApi
  }
}

let loading: Promise<PayPalButtonsApi> | null = null

/** Carga el SDK de PayPal una sola vez */
function loadPayPal(clientId: string): Promise<PayPalButtonsApi> {
  if (window.paypal) return Promise.resolve(window.paypal)
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=capture&components=buttons`
      s.async = true
      s.onload = () => (window.paypal ? resolve(window.paypal) : reject(new Error('PAGO_NO_DISPONIBLE')))
      s.onerror = () => {
        loading = null
        reject(new Error('PAGO_NO_DISPONIBLE'))
      }
      document.head.appendChild(s)
    })
  }
  return loading
}

/** Llama a la función de PayPal y devuelve su respuesta o lanza el código de error */
async function callCheckout<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('paypal-checkout', { body })
  if (error) {
    let code = 'PAGO_FALLIDO'
    try {
      const ctx = (error as { context?: Response }).context
      const j = ctx ? await ctx.json() : null
      if (j?.error) code = j.error
    } catch {
      /* sin detalle: error genérico */
    }
    throw new Error(code)
  }
  return data as T
}

export function PayPalPay({ clientId, plan, months, onPaid }: {
  clientId: string
  plan: 'basico' | 'ultra'
  months: number
  onPaid: (paidUntil: string) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  // Los botones se pintan una vez: leen el plan y los meses de aquí al pulsar
  const choice = useRef({ plan, months })
  choice.current = { plan, months }
  const paidRef = useRef(onPaid)
  paidRef.current = onPaid
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    let buttons: { close: () => Promise<void> } | null = null
    loadPayPal(clientId)
      .then((pp) => {
        if (!alive || !box.current) return
        const b = pp.Buttons({
          style: { layout: 'vertical', shape: 'pill', label: 'pay', height: 48 },
          createOrder: async () => {
            setError(null)
            const r = await callCheckout<{ id: string }>({ action: 'create', ...choice.current })
            return r.id
          },
          onApprove: async ({ orderID }) => {
            setBusy(true)
            try {
              const r = await callCheckout<{ paid_until: string }>({ action: 'capture', order_id: orderID })
              paidRef.current(r.paid_until)
            } catch (e) {
              setError(errorMessage(e))
            } finally {
              setBusy(false)
            }
          },
          onError: (e) => setError(errorMessage(e instanceof Error ? e : new Error('PAGO_FALLIDO'))),
        })
        buttons = b
        return b.render(box.current).then(() => alive && setReady(true))
      })
      .catch((e) => alive && setError(errorMessage(e)))
    return () => {
      alive = false
      buttons?.close().catch(() => {})
    }
  }, [clientId])

  return (
    <div className="space-y-3">
      {!ready && !error && <PageLoader />}
      {busy && <Alert kind="info">{t('Confirmando tu pago con PayPal… no cierres esta pantalla.')}</Alert>}
      {/* PayPal pinta aquí sus botones (fondo blanco también en modo oscuro: así lo exige PayPal) */}
      <div ref={box} className={busy ? 'pointer-events-none opacity-50' : ''} />
      {error && <Alert>{error}</Alert>}
    </div>
  )
}
