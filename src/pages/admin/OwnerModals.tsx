// Ventanas de las acciones sobre un dueño o su negocio: registrar un pago, regalar o quitar la
// cortesía, inhabilitar, cambiar la zona horaria y eliminar. Todas piden confirmación.
import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Field, flash, Modal } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { fullDateFromIso } from '../../lib/format'
import { SINGLE_PLAN } from '../../lib/plans'
import { supabase } from '../../lib/supabase'
import { TIMEZONES, tzLabel, tzNow } from '../../lib/timezones'
import type { PlanKey } from '../../lib/types'
import { ADMIN_TZ, hasBusiness, type AdminOwner, type OwnerWithBusiness } from './adminData'
import { BizAvatar, StateCell } from './adminUi'

export type Prices = Record<PlanKey, number>

export type ConfirmKind = 'grant' | 'revoke' | 'deactivate'

// Lo que dice cada confirmación
export const CONFIRM: Record<ConfirmKind, (name: string) => { title: string; text: string; confirmLabel: string; danger?: boolean }> = {
  grant: (name) => ({
    title: '¿Regalar Citora para siempre?',
    text: `${name} tendrá todo incluido sin pagar nunca, y no contará en tus ingresos ni en tus estadísticas de pago. Si te equivocas, puedes deshacerlo desde "Más acciones → Quitar la cortesía": volverá exactamente a como está ahora.`,
    confirmLabel: 'Sí, regalar para siempre',
  }),
  revoke: (name) => ({
    title: '¿Quitar la cortesía?',
    text: `${name} vuelve exactamente a como estaba antes de regalársela: su plan y la fecha hasta la que había pagado. Si ya no tenía nada pagado ni prueba vigente, su web dejará de recibir reservas hasta que pague.`,
    confirmLabel: 'Sí, quitar la cortesía',
    danger: true,
  }),
  deactivate: (name) => ({
    title: '¿Inhabilitar este negocio?',
    text: `Los clientes de ${name} no podrán reservar desde ahora y el dueño solo verá la pantalla de pago. No se borra nada: vuelve a funcionar en cuanto registres un pago.`,
    confirmLabel: 'Sí, inhabilitar',
    danger: true,
  }),
}

export function ConfirmModal({ title, text, confirmLabel, danger, busy, onClose, onConfirm }: {
  title: string; text: string; confirmLabel: string; danger?: boolean; busy: boolean; onClose: () => void; onConfirm: () => void
}) {
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button block onClick={onConfirm} loading={busy} className={danger ? '!bg-red-600 !bg-none !shadow-red-600/25' : ''}>{confirmLabel}</Button>
        </div>
      }
    >
      <p className="text-slate-600">{text}</p>
    </Modal>
  )
}

/** Confirmación para borrar para siempre a un dueño: hay que escribir su código (o su correo) */
export function DeleteModal({ owner, onClose, onDone }: { owner: AdminOwner; onClose: () => void; onDone: () => void }) {
  const [typed, setTyped] = useState('')
  const [account, setAccount] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const word = owner.code || owner.email || ''
  const ok = typed.trim().toUpperCase() === word.toUpperCase()

  const remove = async () => {
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('admin_delete_owner', { p_user: owner.user_id, p_delete_account: account })
    setBusy(false)
    if (error) return setError(errorMessage(error))
    flash('Eliminado')
    onDone()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={owner.name ? `Eliminar · ${owner.name}` : 'Eliminar cuenta'}
      footer={<Button block variant="danger" onClick={remove} loading={busy} disabled={!ok}>Eliminar para siempre</Button>}
    >
      <div className="space-y-4">
        <Alert kind="warning">
          {owner.id
            ? <>Se borrarán <b>para siempre</b> su web, sus servicios, su horario, sus citas, sus clientes, sus opiniones y su galería. No se puede deshacer.</>
            : <>Esta cuenta se registró pero no creó ningún negocio.</>}
        </Alert>
        <p className="text-sm text-slate-600">Cuenta: <b>{owner.email}</b></p>
        {owner.id && (
          <label className="flex items-start gap-3 rounded-xl bg-white p-3 ring-1 ring-slate-200">
            <input type="checkbox" className="mt-1 h-5 w-5" checked={account} onChange={(e) => setAccount(e.target.checked)} />
            <span className="text-sm text-slate-700">
              Borrar también su cuenta. Si la dejas, podrá entrar con su correo y crear un negocio nuevo.
            </span>
          </label>
        )}
        <p className="text-sm text-slate-500">Los pagos que te hizo se conservan en tus estadísticas.</p>
        <Field label={`Para confirmar, escribe ${owner.code ? 'su código' : 'su correo'}: ${word}`}>
          <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </Field>
        {error && <Alert>{error}</Alert>}
      </div>
    </Modal>
  )
}

export function ActivateModal({ business, prices, onClose, onDone }: {
  business: { id: string; name: string; code: string }
  prices: Prices
  onClose: () => void
  onDone: () => void
}) {
  const [months, setMonths] = useState(1)
  const [amount, setAmount] = useState<number>(prices.basico)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setAmount(prices.basico * months), [months, prices])

  const activate = async () => {
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.rpc('admin_activate_plan', {
      p_business: business.id,
      p_plan: SINGLE_PLAN,
      p_months: months,
      p_amount: amount,
      p_note: note,
    })
    setBusy(false)
    if (error) return setError(errorMessage(error))
    flash(`Activo hasta el ${fullDateFromIso(data as string, ADMIN_TZ)}`)
    onDone()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Registrar pago · ${business.name}`}
      footer={<Button block onClick={activate} loading={busy}>Confirmar pago y activar</Button>}
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">Código <b className="font-mono">{business.code}</b>. Comprueba que el pago llegó a tu tarjeta antes de activar.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Meses">
            <select className="input" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6, 12].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Importe recibido (CUP)">
            <input className="input" type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          </Field>
        </div>
        <Field label="Nota (opcional)">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. Transfermóvil 14:32" />
        </Field>
        <p className="text-xs text-slate-500">Si todavía tiene meses pagados, los nuevos se suman al final.</p>
        {error && <Alert>{error}</Alert>}
      </div>
    </Modal>
  )
}

/** Elegir a qué negocio registrarle un pago a mano (desde Cobros) */
export function PickBusinessModal({ owners, onClose, onPick }: { owners: AdminOwner[]; onClose: () => void; onPick: (o: OwnerWithBusiness) => void }) {
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    const term = q.trim().toLowerCase()
    return owners
      .filter(hasBusiness)
      .filter((o) => !o.comped)
      .filter((o) => !term || [o.name, o.code, o.email, o.slug, o.whatsapp].some((x) => (x || '').toLowerCase().includes(term)))
  }, [owners, q])

  return (
    <Modal open onClose={onClose} title="¿A qué negocio?">
      <div className="space-y-3">
        <input className="input" autoFocus placeholder="Nombre, código o WhatsApp" value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl ring-1 ring-slate-200">
          {list.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-500">Ningún negocio con ese nombre.</li>}
          {list.map((o) => (
            <li key={o.user_id}>
              <button onClick={() => onPick(o)} className="grid w-full grid-cols-[36px_minmax(0,1fr)_96px] items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50">
                <BizAvatar owner={o} />
                <span className="min-w-0"><span className="block truncate font-semibold">{o.name}</span><span className="block truncate font-mono text-xs text-slate-400">{o.code}</span></span>
                <StateCell owner={o} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  )
}

/** Lista de zonas con la hora que es ahora en cada una. Si la actual no está en la lista, se añade. */
export function TimezoneSelect({ value, onChange }: { value: string; onChange: (tz: string) => void }) {
  const options = TIMEZONES.some((z) => z.tz === value) ? TIMEZONES : [{ tz: value, label: tzLabel(value) }, ...TIMEZONES]
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((z) => {
        const now = tzNow(z.tz)
        return <option key={z.tz} value={z.tz}>{z.label} · {now.time} ({now.offset})</option>
      })}
    </select>
  )
}

export function TimezoneModal({ business, onClose, onDone }: { business: OwnerWithBusiness; onClose: () => void; onDone: () => void }) {
  const current = business.timezone || ADMIN_TZ
  const [tz, setTz] = useState(current)
  const [keep, setKeep] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const change = async () => {
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.rpc('admin_set_timezone', { p_business: business.id, p_timezone: tz, p_keep_times: keep })
    setBusy(false)
    if (error) return setError(errorMessage(error))
    const moved = Number(data) || 0
    flash(`${business.name}: hora de ${tzLabel(tz)}${moved ? ` · ${moved} ${moved === 1 ? 'cita ajustada' : 'citas ajustadas'}` : ''}`)
    onDone()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Zona horaria · ${business.name}`}
      footer={<Button block onClick={change} loading={busy} disabled={tz === current}>Cambiar zona horaria</Button>}
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Ahora usa la hora de <b>{tzLabel(current)}</b> (allí son las {tzNow(current).time}). Su horario, su agenda, sus recordatorios y sus estadísticas van con esta hora.
        </p>
        <Field label="Nueva zona horaria">
          <TimezoneSelect value={tz} onChange={setTz} />
        </Field>
        <p className="text-sm text-slate-500">
          Su horario no cambia de números: si abre a las 9:00, abrirá a las 9:00 de {tzLabel(tz)}.
        </p>
        <label className="flex items-start gap-3 rounded-xl bg-white p-3 ring-1 ring-slate-200">
          <input type="checkbox" className="mt-1 h-5 w-5" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
          <span className="text-sm text-slate-700">
            <b>Mantener la hora de las citas ya reservadas.</b> Una cita de las 10:00 sigue siendo a las 10:00, ahora de la nueva zona (lo normal si la zona estaba mal puesta). Al cliente no le llega ningún aviso.
            Si lo desmarcas, las citas se quedan en el mismo momento real y se verán a otra hora.
          </span>
        </label>
        {error && <Alert>{error}</Alert>}
      </div>
    </Modal>
  )
}
