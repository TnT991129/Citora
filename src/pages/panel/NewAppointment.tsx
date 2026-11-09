import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Alert, Button, Modal, Spinner } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { addDays, cupRate, dayTitle, duration, price, shortDate, time12, todayKey } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import type { CustomerSummary } from '../../lib/types'
import { ServicePicker } from '../public/ServicePicker'
import { applyOptions, missingOption, optionsFor, type OptionChoice } from '../../lib/serviceOptions'
import { usePanel } from './context'

/** Cita añadida por el dueño (por ejemplo, alguien que llamó). Puede ser a cualquier hora. */
export function NewAppointment({ defaultDate, defaultTime = '', onClose, onCreated }: { defaultDate: string; defaultTime?: string; onClose: () => void; onCreated: () => void }) {
  const { business, services, staff } = usePanel()
  const team = staff.filter((s) => s.active)
  const active = useMemo(() => services.filter((s) => s.active), [services])
  const [selected, setSelected] = useState<string[]>([])
  const [choice, setChoice] = useState<OptionChoice>({})
  const [date, setDate] = useState(defaultDate)
  const [time, setTime] = useState(defaultTime)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')
  const [staffId, setStaffId] = useState<string>(team.length === 1 ? team[0].id : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const chosen = applyOptions(active.filter((s) => selected.includes(s.id)), choice)
  const total = chosen.reduce((a, s) => a + Number(s.price), 0)
  const minutes = chosen.reduce((a, s) => a + s.duration_min, 0) || 60
  const rate = cupRate(business)

  const save = async () => {
    if (name.trim().length < 2) return setError('Escribe el nombre del cliente.')
    const noOption = missingOption(active, selected, choice)
    if (noOption) return setError(`Elige una opción de «${noOption.name}».`)
    if (team.length > 0 && !staffId) return setError('Elige con quién es la cita.')
    if (!date) return setError('Elige el día.')
    if (!/^\d{2}:\d{2}$/.test(time)) return setError('Elige la hora.')
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('owner_create_appointment', {
      p_service_ids: selected,
      p_date: date,
      p_time: time,
      p_name: name.trim(),
      p_phone: phone,
      p_note: note.trim() || null,
      p_staff: staffId || null,
      p_options: optionsFor(selected, choice),
    })
    setBusy(false)
    if (error) setError(errorMessage(error))
    else onCreated()
  }

  let n = 0
  return (
    <Modal
      open
      onClose={onClose}
      title="Nueva cita"
      footer={
        <div className="space-y-2">
          {error && <Alert>{error}</Alert>}
          <p className="truncate text-center text-sm text-slate-500">
            {date ? dayTitle(date) : 'Sin día'} · {time ? time12(time) : 'sin hora'} · {duration(minutes)}
          </p>
          <Button block onClick={save} loading={busy}>Guardar cita · {price(total, business.currency, rate)}</Button>
        </div>
      }
    >
      <div className="divide-y divide-slate-100">
        <Section n={++n} title="Cliente">
          <CustomerFields name={name} phone={phone} onName={setName} onPhone={setPhone} />
        </Section>

        <Section n={++n} title="Servicios" aside={chosen.length > 0 ? duration(minutes) : undefined}>
          {active.length === 0
            ? <p className="text-sm text-slate-500">Todavía no tienes servicios. La cita durará 1 hora.</p>
            : <ServicePicker services={active} selected={selected} onChange={setSelected} choice={choice} onChoice={setChoice} currency={business.currency} rate={rate} />}
          {active.length > 0 && chosen.length === 0 && <p className="text-xs text-slate-500">Si no eliges ninguno, la cita durará 1 hora.</p>}
        </Section>

        {team.length > 0 && (
          <Section n={++n} title="Con quién">
            <div className="flex flex-wrap gap-2">
              {team.map((s) => (
                <Chip key={s.id} on={staffId === s.id} onClick={() => { setStaffId(s.id); if (time !== defaultTime) setTime('') }}>
                  {s.photo_url && <img src={s.photo_url} alt="" className="-ml-1.5 h-6 w-6 rounded-full object-cover" />}
                  {s.name}
                </Chip>
              ))}
            </div>
          </Section>
        )}

        <Section n={++n} title="Día y hora">
          <DayStrip today={todayKey(business.timezone)} value={date} onChange={(d) => { setDate(d); setTime('') }} />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Otro día:
            <input type="date" className="input flex-1 py-2" value={date} onChange={(e) => { setDate(e.target.value); setTime('') }} />
          </label>
          {date && (
            <FreeSlots
              slug={business.slug}
              date={date}
              duration={minutes}
              staff={staffId || null}
              serviceIds={selected}
              value={time}
              onChange={setTime}
            />
          )}
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Otra hora:
            <input type="time" className="input flex-1 py-2" value={time} step={300} onChange={(e) => setTime(e.target.value)} />
          </label>
        </Section>

        <Section n={++n} title="Nota" aside="opcional">
          <textarea className="input min-h-[72px]" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. Viene con su hija, prefiere corte bajo…" maxLength={500} />
        </Section>
      </div>
    </Modal>
  )
}

function Section({ n, title, aside, children }: { n: number; title: string; aside?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 py-5 first:pt-1 last:pb-1">
      <div className="flex items-center gap-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand">{n}</span>
        <h3 className="flex-1 font-bold">{title}</h3>
        {aside && <span className="text-sm text-slate-500">{aside}</span>}
      </div>
      {children}
    </section>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold transition ${on ? 'bg-brand text-white shadow' : 'bg-white text-slate-700 ring-1 ring-slate-300 hover:ring-brand'}`}
    >
      {children}
    </button>
  )
}

/** Nombre y teléfono. Al escribir, sugiere clientes que ya vinieron para no teclear su teléfono. */
function CustomerFields({ name, phone, onName, onPhone }: { name: string; phone: string; onName: (v: string) => void; onPhone: (v: string) => void }) {
  const [customers, setCustomers] = useState<CustomerSummary[]>([])
  const [picked, setPicked] = useState(false)

  useEffect(() => {
    supabase.rpc('owner_customers').then(({ data }) => setCustomers((data as CustomerSummary[]) || []))
  }, [])

  const term = name.trim().toLowerCase()
  const digits = term.replace(/\D/g, '')
  const matches = picked || term.length < 2 ? [] : customers
    .filter((c) => c.name.toLowerCase().includes(term) || (digits.length >= 3 && c.phone.includes(digits)))
    .slice(0, 4)

  return (
    <div className="space-y-3">
      <div>
        <input
          className="input"
          value={name}
          onChange={(e) => { onName(e.target.value); setPicked(false) }}
          placeholder="Nombre del cliente"
          autoComplete="off"
          aria-label="Nombre del cliente"
        />
        {matches.length > 0 && (
          <ul className="mt-1.5 overflow-hidden rounded-xl ring-1 ring-slate-200">
            {matches.map((c) => (
              <li key={c.phone}>
                <button
                  type="button"
                  onClick={() => { onName(c.name); onPhone(c.phone); setPicked(true) }}
                  className="flex w-full items-center justify-between gap-3 border-b border-slate-100 bg-white px-3 py-2 text-left text-sm last:border-0 hover:bg-slate-50"
                >
                  <span className="min-w-0 truncate font-semibold">{c.name}</span>
                  <span className="shrink-0 text-xs text-slate-500">{c.phone} · {c.visits} {c.visits === 1 ? 'visita' : 'visitas'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <input
        className="input"
        type="tel"
        inputMode="tel"
        value={phone}
        onChange={(e) => onPhone(e.target.value)}
        placeholder="Teléfono (opcional) · 53 5555 5555"
        aria-label="Teléfono del cliente"
      />
    </div>
  )
}

/** Los próximos 14 días, para elegir con un toque */
function DayStrip({ today, value, onChange }: { today: string; value: string; onChange: (d: string) => void }) {
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i))
  return (
    <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
      {days.map((d, i) => {
        const [wd, num, mon] = shortDate(d).split(' ')
        const on = d === value
        return (
          <button
            key={d}
            type="button"
            onClick={() => onChange(d)}
            className={`flex w-16 shrink-0 flex-col items-center rounded-2xl py-2 text-xs font-semibold transition ${on ? 'bg-brand text-white shadow' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-brand'}`}
          >
            <span>{i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : wd}</span>
            <span className="text-lg font-extrabold leading-tight">{num}</span>
            <span className={on ? 'text-white/80' : 'text-slate-400'}>{mon}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Turnos libres de tu horario ese día, como atajo. Cualquier otra hora se escribe en "Otra hora". */
function FreeSlots({ slug, date, duration: mins, staff, serviceIds, value, onChange }: {
  slug: string; date: string; duration: number; staff: string | null; serviceIds: string[]; value: string; onChange: (t: string) => void
}) {
  const [slots, setSlots] = useState<string[] | null>(null)
  const ids = serviceIds.join(',')

  useEffect(() => {
    let alive = true
    setSlots(null)
    supabase
      .rpc('get_available_slots', { p_slug: slug, p_date: date, p_duration: mins, p_staff: staff, p_service_ids: ids ? ids.split(',') : null })
      .then(({ data }) => {
        if (alive) setSlots(((data as { slot: string; available: boolean }[]) || []).filter((s) => s.available).map((s) => s.slot))
      })
    return () => {
      alive = false
    }
  }, [slug, date, mins, staff, ids])

  if (!slots) return <div className="flex justify-center py-3 text-slate-400"><Spinner /></div>
  if (slots.length === 0) {
    return <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-600">No quedan turnos libres de tu horario este día. Si quieres, escribe la hora abajo.</p>
  }
  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-slate-500">Libres en tu horario</p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {slots.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            className={`rounded-xl px-2 py-2.5 text-sm font-semibold transition ${value === s ? 'bg-brand text-white shadow' : 'bg-white text-slate-800 ring-1 ring-slate-200 hover:ring-brand'}`}
          >
            {time12(s)}
          </button>
        ))}
      </div>
    </div>
  )
}
