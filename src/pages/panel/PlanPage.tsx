import { useEffect, useState } from 'react'
import { Alert, Button, CopyButton, LinkButton, PageLoader, StatusBadge, WhatsAppIcon } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { daysLeft, fullDateFromIso, money } from '../../lib/format'
import { INCLUDED, MODULES, PLAN_LABEL } from '../../lib/plans'
import { supabase } from '../../lib/supabase'
import type { PlanKey } from '../../lib/types'
import { waLink } from '../../lib/whatsapp'
import { usePanel } from './context'

interface PaymentInfo {
  card_number: string
  card_holder: string
  admin_whatsapp: string
  basico: number
  plus: number
  ultra: number
}

interface PaymentRow {
  id: string
  plan: PlanKey
  months: number
  amount: number | null
  paid_until: string
  created_at: string
}

export default function PlanPage({ blocked }: { blocked?: boolean }) {
  const { business, status } = usePanel()
  const [info, setInfo] = useState<PaymentInfo | null>(null)
  const [history, setHistory] = useState<PaymentRow[]>([])
  const [months, setMonths] = useState(1)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.rpc('get_payment_info').then(({ data, error }) => (error ? setError(errorMessage(error)) : setInfo(data as PaymentInfo)))
    supabase.from('payments').select('*').order('created_at', { ascending: false }).limit(12).then(({ data }) => setHistory((data as PaymentRow[]) || []))
  }, [])

  if (error) return <Alert>{error}</Alert>
  if (!info) return <PageLoader />

  const price = info.basico
  const amount = price * months
  const message = [
    `Hola, acabo de pagar la mensualidad de Citora (${months} ${months === 1 ? 'mes' : 'meses'}).`,
    `Negocio: *${business.name}*`,
    `Código: *${business.code}*`,
    `Importe: *${money(amount, 'CUP')}*`,
    'Te adjunto la captura del pago.',
  ].join('\n')

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">{blocked ? 'Activa tu app' : 'Tu plan'}</h1>
        {blocked && <p className="mt-1 text-slate-600">Tu prueba o tu mensualidad terminó. Paga la mensualidad para que tus clientes vuelvan a reservar. No se ha borrado nada.</p>}
      </div>

      <section className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">Estado</p>
          <p className="text-lg font-bold">
            {status.status === 'prueba' && <>Prueba gratis (todo incluido) · {daysLeft(status.trial_ends_at)} días</>}
            {status.status === 'activo' && <>{PLAN_LABEL} · pagado hasta el {fullDateFromIso(status.paid_until!, business.timezone)}</>}
            {status.status === 'vencido' && <>Inhabilitada</>}
          </p>
        </div>
        <StatusBadge status={status.status} />
      </section>

      <section className="card">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-extrabold">{PLAN_LABEL}</h2>
          <p><span className="text-2xl font-extrabold">{money(price, 'CUP')}</span><span className="text-sm text-slate-500"> /mes</span></p>
        </div>
        <p className="mt-1 text-sm text-slate-500">Todo incluido:</p>
        <ul className="mt-1 grid gap-0.5 text-sm sm:grid-cols-2">
          {INCLUDED.map((m) => <li key={m}>✓ {MODULES[m].name}</li>)}
        </ul>
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold">1. ¿Cuántos meses?</h2>
        <div className="flex gap-2">
          {[1, 2, 3, 6].map((m) => (
            <button key={m} onClick={() => setMonths(m)} className={`flex-1 rounded-xl py-2.5 font-semibold ${months === m ? 'bg-brand text-white' : 'bg-white ring-1 ring-slate-300'}`}>
              {m} {m === 1 ? 'mes' : 'meses'}
            </button>
          ))}
        </div>
        <p className="text-lg">Total a pagar: <b>{money(amount, 'CUP')}</b></p>
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold">2. Transfiere a esta tarjeta</h2>
        {info.card_number ? (
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="font-mono text-lg font-bold tracking-wider">{info.card_number}</p>
            {info.card_holder && <p className="text-sm text-slate-600">{info.card_holder}</p>}
            <div className="mt-2 flex gap-2">
              <CopyButton text={info.card_number.replace(/\s/g, '')} label="Copiar número" />
              <CopyButton text={String(amount)} label="Copiar importe" />
            </div>
          </div>
        ) : (
          <Alert kind="warning">Todavía no hay tarjeta configurada. Escribe por WhatsApp para pagar.</Alert>
        )}
        <p className="text-sm text-slate-500">Por Transfermóvil o EnZona. Haz una captura de pantalla del comprobante.</p>
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold">3. Envía la captura por WhatsApp</h2>
        <p className="text-sm text-slate-500">Se abre WhatsApp con el mensaje escrito. Solo adjunta la captura. Activamos tu mes en cuanto confirmemos el pago.</p>
        {info.admin_whatsapp ? (
          <LinkButton href={waLink(info.admin_whatsapp, message)} variant="whatsapp" size="lg" block newTab>
            <WhatsAppIcon /> Enviar comprobante
          </LinkButton>
        ) : (
          <Alert kind="warning">Falta configurar el WhatsApp de Citora.</Alert>
        )}
      </section>

      {history.length > 0 && (
        <section className="card">
          <h2 className="font-bold">Pagos confirmados</h2>
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex justify-between py-2">
                <span>{fullDateFromIso(h.created_at, business.timezone)} · {h.months} {h.months === 1 ? 'mes' : 'meses'}</span>
                {h.amount != null && <span className="font-semibold">{money(h.amount, 'CUP')}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {blocked && (
        <Button variant="ghost" onClick={() => supabase.auth.signOut()}>Cerrar sesión</Button>
      )}
    </div>
  )
}
