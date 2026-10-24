import { useEffect, useRef, useState } from 'react'
import { Alert, Button, CopyButton, LinkButton, PageLoader, StatusBadge, WhatsAppIcon, flash } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { daysLeft, fullDateFromIso, money } from '../../lib/format'
import { shrinkImage, imageExt } from '../../lib/image'
import { INCLUDED, MODULES, PLAN_LABEL } from '../../lib/plans'
import { supabase } from '../../lib/supabase'
import type { PaymentClaim, PlanKey } from '../../lib/types'
import { waLink } from '../../lib/whatsapp'
import { usePanel } from './context'

interface PaymentInfo {
  card_number: string
  card_holder: string
  card_phone: string
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

  const price = info.basico
  const amount = price * months
  const message = [
    `Hola, acabo de pagar la mensualidad de Citora (${months} ${months === 1 ? 'mes' : 'meses'}).`,
    `Negocio: *${business.name}*`,
    `Código: *${business.code}*`,
    `Importe: *${money(amount, 'CUP')}*`,
    'Te adjunto la captura del pago.',
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
      p_months: months, p_amount: amount, p_note: note.trim() || null, p_proof_path: proofPath,
    })
    setSubmitting(false)
    if (error) return setError(errorMessage(error))
    flash('Pago declarado, lo revisamos pronto')
    removeProof()
    setNote('')
    loadClaims()
  }

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
        {info.card_phone && (
          <div className="rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
            <p className="text-sm text-amber-800">Si tu app pide un <b>teléfono para confirmar</b> la transferencia, usa este:</p>
            <div className="mt-1 flex items-center gap-2">
              <p className="font-mono text-lg font-bold tracking-wider">{info.card_phone}</p>
              <CopyButton text={info.card_phone.replace(/\s/g, '')} label="Copiar" />
            </div>
          </div>
        )}
        <p className="text-sm text-slate-500">Por Transfermóvil o EnZona. Haz una captura de pantalla del comprobante.</p>
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold">3. Declara tu pago</h2>
        <p className="text-sm text-slate-500">Sube la captura de la transferencia. La revisamos y activamos tu mes en cuanto la confirmemos — normalmente más rápido que por WhatsApp.</p>
        {proofPreview ? (
          <div className="flex items-center gap-3">
            <img src={proofPreview} alt="" className="h-20 w-20 rounded-xl object-cover ring-1 ring-slate-200" />
            <Button variant="ghost" size="sm" onClick={removeProof}>Quitar</Button>
          </div>
        ) : (
          <Button variant="secondary" onClick={() => fileRef.current?.click()} loading={uploading}>Subir captura</Button>
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
        <input className="input" placeholder="Nota (opcional, ej. últimos dígitos de la tarjeta)" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
        {!proofPath && <p className="text-sm text-amber-700">Sube la captura para poder declarar el pago.</p>}
        <Button block size="lg" onClick={submitClaim} loading={submitting} disabled={!proofPath}>Declarar pago de {money(amount, 'CUP')}</Button>
        {info.admin_whatsapp && (
          <LinkButton href={waLink(info.admin_whatsapp, message)} variant="ghost" size="sm" newTab>
            <WhatsAppIcon className="h-4 w-4" /> O avísanos por WhatsApp
          </LinkButton>
        )}
      </section>

      {claims.length > 0 && (
        <section className="card">
          <h2 className="font-bold">Tus declaraciones</h2>
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {claims.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                <span>
                  {fullDateFromIso(c.created_at, business.timezone)} · {c.months} {c.months === 1 ? 'mes' : 'meses'}
                  {c.amount != null && <> · {money(c.amount, 'CUP')}</>}
                  {c.status === 'rechazado' && c.admin_note && <span className="block text-xs text-red-600">{c.admin_note}</span>}
                </span>
                <span className={`chip text-xs ${
                  c.status === 'aprobado' ? 'bg-emerald-100 text-emerald-700' : c.status === 'rechazado' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {c.status === 'aprobado' ? 'Aprobado' : c.status === 'rechazado' ? 'Rechazado' : 'Pendiente'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

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
