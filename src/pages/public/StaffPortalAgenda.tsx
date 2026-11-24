// Panel de una profesional con su enlace privado: su agenda (ver, confirmar, marcar si vino,
// cancelar, escribir al cliente y apuntar citas a mano) y sus números. Solo ve SUS citas: todo pasa
// por staff_portal_agenda / _set_status / _create_appointment / _stats (schema.sql).
import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Field, Modal, StatusBadge, WhatsAppIcon, flash } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { addDays, dateKey, dayTitle, money, timeOf, todayKey, WEEKDAYS_SHORT, weekdayOf } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import type { AppointmentStatus } from '../../lib/types'
import { waLink } from '../../lib/whatsapp'
import { t as tx } from '../../lib/i18n'
import { IS_INT } from '../../lib/market'

export interface PortalAppt {
  id: string
  starts_at: string
  ends_at: string
  status: AppointmentStatus
  customer_name: string
  customer_phone: string
  customer_note: string | null
  total: number
  source: 'web' | 'manual'
  services: string[]
}

interface Ctx { token: string; tz: string; currency: string; businessName: string; services: { id: string; name: string; active: boolean; shared: boolean }[] }

const mondayOf = (key: string) => addDays(key, -((weekdayOf(key) + 6) % 7))

export function StaffAgenda({ token, tz, currency, businessName, services }: Ctx) {
  const today = todayKey(tz)
  const [day, setDay] = useState(today)
  const [list, setList] = useState<PortalAppt[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const week = mondayOf(day)

  const load = useCallback(async () => {
    setError(null)
    const { data, error } = await supabase.rpc('staff_portal_agenda', { p_token: token, p_from: week, p_to: addDays(week, 6) })
    if (error) return setError(errorMessage(error))
    setList(data as PortalAppt[])
  }, [token, week])

  useEffect(() => {
    setList(null)
    load()
  }, [load])

  const setStatus = async (a: PortalAppt, status: AppointmentStatus) => {
    if (status === 'cancelada' && !window.confirm(tx('¿Cancelar la cita de {customer_name}?', { customer_name: a.customer_name }))) return
    setBusy(a.id + status)
    const { error } = await supabase.rpc('staff_portal_set_status', { p_token: token, p_id: a.id, p_status: status })
    setBusy(null)
    if (error) return setError(errorMessage(error))
    load()
  }

  const ofDay = (list || []).filter((a) => dateKey(a.starts_at, tz) === day)
  const active = (a: PortalAppt) => a.status !== 'cancelada' && a.status !== 'no_asistio'
  const count = (d: string) => (list || []).filter((a) => dateKey(a.starts_at, tz) === d && active(a)).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button onClick={() => setDay(addDays(day, -7))} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label={tx('Semana anterior')}>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          <button onClick={() => setDay(addDays(day, 7))} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label={tx('Semana siguiente')}>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 6l6 6-6 6" /></svg>
          </button>
          {day !== today && <button onClick={() => setDay(today)} className="rounded-lg px-2 py-1 text-sm font-semibold text-brand">{tx('Hoy')}</button>}
        </div>
        <Button size="sm" onClick={() => setAdding(true)}>{tx('+ Cita')}</Button>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: 7 }, (_, i) => addDays(week, i)).map((d) => {
          const sel = d === day
          const n = count(d)
          return (
            <button
              key={d}
              onClick={() => setDay(d)}
              aria-pressed={sel}
              className={`flex flex-col items-center gap-1 rounded-2xl py-2.5 transition ${sel ? 'bg-brand text-white shadow-md shadow-brand/30' : d === today ? 'bg-white ring-1 ring-brand/40' : 'bg-white ring-1 ring-slate-200/80'}`}
            >
              <span className={`text-[11px] font-semibold ${sel ? 'text-white/80' : 'text-slate-400'}`}>{WEEKDAYS_SHORT[weekdayOf(d)]}</span>
              <span className="text-lg font-extrabold leading-none">{Number(d.slice(8))}</span>
              <span className="flex h-1.5 gap-0.5" aria-label={n === 1 ? tx('1 cita') : tx('{n} citas', { n })}>
                {Array.from({ length: Math.min(n, 4) }, (_, k) => <span key={k} className={`h-1.5 w-1.5 rounded-full ${sel ? 'bg-white/80' : 'bg-brand/50'}`} />)}
              </span>
            </button>
          )
        })}
      </div>

      <h2 className="font-extrabold tracking-tight">{day === today ? tx('Hoy') : dayTitle(day)}</h2>
      {error && <Alert>{error}</Alert>}
      {!list ? (
        <p className="text-sm text-slate-400">{tx('Cargando…')}</p>
      ) : ofDay.length === 0 ? (
        <div className="card text-center text-slate-500">{tx('No tienes citas este día.')}</div>
      ) : (
        <ul className="space-y-2">
          {ofDay.map((a) => (
            <li key={a.id} className={`card space-y-2.5 ${a.status === 'cancelada' ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-brand">{timeOf(a.starts_at, tz, true)} – {timeOf(a.ends_at, tz, true)}</p>
                  <p className={`truncate font-semibold ${a.status === 'cancelada' ? 'line-through' : ''}`}>{a.customer_name}</p>
                  <p className="truncate text-sm text-slate-500">{a.services.join(', ') || tx('Sin servicio')} · {money(a.total, currency)}</p>
                  {a.customer_note && <p className="mt-1 text-sm text-slate-600">“{a.customer_note}”</p>}
                </div>
                <StatusBadge status={a.status} />
              </div>
              {a.status !== 'cancelada' && (
                <div className="flex flex-wrap gap-2">
                  {a.status === 'pendiente' && <Button size="sm" onClick={() => setStatus(a, 'confirmada')} loading={busy === a.id + 'confirmada'}>{tx('Confirmar')}</Button>}
                  {(a.status === 'pendiente' || a.status === 'confirmada') && (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => setStatus(a, 'completada')} loading={busy === a.id + 'completada'}>{tx('Vino ✓')}</Button>
                      <Button size="sm" variant="secondary" onClick={() => setStatus(a, 'no_asistio')} loading={busy === a.id + 'no_asistio'}>{tx('No vino')}</Button>
                      <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setStatus(a, 'cancelada')} loading={busy === a.id + 'cancelada'}>{tx('Cancelar')}</Button>
                    </>
                  )}
                  {(a.status === 'completada' || a.status === 'no_asistio') && (
                    <Button size="sm" variant="ghost" onClick={() => setStatus(a, 'confirmada')} loading={busy === a.id + 'confirmada'}>{tx('Volver a confirmada')}</Button>
                  )}
                  {a.customer_phone.length >= 8 && (
                    <a
                      href={waLink(a.customer_phone, tx('Hola {v}, te escribo de {businessName} por tu cita del {toLowerCase} a las {timeOf}.', { v: a.customer_name.split(' ')[0], businessName: businessName, toLowerCase: dayTitle(dateKey(a.starts_at, tz)).toLowerCase(), timeOf: timeOf(a.starts_at, tz, true) }))}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-btn bg-[#25D366] px-3 py-1.5 text-sm font-semibold text-white"
                    >
                      <WhatsAppIcon className="h-4 w-4" /> {tx('Escribir')}
                    </a>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <NewStaffAppointment
          token={token}
          defaultDate={day < today ? today : day}
          services={services.filter((s) => s.active)}
          onClose={() => setAdding(false)}
          onCreated={(d) => {
            setAdding(false)
            flash(tx('Cita apuntada'))
            setDay(d)
            load()
          }}
        />
      )}
    </div>
  )
}

function NewStaffAppointment({ token, defaultDate, services, onClose, onCreated }: {
  token: string
  defaultDate: string
  services: { id: string; name: string }[]
  onClose: () => void
  onCreated: (date: string) => void
}) {
  const [picked, setPicked] = useState<string[]>([])
  const [date, setDate] = useState(defaultDate)
  const [time, setTime] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (picked.length === 0) return setError(tx('Elige al menos un servicio.'))
    if (!date || !time) return setError(tx('Elige el día y la hora.'))
    if (name.trim().length < 2) return setError(tx('Escribe el nombre del cliente.'))
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('staff_portal_create_appointment', {
      p_token: token, p_service_ids: picked, p_date: date, p_time: time, p_name: name.trim(), p_phone: phone, p_note: note.trim() || null,
    })
    setBusy(false)
    if (error) return setError(errorMessage(error))
    onCreated(date)
  }

  return (
    <Modal open onClose={onClose} title={tx('Nueva cita')} footer={<Button block size="lg" onClick={save} loading={busy}>{tx('Guardar cita')}</Button>}>
      <div className="space-y-4">
        <div>
          <p className="label">{tx('Qué se va a hacer')}</p>
          {services.length === 0 ? (
            <p className="text-sm text-slate-500">{tx('Primero crea tus servicios en la pestaña Servicios.')}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {services.map((s) => {
                const on = picked.includes(s.id)
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setPicked((p) => (on ? p.filter((x) => x !== s.id) : [...p, s.id]))}
                    aria-pressed={on}
                    className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${on ? 'bg-brand text-white shadow' : 'bg-white text-slate-700 ring-1 ring-slate-300'}`}
                  >
                    {on ? '✓ ' : ''}{s.name}
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={tx('Día')}><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label={tx('Hora')}><input type="time" className="input" value={time} step={300} onChange={(e) => setTime(e.target.value)} /></Field>
        </div>
        <Field label={tx('Cliente')}><input className="input" value={name} maxLength={80} placeholder={tx('Nombre')} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label={tx('WhatsApp (opcional)')}><input className="input" inputMode="tel" value={phone} placeholder={IS_INT ? '1 305 555 1234' : '53 5555 5555'} onChange={(e) => setPhone(e.target.value)} /></Field>
        <Field label={tx('Nota (opcional)')}><input className="input" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} /></Field>
        {error && <Alert>{error}</Alert>}
      </div>
    </Modal>
  )
}

interface PortalStats {
  days: number
  appointments: number
  done: number
  no_show: number
  cancelled: number
  revenue: number
  customers: number
  upcoming: number
  top_services: { name: string; count: number }[]
}

export function StaffStats({ token, currency }: { token: string; currency: string }) {
  const [days, setDays] = useState(30)
  const [s, setS] = useState<PortalStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setS(null)
    supabase.rpc('staff_portal_stats', { p_token: token, p_days: days }).then(({ data, error }) => (error ? setError(errorMessage(error)) : setS(data as PortalStats)))
  }, [token, days])

  const max = Math.max(1, ...(s?.top_services || []).map((t) => t.count))
  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-full bg-slate-100 p-1" role="tablist" aria-label={tx('Periodo')}>
        {[7, 30, 90].map((d) => (
          <button key={d} role="tab" aria-selected={days === d} onClick={() => setDays(d)}
            className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${days === d ? 'bg-white text-slate-900 shadow' : 'text-slate-500'}`}>
            {d} {tx('días')}
          </button>
        ))}
      </div>
      {error && <Alert>{error}</Alert>}
      {!s ? (
        <p className="text-sm text-slate-400">{tx('Cargando…')}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {([
              [money(s.revenue, currency), tx('Ingresos (citas hechas)')],
              [String(s.done), tx('Citas hechas')],
              [String(s.customers), tx('Clientes distintos')],
              [String(s.no_show), tx('No vinieron')],
              [String(s.cancelled), tx('Canceladas')],
              [String(s.upcoming), tx('Próximas citas')],
            ] as const).map(([v, l]) => (
              <div key={l} className="card p-3.5">
                <p className="truncate text-xl font-extrabold tracking-tight">{v}</p>
                <p className="text-xs font-medium text-slate-500">{l}</p>
              </div>
            ))}
          </div>
          <section className="card">
            <h2 className="font-bold">{tx('Lo que más te piden')}</h2>
            {s.top_services.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">{tx('Todavía no hay citas en estos días.')}</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {s.top_services.map((t) => (
                  <li key={t.name}>
                    <div className="flex justify-between text-sm"><span className="truncate font-semibold">{t.name}</span><span className="text-slate-500">{t.count}</span></div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand" style={{ width: `${(t.count / max) * 100}%` }} /></div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <p className="text-center text-xs text-slate-400">{tx('Solo cuentan tus citas de los últimos')}{' '}{s.days} {tx('días.')}</p>
        </>
      )}
    </div>
  )
}
