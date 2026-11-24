import { useEffect, useRef, useState } from 'react'
import { Alert, Button, CopyButton, LinkButton, PageLoader, StatusBadge, WhatsAppIcon, flash } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { daysLeft, fullDateFromIso, money } from '../../lib/format'
import { shrinkImage, imageExt } from '../../lib/image'
import { includedIn, MODULES, planName, PLANS, type PaidPlan } from '../../lib/plans'
import { supabase } from '../../lib/supabase'
import type { PaymentClaim, PlanKey } from '../../lib/types'
import { waLink } from '../../lib/whatsapp'
import { usePanel } from './context'
import { PayPalPay } from './PayPalPay'
import { t } from '../../lib/i18n'

interface PaymentInfo {
  card_number: string
  card_holder: string
  card_phone: string
  admin_whatsapp: string
  /** Precios al mes en la moneda de su versión: CUP (Cuba) o USD (internacional) */
  basico: number
  plus: number
  ultra: number
  currency?: 'CUP' | 'USD'
  /** Versión internacional: Client ID de PayPal para los botones de pago (vacío: aún no se puede pagar) */
  paypal_client_id?: string
}

interface PaymentRow {
  id: string
  plan: PlanKey
  months: number
  amount: number | null
  currency?: 'CUP' | 'USD'
  paid_until: string
  created_at: string
}

export default function PlanPage({ blocked }: { blocked?: boolean }) {
  const { business, status, progress, staff, reloadBusiness } = usePanel()
  const team = staff.filter((s) => s.active).length
  // Plan que paga: el que ya tiene; si no, Equipo si ya usa equipo y Solo si no
  const [plan, setPlan] = useState<PaidPlan>(() => (status.plan === 'ultra' || (!status.plan && team > 0) ? 'ultra' : 'basico'))
  // Prueba: cuántos días le quedan y qué parte ya usó (para la barra)
  const trialLeft = daysLeft(status.trial_ends_at)
  const trialTotal = Math.max(1, Math.round((new Date(status.trial_ends_at).getTime() - new Date(business.created_at).getTime()) / 86400000))
  const trialUsed = Math.min(100, Math.max(4, Math.round(((trialTotal - Math.max(trialLeft, 0)) / trialTotal) * 100)))
  const sinceDays = Math.max(1, Math.ceil((Date.now() - new Date(business.created_at).getTime()) / 86400000))
  // Prueba acabada sin pagar nunca: a los 5 días se borra sola (ver _purge_expired_trials en schema.sql)
  const purgeDay = status.status === 'vencido' && !status.paid_until && !business.comped
    ? fullDateFromIso(new Date(new Date(status.trial_ends_at).getTime() + 5 * 86400000).toISOString(), business.timezone)
    : null
  const [info, setInfo] = useState<PaymentInfo | null>(null)
  const [history, setHistory] = useState<PaymentRow[]>([])
  const [claims, setClaims] = useState<PaymentClaim[]>([])
  const [months, setMonths] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [proofPath, setProofPath] = useState<string | null>(null)
  const [proofPreview, setProofPreview] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const loadClaims = () =>
    supabase.from('payment_claims').select('*').order('created_at', { ascending: false }).limit(10).then(({ data }) => setClaims((data as PaymentClaim[]) || []))

  useEffect(() => {
    supabase.rpc('get_payment_info').then(({ data, error }) => (error ? setError(errorMessage(error)) : setInfo(data as PaymentInfo)))
    supabase.from('payments').select('*').order('created_at', { ascending: false }).limit(12).then(({ data }) => setHistory((data as PaymentRow[]) || []))
    loadClaims()
  }, [])

  if (error) return <Alert>{error}</Alert>
  if (!info) return <PageLoader />

  // Moneda de la mensualidad: CUP en Cuba, USD en la versión internacional (citora-app.com/int/)
  const cur = info.currency || 'CUP'
  const intl = cur === 'USD'
  const price = plan === 'ultra' ? info.ultra : info.basico
  const amount = Math.round(price * months * 100) / 100

  // Pagado con PayPal: los meses ya están sumados (lo confirmó el servidor)
  const paidOnline = async (until: string) => {
    flash(t('¡Pago recibido! Tu app está pagada hasta el {fullDateFromIso}', { fullDateFromIso: fullDateFromIso(until, business.timezone) }))
    await reloadBusiness()
    supabase.from('payments').select('*').order('created_at', { ascending: false }).limit(12).then(({ data }) => setHistory((data as PaymentRow[]) || []))
  }
  const message = [
    t('Hola, acabo de pagar la mensualidad de Citora ({months} {v}).', { months: months, v: months === 1 ? t('mes') : t('meses') }),
    t('Plan: *{name}*', { name: PLANS[plan].name }),
    t('Negocio: *{name}*', { name: business.name }),
    t('Código: *{code}*', { code: business.code }),
    t('Importe: *{money}*', { money: money(amount, cur) }),
    t('Te adjunto la captura del pago.'),
  ].join('\n')

  const uploadProof = async (file: File) => {
    setUploading(true)
    setError(null)
    try {
      const blob = await shrinkImage(file, 1000)
      const path = `${business.id}/pago-${Date.now()}.${imageExt(blob)}`
      const { error: upErr } = await supabase.storage.from('payment-proofs').upload(path, blob, { contentType: blob.type })
      if (upErr) throw upErr
      if (proofPreview) URL.revokeObjectURL(proofPreview)
      setProofPath(path)
      setProofPreview(URL.createObjectURL(blob))
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setUploading(false)
    }
  }

  const removeProof = () => {
    if (proofPreview) URL.revokeObjectURL(proofPreview)
    setProofPath(null)
    setProofPreview(null)
  }

  const submitClaim = async () => {
    if (!proofPath) return
    setSubmitting(true)
    setError(null)
    const { error } = await supabase.rpc('submit_payment_claim', {
      p_months: months, p_amount: amount, p_note: note.trim() || null, p_proof_path: proofPath, p_plan: plan,
    })
    setSubmitting(false)
    if (error) return setError(errorMessage(error))
    flash(t('Pago declarado, lo revisamos pronto'))
    removeProof()
    setNote('')
    loadClaims()
  }

  // Cortesía: no paga mensualidad; no se le enseñan planes, tarjeta ni pagos
  if (business.comped && !blocked) {
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-extrabold">{t('Mensualidad')}</h1>
        <section className="card text-center">
          <p className="text-4xl" aria-hidden>🎁</p>
          <h2 className="mt-2 text-xl font-extrabold">{t('Tienes')}{' '}{planName(status.plan)} {t('gratis')}</h2>
          <p className="mt-2 text-slate-600">
            {t('Es una cortesía de Citora:')}{' '}<b>{t('no tienes que pagar mensualidad')}</b>{t('. Tu app funciona con todo incluido')}{status.plan === 'ultra' ? t(', equipo incluido,') : ''} {t('y sin fecha de vencimiento.')}
          </p>
        </section>
        {progress && progress.bookings > 0 && (
          <div className="grid grid-cols-3 gap-2.5">
            {[
              [String(progress.bookings), progress.bookings === 1 ? 'reserva' : 'reservas'],
              [String(progress.web_total), t('por tu enlace')],
              [money(progress.revenue, business.currency).replace(/\s*[A-Z]{3}$/, ''), t('{currency} en citas hechas', { currency: business.currency })],
            ].map(([v, l]) => (
              <div key={l} className="card p-3.5 text-center">
                <p className="truncate text-2xl font-extrabold tracking-tight">{v}</p>
                <p className="text-xs font-medium text-slate-500">{l}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">{blocked ? t('Activa tu app') : t('Mensualidad')}</h1>
        {blocked && (
          <p className="mt-1 text-slate-600">
            {t('Tu prueba o tu mensualidad terminó. Paga la mensualidad para que tus clientes vuelvan a reservar.')}{' '}
            {purgeDay ? <b>{t('Si no pagas, tu app se borra para siempre el')}{' '}{purgeDay}.</b> : t('No se ha borrado nada.')}
          </p>
        )}
      </div>

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-lg font-bold">
            {status.status === 'prueba' && <>{t('Prueba gratis, con todo incluido (plan Equipo)')}</>}
            {status.status === 'activo' && <>{planName(status.plan)} {t('· pagado hasta el')}{' '}{fullDateFromIso(status.paid_until!, business.timezone)}</>}
            {status.status === 'vencido' && <>{t('Inhabilitada')}</>}
          </p>
          {status.status === 'prueba'
            ? <span className="chip bg-brand/10 text-brand">{trialLeft <= 0 ? t('Último día') : t('Quedan {trialLeft} {v}', { trialLeft: trialLeft, v: trialLeft === 1 ? t('día') : t('días') })}</span>
            : <StatusBadge status={status.status} />}
        </div>
        {status.status === 'prueba' && (
          <>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-brand transition-all duration-700" style={{ width: `${trialUsed}%` }} />
            </div>
            <p className="mt-2 text-sm text-slate-500">
              {t('Termina el')}{' '}{fullDateFromIso(status.trial_ends_at, business.timezone)}{t('. Si no pagas, tu página deja de aceptar reservas, y a los 5 días tu app se borra.')}
            </p>
          </>
        )}
      </section>

      {progress && progress.bookings > 0 && !blocked && (
        <section>
          <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
            {status.status === 'prueba' ? t('En estos {sinceDays} {v}, Citora te trajo', { sinceDays: sinceDays, v: sinceDays === 1 ? t('día') : t('días') }) : t('Desde que usas Citora')}
          </h2>
          <div className="grid grid-cols-3 gap-2.5">
            {[
              [String(progress.bookings), progress.bookings === 1 ? 'reserva' : 'reservas'],
              [String(progress.web_total), t('por tu enlace')],
              [money(progress.revenue, business.currency).replace(/\s*[A-Z]{3}$/, ''), t('{currency} en citas hechas', { currency: business.currency })],
            ].map(([v, l]) => (
              <div key={l} className="card p-3.5 text-center">
                <p className="truncate text-2xl font-extrabold tracking-tight">{v}</p>
                <p className="text-xs font-medium text-slate-500">{l}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="px-1 font-bold">{t('1. Elige tu plan')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {(['basico', 'ultra'] as const).map((k) => {
            const on = plan === k
            return (
              <button
                key={k}
                type="button"
                onClick={() => setPlan(k)}
                aria-pressed={on}
                className={`card text-left transition ${on ? 'border-brand bg-brand/5 ring-2 ring-brand' : 'hover:border-slate-300'}`}
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block text-lg font-extrabold">{PLANS[k].name}</span>
                    <span className="block text-sm text-slate-500">{PLANS[k].desc}</span>
                  </span>
                  <span className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${on ? 'border-brand bg-brand text-white' : 'border-slate-300'}`} aria-hidden>
                    {on && <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>}
                  </span>
                </span>
                <span className="mt-3 block"><span className="text-2xl font-extrabold">{money(k === 'ultra' ? info.ultra : info.basico, cur)}</span><span className="text-sm text-slate-500"> {t('/mes')}</span></span>
                <span className="mt-2 block text-sm text-slate-600">
                  {k === 'ultra' ? <>{t('✓ Todo lo de Solo')}<br />{t('✓ Tu equipo: cada persona con sus servicios, su horario y su enlace')}</> : <>✓ {includedIn('basico').length} {t('funciones: reservas, agenda, clientes, WhatsApp, cupones…')}<br /><span className="text-slate-400">{t('✗ Sin equipo (una sola agenda)')}</span></>}
                </span>
              </button>
            )
          })}
        </div>
        {plan === 'basico' && (business.slot_capacity || 1) > 1 && (
          <Alert kind="warning">
            {t('Ahora atiendes a')}{' '}{business.slot_capacity} {t('clientes a la vez. Con Solo, solo se puede reservar 1 cliente por turno. Si vuelves a Equipo, recuperas los')}{' '}{business.slot_capacity}.
          </Alert>
        )}
        {plan === 'basico' && team > 0 && (
          <Alert kind="warning">
            {t('Tienes')}{' '}{team === 1 ? t('1 persona') : t('{team} personas', { team: team })} {t('en tu equipo. Con Solo, tu equipo deja de verse en tu página y no recibe citas nuevas (todas van a tu agenda). No se borra nada: si vuelves a Equipo, aparece otra vez.')}
          </Alert>
        )}
        <details className="px-1 text-sm text-slate-500">
          <summary className="cursor-pointer font-semibold">{t('Todo lo que incluye')}{' '}{PLANS[plan].name}</summary>
          <ul className="mt-2 grid gap-0.5 sm:grid-cols-2">
            {includedIn(plan).map((m) => <li key={m}>✓ {MODULES[m].name}</li>)}
          </ul>
        </details>
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold">{t('2. ¿Cuántos meses?')}</h2>
        <div className="flex gap-2">
          {[1, 2, 3, 6].map((m) => (
            <button key={m} onClick={() => setMonths(m)} className={`flex-1 rounded-xl py-2.5 font-semibold ${months === m ? 'bg-brand text-white' : 'bg-white ring-1 ring-slate-300'}`}>
              {m} {m === 1 ? t('mes') : t('meses')}
            </button>
          ))}
        </div>
        <p className="text-lg">{t('Total a pagar:')}{' '}<b>{money(amount, cur)}</b></p>
      </section>

      {intl ? (
        // Versión internacional: pago automático, sin capturas ni esperas
        <section className="card space-y-3">
          <h2 className="font-bold">{t('3. Paga')}{' '}{money(amount, cur)}</h2>
          <p className="text-sm text-slate-500">{t('Con PayPal o con tarjeta, sin necesidad de cuenta. Tu app se activa al momento.')}</p>
          {info.paypal_client_id ? (
            <PayPalPay clientId={info.paypal_client_id} plan={plan} months={months} onPaid={paidOnline} />
          ) : (
            <Alert kind="warning">{t('El pago en línea se activa muy pronto. Si tu prueba termina antes, escríbenos y te ayudamos.')}</Alert>
          )}
        </section>
      ) : (
      <section className="card space-y-3">
        <h2 className="font-bold">{t('3. Transfiere a esta tarjeta')}</h2>
        {info.card_number ? (
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="font-mono text-lg font-bold tracking-wider">{info.card_number}</p>
            {info.card_holder && <p className="text-sm text-slate-600">{info.card_holder}</p>}
            <div className="mt-2 flex gap-2">
              <CopyButton text={info.card_number.replace(/\s/g, '')} label={t('Copiar número')} />
              <CopyButton text={String(amount)} label={t('Copiar importe')} />
            </div>
          </div>
        ) : (
          <Alert kind="warning">{t('Todavía no hay tarjeta configurada. Escribe por WhatsApp para pagar.')}</Alert>
        )}
        {info.card_phone && (
          <div className="rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
            <p className="text-sm text-amber-800">{t('Si tu app pide un')}{' '}<b>{t('teléfono para confirmar')}</b> {t('la transferencia, usa este:')}</p>
            <div className="mt-1 flex items-center gap-2">
              <p className="font-mono text-lg font-bold tracking-wider">{info.card_phone}</p>
              <CopyButton text={info.card_phone.replace(/\s/g, '')} label={t('Copiar')} />
            </div>
          </div>
        )}
        <p className="text-sm text-slate-500">{t('Por Transfermóvil o EnZona. Haz una captura de pantalla del comprobante.')}</p>
      </section>
      )}

      {!intl && (
      <section className="card space-y-3">
        <h2 className="font-bold">{t('4. Declara tu pago')}</h2>
        <p className="text-sm text-slate-500">{t('Sube la captura')}{' '}{intl ? t('del pago') : t('de la transferencia')}{t('. La revisamos y activamos tu mes en cuanto la confirmemos.')}</p>
        <Alert kind="info">{t('Demoramos un máximo de 24 horas en confirmar tu pago.')}</Alert>
        {proofPreview ? (
          <div className="flex items-center gap-3">
            <img src={proofPreview} alt="" className="h-20 w-20 rounded-xl object-cover ring-1 ring-slate-200" />
            <Button variant="ghost" size="sm" onClick={removeProof}>{t('Quitar')}</Button>
          </div>
        ) : (
          <Button variant="secondary" onClick={() => fileRef.current?.click()} loading={uploading}>{t('Subir captura')}</Button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) uploadProof(f)
            e.target.value = ''
          }}
        />
        <input className="input" placeholder={intl ? t('Nota (opcional, ej. el nombre o correo de quien pagó)') : t('Nota (opcional, ej. últimos dígitos de la tarjeta)')} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
        {!proofPath && <p className="text-sm text-amber-700">{t('Sube la captura para poder declarar el pago.')}</p>}
        <Button block size="lg" onClick={submitClaim} loading={submitting} disabled={!proofPath}>{t('Declarar pago de')}{' '}{money(amount, cur)}</Button>
        {info.admin_whatsapp && (
          <LinkButton href={waLink(info.admin_whatsapp, message)} variant="ghost" size="sm" newTab>
            <WhatsAppIcon className="h-4 w-4" /> {t('O avísanos por WhatsApp')}
          </LinkButton>
        )}
      </section>
      )}

      {claims.length > 0 && (
        <section className="card">
          <h2 className="font-bold">{t('Tus declaraciones')}</h2>
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {claims.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                <span>
                  {fullDateFromIso(c.created_at, business.timezone)} · {c.months} {c.months === 1 ? t('mes') : t('meses')}
                  {c.amount != null && <> · {money(c.amount, c.currency || 'CUP')}</>}
                  {c.status === 'rechazado' && c.admin_note && <span className="block text-xs text-red-600">{c.admin_note}</span>}
                </span>
                <span className={`chip text-xs ${
                  c.status === 'aprobado' ? 'bg-emerald-100 text-emerald-700' : c.status === 'rechazado' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {c.status === 'aprobado' ? t('Aprobado') : c.status === 'rechazado' ? t('Rechazado') : t('Pendiente')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {history.length > 0 && (
        <section className="card">
          <h2 className="font-bold">{t('Pagos confirmados')}</h2>
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex justify-between py-2">
                <span>{fullDateFromIso(h.created_at, business.timezone)} · {h.months} {h.months === 1 ? t('mes') : t('meses')}</span>
                {h.amount != null && <span className="font-semibold">{money(h.amount, h.currency || 'CUP')}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {blocked && (
        <Button variant="ghost" onClick={() => supabase.auth.signOut()}>{t('Cerrar sesión')}</Button>
      )}
    </div>
  )
}
