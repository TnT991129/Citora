import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Empty, PageLoader } from '../../components/ui'
import { fetchAppointments, isActive } from '../../lib/appointments'
import { errorMessage } from '../../lib/errors'
import { addDays, dateKey, money, shortDate, todayKey, weekdayOf, dayTitle } from '../../lib/format'
import type { Appointment } from '../../lib/types'
import { AppointmentRow } from './AppointmentList'
import { AppointmentModal } from './AppointmentModal'
import { usePanel } from './context'
import { NewAppointment } from './NewAppointment'

export default function Agenda() {
  const { business } = usePanel()
  const tz = business.timezone
  const today = todayKey(tz)
  const [view, setView] = useState<'dia' | 'semana'>('dia')
  const [day, setDay] = useState(today)
  const [list, setList] = useState<Appointment[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Appointment | null>(null)
  const [adding, setAdding] = useState(false)
  const [showCancelled, setShowCancelled] = useState(false)

  // La semana empieza en lunes
  const weekStart = addDays(day, -((weekdayOf(day) + 6) % 7))
  const from = view === 'dia' ? day : weekStart
  const to = view === 'dia' ? day : addDays(weekStart, 6)

  const load = useCallback(async () => {
    setList(null)
    try {
      setList(await fetchAppointments(business, from, to))
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [business, from, to])

  useEffect(() => {
    load()
  }, [load])

  const step = view === 'dia' ? 1 : 7
  const visible = (list || []).filter((a) => showCancelled || a.status !== 'cancelada')
  const days = view === 'dia' ? [day] : Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">Agenda</h1>
        <Button size="sm" onClick={() => setAdding(true)}>+ Cita</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl bg-slate-200 p-1">
          {(['dia', 'semana'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${view === v ? 'bg-white shadow-sm' : 'text-slate-600'}`}>
              {v === 'dia' ? 'Día' : 'Semana'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setDay(addDays(day, -step))} className="rounded-lg p-2 hover:bg-slate-200" aria-label="Anterior">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} className="input w-auto py-1.5" />
          <button onClick={() => setDay(addDays(day, step))} className="rounded-lg p-2 hover:bg-slate-200" aria-label="Siguiente">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 6l6 6-6 6" /></svg>
          </button>
          {day !== today && <Button size="sm" variant="ghost" onClick={() => setDay(today)}>Hoy</Button>}
        </div>
        <label className="ml-auto flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} /> Ver canceladas
        </label>
      </div>

      {error && <Alert>{error}</Alert>}
      {!list && !error && <PageLoader />}

      {list && days.map((d) => {
        const items = visible.filter((a) => dateKey(a.starts_at, tz) === d)
        const total = items.filter(isActive).reduce((s, a) => s + Number(a.total), 0)
        return (
          <section key={d}>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className={`font-bold ${d === today ? 'text-brand' : ''}`}>{view === 'dia' ? dayTitle(d) : shortDate(d)}</h2>
              {items.length > 0 && <span className="text-xs text-slate-500">{items.filter(isActive).length} citas · {money(total, business.currency)}</span>}
            </div>
            <div className="space-y-2">
              {items.length === 0 ? (
                view === 'dia' ? <Empty title="Sin citas este día" /> : <p className="rounded-xl bg-white/60 px-3 py-2 text-sm text-slate-400">Sin citas</p>
              ) : (
                items.map((a) => <AppointmentRow key={a.id} a={a} onClick={() => setOpen(a)} />)
              )}
            </div>
          </section>
        )
      })}

      {open && <AppointmentModal appointment={open} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); load() }} />}
      {adding && <NewAppointment defaultDate={day} onClose={() => setAdding(false)} onCreated={() => { setAdding(false); load() }} />}
    </div>
  )
}
