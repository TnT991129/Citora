// Pestaña "Cobros": comprobantes que los dueños mandaron desde su panel (por revisar y ya revisados),
// los pagos registrados (cada uno se puede corregir o borrar) y el botón de registrar un pago a mano.
import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Field, Modal, PageLoader, WhatsAppIcon, flash } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { fullDateFromIso, money } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import type { PaymentClaimStatus, PlanKey } from '../../lib/types'
import { waLink } from '../../lib/whatsapp'
import { Icon } from '../panel/Panel'
import { ADMIN_TZ, agoShort, shortDay, type AdminOwner, type OwnerWithBusiness } from './adminData'
import { PageTitle, SectionTitle } from './adminUi'
import { PLANS, planName } from '../../lib/plans'
import { ActivateModal, PickBusinessModal, type Prices } from './OwnerModals'

interface AdminClaim {
  id: string
  business_id: string
  months: number
  amount: number | null
  note: string | null
  proof_path: string | null
  /** El plan que eligió el dueño (falta en declaraciones de antes de la 1.4: Solo) */
  plan?: 'basico' | 'ultra'
  status: PaymentClaimStatus
  admin_note: string | null
  created_at: string
  businesses: { name: string; code: string; whatsapp: string } | null
}

export interface RecentPayment {
  id: string
  name: string
  code: string
  plan: PlanKey
  months: number
  amount: number | null
  note: string | null
  paid_until: string
  /** El negocio ya no existe: corregir el pago solo cambia el historial y las cifras */
  deleted: boolean
  created_at: string
}

const months = (n: number) => `${n} ${n === 1 ? 'mes' : 'meses'}`

export function Payments({ onChanged }: { onChanged: () => void }) {
  const [claims, setClaims] = useState<AdminClaim[] | null>(null)
  const [payments, setPayments] = useState<RecentPayment[]>([])
  const [owners, setOwners] = useState<AdminOwner[]>([])
  const [prices, setPrices] = useState<Prices>({ basico: 1500, plus: 1500, ultra: 1500 })
  const [proofUrls, setProofUrls] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<AdminClaim | null>(null)
  const [picking, setPicking] = useState(false)
  const [manual, setManual] = useState<OwnerWithBusiness | null>(null)
  const [editing, setEditing] = useState<RecentPayment | null>(null)

  const load = useCallback(async () => {
    const [c, s, o, p] = await Promise.all([
      supabase.from('payment_claims').select('*, businesses(name, code, whatsapp)').order('created_at', { ascending: false }).limit(200),
      supabase.rpc('admin_stats'),
      supabase.rpc('admin_list_owners'),
      supabase.rpc('get_public_prices'),
    ])
    if (c.error) return setError(errorMessage(c.error))
    const list = c.data as unknown as AdminClaim[]
    setClaims(list)
    if (!s.error) setPayments((s.data as { recent_payments: RecentPayment[] }).recent_payments)
    if (!o.error) setOwners(o.data as AdminOwner[])
    if (p.data) setPrices(p.data as Prices)
    const paths = list.map((x) => x.proof_path).filter((x): x is string => !!x && !x.startsWith('sin-comprobante'))
    if (paths.length) {
      const { data: signed } = await supabase.storage.from('payment-proofs').createSignedUrls(paths, 3600)
      const urls: Record<string, string> = {}
      signed?.forEach((x) => { if (x.signedUrl && x.path) urls[x.path] = x.signedUrl })
      setProofUrls(urls)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const reload = () => {
    load()
    onChanged()
  }

  const approve = async (c: AdminClaim) => {
    setBusy(c.id)
    const { data, error } = await supabase.rpc('admin_approve_payment_claim', { p_claim_id: c.id })
    setBusy(null)
    if (error) return setError(errorMessage(error))
    flash(`Activo hasta el ${fullDateFromIso(data as string, ADMIN_TZ)}`)
    reload()
  }

  const reject = async (c: AdminClaim, note: string) => {
    setBusy(c.id)
    const { error } = await supabase.rpc('admin_reject_payment_claim', { p_claim_id: c.id, p_note: note || null })
    setBusy(null)
    if (error) return setError(errorMessage(error))
    flash('Comprobante rechazado')
    setRejecting(null)
    reload()
  }

  if (error && !claims) return <Alert>{error}</Alert>
  if (!claims) return <PageLoader />

  const pending = claims.filter((c) => c.status === 'pendiente')
  const reviewed = claims.filter((c) => c.status !== 'pendiente')

  return (
    <div className="space-y-7">
      <PageTitle
        title="Cobros"
        right={<Button variant="secondary" onClick={() => setPicking(true)}><Icon name="plus" className="h-[18px] w-[18px]" /> Registrar pago a mano</Button>}
      />
      {error && <Alert>{error}</Alert>}

      <section>
        <SectionTitle title={`Por revisar · ${pending.length}`} />
        {pending.length === 0 ? (
          <div className="card flex items-center gap-3 text-emerald-800">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600"><Icon name="check" className="h-5 w-5" /></span>
            <p className="font-semibold">No hay comprobantes por revisar.</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {pending.map((c) => {
              const url = c.proof_path ? proofUrls[c.proof_path] : undefined
              return (
                <div key={c.id} className="card grid h-full grid-cols-[88px_minmax(0,1fr)] gap-4 p-4 sm:p-4">
                  {url ? (
                    <a href={url} target="_blank" rel="noreferrer" className="block h-[132px] overflow-hidden rounded-xl ring-1 ring-slate-200" title="Ver la captura en grande">
                      <img src={url} alt="Comprobante" className="h-full w-full object-cover" />
                    </a>
                  ) : (
                    <span className="flex h-[132px] flex-col items-center justify-center gap-1 rounded-xl bg-slate-100 text-center text-xs font-semibold text-slate-400">
                      <Icon name="image" className="h-6 w-6" /> Sin captura
                    </span>
                  )}
                  <div className="flex min-w-0 flex-col">
                    <p className="truncate font-bold">{c.businesses?.name || 'Negocio eliminado'}</p>
                    <p className="truncate text-sm text-slate-500"><b className={c.plan === 'ultra' ? 'text-violet-700' : 'text-slate-700'}>{planName(c.plan || 'basico')}</b> · {months(c.months)} · enviado {agoShort(c.created_at)}</p>
                    <p className="mt-1 text-2xl font-extrabold tracking-tight">{c.amount != null ? money(c.amount, 'CUP') : money((c.plan === 'ultra' ? prices.ultra : prices.basico) * c.months, 'CUP')}</p>
                    {c.amount != null && c.amount < (c.plan === 'ultra' ? prices.ultra : prices.basico) * c.months && (
                      <p className="text-xs font-semibold text-amber-700">Menos de lo que cuesta ({money((c.plan === 'ultra' ? prices.ultra : prices.basico) * c.months, 'CUP')}): revísalo</p>
                    )}
                    {c.note && <p className="truncate text-sm text-slate-600" title={c.note}>"{c.note}"</p>}
                    <div className="mt-auto grid grid-cols-[1fr_1fr_40px] gap-2 pt-3">
                      <Button size="sm" onClick={() => approve(c)} loading={busy === c.id} className="!bg-emerald-600 !bg-none !shadow-emerald-600/25">
                        <Icon name="check" className="h-4 w-4" /> Aprobar
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setRejecting(c)} disabled={busy === c.id}>Rechazar</Button>
                      {c.businesses?.whatsapp ? (
                        <a href={waLink(c.businesses.whatsapp, 'Hola, te escribo de Citora sobre el comprobante que enviaste.')} target="_blank" rel="noreferrer"
                          className="flex items-center justify-center rounded-btn bg-[#25D366] text-white" aria-label="Escribir por WhatsApp">
                          <WhatsAppIcon className="h-4 w-4" />
                        </a>
                      ) : <span />}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section>
        <SectionTitle title="Pagos registrados" right={payments.length > 0 ? <span className="text-xs text-slate-400">Toca uno para corregirlo o borrarlo</span> : undefined} />
        <div className="card overflow-hidden p-0 sm:p-0">
          <div className="grid grid-cols-[64px_minmax(0,1fr)_auto] border-b border-slate-100 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-400 md:grid-cols-[80px_minmax(0,1fr)_96px_128px]">
            <span>Fecha</span><span>Negocio</span><span className="hidden text-right md:block">Meses</span><span className="text-right">Importe</span>
          </div>
          {payments.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">Todavía no hay pagos.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {payments.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => setEditing(p)}
                    className="grid w-full grid-cols-[64px_minmax(0,1fr)_auto] items-center px-4 py-3 text-left transition hover:bg-slate-50 md:grid-cols-[80px_minmax(0,1fr)_96px_128px]"
                    aria-label={`Corregir el pago de ${p.name}`}
                  >
                    <span className="text-slate-400">{shortDay(p.created_at)}</span>
                    <span className="min-w-0 pr-3">
                      <span className="block truncate font-semibold">{p.name}</span>
                      {p.note && <span className="block truncate text-xs text-slate-400">{p.note}</span>}
                      <span className="block text-xs text-slate-400 md:hidden">{planName(p.plan)} · {months(p.months)}</span>
                    </span>
                    <span className="hidden text-right text-slate-500 md:block">{PLANS[p.plan === 'ultra' ? 'ultra' : 'basico'].short} · {months(p.months)}</span>
                    <b className="text-right tabular-nums">{p.amount === null ? '—' : money(Number(p.amount), 'CUP')}</b>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {reviewed.length > 0 && (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-bold text-slate-500 [&::-webkit-details-marker]:hidden">
            <Icon name="chevron" className="h-4 w-4 transition group-open:rotate-90" /> Comprobantes ya revisados ({reviewed.length})
          </summary>
          <ul className="card mt-3 divide-y divide-slate-100 overflow-hidden p-0 text-sm sm:p-0">
            {reviewed.map((c) => (
              <li key={c.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{c.businesses?.name || 'Negocio eliminado'}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {shortDay(c.created_at)} · {months(c.months)}{c.amount != null && <> · {money(c.amount, 'CUP')}</>}
                    {c.status === 'rechazado' && c.admin_note && <> · Motivo: {c.admin_note}</>}
                  </span>
                </span>
                <span className={`chip whitespace-nowrap font-semibold ${c.status === 'aprobado' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}`}>
                  {c.status === 'aprobado' ? 'Aprobado' : 'Rechazado'}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {rejecting && <RejectModal claim={rejecting} busy={busy === rejecting.id} onClose={() => setRejecting(null)} onConfirm={(note) => reject(rejecting, note)} />}
      {picking && <PickBusinessModal owners={owners} onClose={() => setPicking(false)} onPick={(o) => { setPicking(false); setManual(o) }} />}
      {manual && <ActivateModal business={manual} prices={prices} onClose={() => setManual(null)} onDone={() => { setManual(null); reload() }} />}
      {editing && <EditPaymentModal payment={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload() }} />}
    </div>
  )
}

/**
 * Corregir o borrar un pago registrado. Si cambian los meses (o se borra), el negocio gana o pierde
 * esos meses (ver admin_update_payment y admin_delete_payment). Las cifras de Inicio y Números
 * salen de los pagos, así que cambian solas.
 */
function EditPaymentModal({ payment, onClose, onDone }: { payment: RecentPayment; onClose: () => void; onDone: () => void }) {
  const [plan, setPlan] = useState<'basico' | 'ultra'>(payment.plan === 'ultra' ? 'ultra' : 'basico')
  const [count, setCount] = useState(payment.months)
  const [amount, setAmount] = useState(payment.amount === null ? '' : String(Number(payment.amount)))
  const [note, setNote] = useState(payment.note || '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsed = amount.trim() === '' ? null : Number(amount)
  const amountOk = parsed === null || (Number.isFinite(parsed) && parsed >= 0)
  const diff = count - payment.months

  const save = async () => {
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('admin_update_payment', { p_payment: payment.id, p_plan: plan, p_months: count, p_amount: parsed, p_note: note })
    setBusy(false)
    if (error) return setError(errorMessage(error))
    flash('Pago corregido')
    onDone()
  }

  const remove = async () => {
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('admin_delete_payment', { p_payment: payment.id })
    setBusy(false)
    if (error) return setError(errorMessage(error))
    flash('Pago borrado')
    onDone()
  }

  if (confirmDelete) {
    return (
      <Modal
        open
        onClose={onClose}
        title="¿Borrar este pago?"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setConfirmDelete(false)} disabled={busy}>Volver</Button>
            <Button block variant="danger" onClick={remove} loading={busy}>Sí, borrar el pago</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-slate-600">
            Se borra el pago de <b>{payment.name}</b> del {fullDateFromIso(payment.created_at, ADMIN_TZ)}
            {payment.amount !== null && <> ({money(Number(payment.amount), 'CUP')})</>} y deja de contar en tus cifras. No se puede deshacer.
          </p>
          {!payment.deleted && (
            <p className="text-slate-600">
              El negocio <b>pierde {months(payment.months)}</b>. Si ya no le queda nada pagado, vuelve a su prueba si aún la tiene o deja de recibir reservas.
            </p>
          )}
          {error && <Alert>{error}</Alert>}
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Pago · ${payment.name}`}
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setConfirmDelete(true)} disabled={busy} className="!text-red-600">Borrar</Button>
          <Button block onClick={save} loading={busy} disabled={!amountOk}>Guardar cambios</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Registrado el {fullDateFromIso(payment.created_at, ADMIN_TZ)}{payment.code && <> · código <b className="font-mono">{payment.code}</b></>}.
          {!payment.deleted && <> Le dio servicio hasta el {fullDateFromIso(payment.paid_until, ADMIN_TZ)}.</>}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {(['basico', 'ultra'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setPlan(k)}
              aria-pressed={plan === k}
              className={`rounded-xl border p-3 text-left font-bold transition ${plan === k ? 'border-brand bg-brand/5 ring-1 ring-brand' : 'border-slate-200'}`}
            >
              {PLANS[k].short}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Meses">
            <select className="input" value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {Array.from({ length: 24 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Importe recibido (CUP)">
            <input className="input" type="number" inputMode="decimal" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
        </div>
        <Field label="Nota (opcional)">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. Transfermóvil 14:32" />
        </Field>
        {!amountOk && <Alert>Escribe un importe válido (0 o más), o déjalo vacío.</Alert>}
        {payment.deleted
          ? <p className="text-xs text-slate-500">Este negocio ya no existe: solo cambian el historial y tus cifras.</p>
          : diff !== 0 && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {diff > 0 ? <>El negocio <b>gana {months(diff)}</b> de servicio.</> : <>El negocio <b>pierde {months(-diff)}</b> de servicio.</>}
            </p>
          )}
        {error && <Alert>{error}</Alert>}
      </div>
    </Modal>
  )
}

function RejectModal({ claim, busy, onClose, onConfirm }: { claim: AdminClaim; busy: boolean; onClose: () => void; onConfirm: (note: string) => void }) {
  const [note, setNote] = useState('')
  return (
    <Modal
      open
      onClose={onClose}
      title={`Rechazar · ${claim.businesses?.name || 'comprobante'}`}
      footer={<Button block variant="danger" onClick={() => onConfirm(note)} loading={busy}>Rechazar comprobante</Button>}
    >
      <Field label="Motivo (se lo muestra al dueño)">
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. No coincide el comprobante" />
      </Field>
    </Modal>
  )
}
