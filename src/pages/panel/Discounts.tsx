import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, CopyButton, Field, Modal, PageLoader, Toggle, flash } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { longDate, money, todayKey } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import type { Discount } from '../../lib/types'
import { publicUrl } from '../../lib/url'
import { shareLink } from '../../lib/whatsapp'
import { usePanel } from './context'
import { Locked, useModule } from './Locked'

export default function Discounts() {
  const allowed = useModule('descuentos')
  const { business } = usePanel()
  const [list, setList] = useState<Discount[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('discounts').select('*').order('created_at', { ascending: false })
    if (error) setError(errorMessage(error))
    else setList(data as Discount[])
  }, [])

  useEffect(() => {
    if (allowed) load()
  }, [allowed, load])

  if (!allowed) return <Locked module="descuentos" />
  if (error && !list) return <Alert>{error}</Alert>
  if (!list) return <PageLoader />

  const today = todayKey(business.timezone)
  const describe = (d: Discount) => (d.percent ? `${d.percent}% de descuento` : `${money(d.amount, business.currency)} de descuento`)

  const toggle = async (d: Discount, active: boolean) => {
    const { error } = await supabase.from('discounts').update({ active }).eq('id', d.id)
    if (error) return setError(errorMessage(error))
    load()
  }

  const remove = async (d: Discount) => {
    const { error } = await supabase.from('discounts').delete().eq('id', d.id)
    if (error) return setError(errorMessage(error))
    flash('Código borrado')
    load()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Cupones</h1>
          <p className="text-slate-600">Códigos que tus clientes escriben al reservar para tener descuento.</p>
        </div>
        <Button onClick={() => setCreating(true)}>Nuevo código</Button>
      </div>
      {error && <Alert>{error}</Alert>}

      {list.length === 0 && (
        <div className="card text-center text-slate-600">
          Crea un código como <b>BIENVENIDO10</b> y compártelo por WhatsApp o en tus redes.
        </div>
      )}

      <ul className="space-y-2">
        {list.map((d) => {
          const expired = d.valid_until !== null && d.valid_until < today
          const spent = d.max_uses !== null && d.uses >= d.max_uses
          const live = d.active && !expired && !spent
          return (
            <li key={d.id} className={`card ${live ? '' : 'opacity-70'}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-lg font-bold tracking-wide">{d.code}</p>
                  <p className="text-sm text-slate-600">{describe(d)}</p>
                  <p className="text-sm text-slate-500">
                    {d.uses} {d.uses === 1 ? 'uso' : 'usos'}{d.max_uses !== null && ` de ${d.max_uses}`}
                    {d.valid_until && <> · {expired ? 'venció' : 'válido hasta'} el {longDate(d.valid_until)}</>}
                  </p>
                  {!live && (
                    <span className="chip mt-1 bg-slate-100 text-xs text-slate-600">
                      {!d.active ? 'Pausado' : expired ? 'Vencido' : 'Agotado'}
                    </span>
                  )}
                </div>
                <Toggle checked={d.active} onChange={(v) => toggle(d, v)} label="Activo" />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <CopyButton text={d.code} label="Copiar código" />
                <a
                  href={shareLink(`🎁 Usa el código *${d.code}* al reservar en ${business.name} y ten ${describe(d)}.\n${publicUrl(business.slug)}`)}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg px-3 py-1.5 text-sm font-semibold text-brand hover:bg-slate-100"
                >
                  Compartir por WhatsApp
                </a>
                <button onClick={() => remove(d)} className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50">Borrar</button>
              </div>
            </li>
          )
        })}
      </ul>

      {creating && (
        <NewDiscount
          currency={business.currency}
          businessId={business.id}
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false)
            load()
          }}
        />
      )}
    </div>
  )
}

function NewDiscount({ businessId, currency, onClose, onDone }: { businessId: string; currency: string; onClose: () => void; onDone: () => void }) {
  const [code, setCode] = useState('')
  const [kind, setKind] = useState<'percent' | 'amount'>('percent')
  const [value, setValue] = useState(10)
  const [until, setUntil] = useState('')
  const [maxUses, setMaxUses] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (!/^[A-Z0-9-]{3,20}$/.test(code)) return setError('El código debe tener de 3 a 20 letras, números o guiones.')
    if (!(value > 0) || (kind === 'percent' && value > 100)) return setError(kind === 'percent' ? 'El porcentaje va de 1 a 100.' : 'Escribe un importe mayor que 0.')
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('discounts').insert({
      business_id: businessId,
      code,
      percent: kind === 'percent' ? Math.round(value) : null,
      amount: kind === 'amount' ? value : null,
      valid_until: until || null,
      max_uses: maxUses ? Math.max(1, Number(maxUses)) : null,
    })
    setBusy(false)
    if (error) return setError(/duplicate|unique/i.test(error.message) ? 'Ya tienes un código con ese nombre.' : errorMessage(error))
    flash('Código creado')
    onDone()
  }

  return (
    <Modal open onClose={onClose} title="Nuevo código" footer={<Button block onClick={save} loading={busy}>Crear código</Button>}>
      <div className="space-y-4">
        <Field label="Código" hint="Lo que escribe el cliente. Ej. BIENVENIDO10">
          <input className="input font-mono uppercase" value={code} maxLength={20} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          {(['percent', 'amount'] as const).map((k) => (
            <button key={k} onClick={() => setKind(k)} className={`rounded-xl py-2.5 font-semibold ${kind === k ? 'bg-brand text-white' : 'bg-white ring-1 ring-slate-300'}`}>
              {k === 'percent' ? 'Porcentaje' : 'Importe fijo'}
            </button>
          ))}
        </div>
        <Field label={kind === 'percent' ? 'Descuento (%)' : `Descuento (${currency})`}>
          <input className="input" type="number" min={1} max={kind === 'percent' ? 100 : undefined} value={value} onChange={(e) => setValue(Number(e.target.value))} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Válido hasta (opcional)">
            <input className="input" type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
          </Field>
          <Field label="Usos máximos (opcional)">
            <input className="input" type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="Sin límite" />
          </Field>
        </div>
        {error && <Alert>{error}</Alert>}
      </div>
    </Modal>
  )
}
