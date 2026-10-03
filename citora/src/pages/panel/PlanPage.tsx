import { useEffect, useState } from 'react'
import { Alert, Button, CopyButton, LinkButton, PageLoader, StatusBadge, WhatsAppIcon } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { daysLeft, fullDateFromIso, money } from '../../lib/format'
import { MODULES, PLAN_ADDS, PLAN_NAMES, PLAN_ORDER } from '../../lib/plans'
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
  const [plan, setPlan] = useState<PlanKey>(status.plan || 'plus')
  const [months, setMonths] = useState(1)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.rpc('get_payment_info').then(({ data, error }) => (error ? setError(errorMessage(error)) : setInfo(data as PaymentInfo)))
    supabase.from('payments').select('*').order('created_at', { ascending: false }).limit(12).then(({ data }) => setHistory((data as PaymentRow[]) || []))
  }, [])

  if (error) return <Alert>{error}</Alert>
  if (!info) return <PageLoader />

  const amount = info[plan] * months
  const message = [
    `Hola, acabo de pagar el plan *${PLAN_NAMES[plan]}* de Citora (${months} ${months === 1 ? 'mes' : 'meses'}).`,
    `Negocio: *${business.name}*`,
    `Código: *${business.code}*`,
    `Importe: *${money(amount, 'CUP')}*`,
    'Te adjunto la captura del pago.',
  ].join('\n')

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">{blocked ? 'Activa tu app' : 'Tu plan'}</h1>
        {blocked && <p className="mt-1 text-slate-600">Tu prueba o tu plan terminó. Elige un plan y paga para que tus clientes vuelvan a reservar. No se ha borrado nada.</p>}
      </div>

      <section className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">Estado</p>
          <p className="text-lg font-bold">
            {status.status === 'prueba' && <>Prueba gratis (todo incluido) · {daysLeft(status.trial_ends_at)} días</>}
            {status.status === 'activo' && <>Plan {PLAN_NAMES[status.plan!]} · hasta el {fullDateFromIso(status.paid_until!, business.timezone)}</>}
            {status.status === 'vencido' && <>Inhabilitada</>}
          </p>
        </div>
        <StatusBadge status={status.status} />
      </section>

      <section>
        <h2 className="mb-2 font-bold">1. Elige tu plan</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {PLAN_ORDER.map((p, i) => (
            <button
              key={p}
              type="button"
              onClick={() => setPlan(p)}
              className={`card text-left transition ${plan === p ? 'ring-2 ring-brand' : 'hover:ring-1 hover:ring-slate-300'}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-lg font-extrabold">{PLAN_NAMES[p]}</span>
                <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${plan === p ? 'border-brand bg-brand' : 'border-slate-300'}`}>
                  {plan === p && <span className="h-2 w-2 rounded-full bg-white" />}
                </span>
              </div>
              <p className="mt-1"><span className="text-xl font-extrabold">{money(info[p], 'CUP')}</span><span className="text-sm text-slate-500"> /mes</span></p>
              <p className="mt-2 text-xs font-semibold text-slate-500">{i === 0 ? 'Incluye:' : `Todo lo de ${PLAN_NAMES[PLAN_ORDER[i - 1]]}, más:`}</p>
              <ul className="mt-1 space-y-0.5 text-sm">
                {PLAN_ADDS[p].map((m) => (
                  <li key={m}>✓ {MODULES[m].name}{!MODULES[m].ready && <span className="text-xs text-slate-400"> (pronto)</span>}</li>
                ))}
              </ul>
            </button>
          ))}
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold">2. ¿Cuántos meses?</h2>
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
        <h2 className="font-bold">3. Transfiere a esta tarjeta</h2>
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
        <h2 className="font-bold">4. Envía la captura por WhatsApp</h2>
        <p className="text-sm text-slate-500">Se abre WhatsApp con el mensaje escrito. Solo adjunta la captura. Activamos tu plan en cuanto confirmemos el pago.</p>
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
                <span>{fullDateFromIso(h.created_at, business.timezone)} · {PLAN_NAMES[h.plan]} · {h.months} {h.months === 1 ? 'mes' : 'meses'}</span>
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
