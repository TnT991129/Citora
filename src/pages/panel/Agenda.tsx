import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Empty, PageLoader } from '../../components/ui'
import { fetchAppointments, isActive } from '../../lib/appointments'
import { errorMessage } from '../../lib/errors'
import { addDays, dateKey, money, MONTHS, shortDate, todayKey, WEEKDAYS_SHORT, weekdayOf, dayTitle } from '../../lib/format'
import { load as loadPref, save as savePref } from '../../lib/storage'
import type { Appointment } from '../../lib/types'
import { AppointmentRow } from './AppointmentList'
import { AppointmentModal } from './AppointmentModal'
import { usePanel } from './context'
import { NewAppointment } from './NewAppointment'

type View = 'dia' | 'semana' | 'mes'
const VIEWS: { key: View; label: string }[] = [
  { key: 'dia', label: 'Día' },
  { key: 'semana', label: 'Semana' },
  { key: 'mes', label: 'Mes' },
]

/** Lunes de la semana de un día */
const mondayOf = (d: string) => addDays(d, -((weekdayOf(d) + 6) % 7))

/** Mismo día (o el último que exista) de otro mes */
function shiftMonth(d: string, n: number): string {
  const [y, m] = d.split('-').map(Number)
  const first = new Date(Date.UTC(y, m - 1 + n, 1))
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  first.setUTCDate(Math.min(Number(d.slice(8)), last))
  return first.toISOString().slice(0, 10)
}

export default function Agenda() {
  const { business } = usePanel()
  const tz = business.timezone
  const today = todayKey(tz)
  const [view, setViewState] = useState<View>(() => {
    const v = loadPref<View>('citora:agenda-vista', 'dia')
    return v === 'semana' || v === 'mes' ? v : 'dia'
  })
  const [day, setDay] = useState(today)
  const [list, setList] = useState<Appointment[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Appointment | null>(null)
  const [adding, setAdding] = useState(false)
  const [showCancelled, setShowCancelled] = useState(false)

  const setView = (v: View) => {
    setViewState(v)
    savePref('citora:agenda-vista', v)
  }

  const weekStart = mondayOf(day)
  const monthStart = `${day.slice(0, 7)}-01`
  const monthEnd = addDays(shiftMonth(monthStart, 1), -1)
  const from = view === 'dia' ? day : view === 'semana' ? weekStart : monthStart
  const to = view === 'dia' ? day : view === 'semana' ? addDays(weekStart, 6) : monthEnd

  const load = useCallback(async () => {
    setList(null)
    setError(null)
    try {
      setList(await fetchAppointments(business, from, to))
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [business, from, to])

  useEffect(() => {
    load()
  }, [load])

  const move = (dir: -1 | 1) => setDay(view === 'dia' ? addDays(day, dir) : view === 'semana' ? addDays(day, 7 * dir) : shiftMonth(day, dir))
  const visible = (list || []).filter((a) => showCancelled || a.status !== 'cancelada')
  const byDay = (d: string) => visible.filter((a) => dateKey(a.starts_at, tz) === d)
  const active = visible.filter(isActive)
  const periodTotal = active.reduce((s, a) => s + Number(a.total), 0)
  const [y, m] = day.split('-').map(Number)
  const title =
    view === 'dia' ? dayTitle(day)
      : view === 'semana' ? `${shortDate(weekStart)} – ${shortDate(addDays(weekStart, 6))}`
        : `${MONTHS[m - 1].charAt(0).toUpperCase()}${MONTHS[m - 1].slice(1)} ${y}`
  const isCurrent = view === 'dia' ? day === today : view === 'semana' ? weekStart === mondayOf(today) : day.slice(0, 7) === today.slice(0, 7)

  const dayList = (d: string, compact: boolean) => {
    const items = byDay(d)
    const total = items.filter(isActive).reduce((s, a) => s + Number(a.total), 0)
    return (
      <section key={d}>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className={`font-bold ${d === today ? 'text-brand' : ''}`}>{compact ? shortDate(d) : dayTitle(d)}{d === today && compact ? ' · hoy' : ''}</h2>
          {items.length > 0 && <span className="text-xs text-slate-500">{items.filter(isActive).length} citas · {money(total, business.currency)}</span>}
        </div>
        <div className="space-y-2">
          {items.length === 0 ? (
            compact ? <p className="rounded-xl bg-white/60 px-3 py-2 text-sm text-slate-400">Sin citas</p> : <Empty title="Sin citas este día" />
          ) : (
            items.map((a) => <AppointmentRow key={a.id} a={a} onClick={() => setOpen(a)} />)
          )}
        </div>
      </section>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">Agenda</h1>
        <Button size="sm" onClick={() => setAdding(true)}>+ Cita</Button>
      </div>

      <div className="grid grid-cols-3 rounded-xl bg-slate-200 p-1">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={`rounded-lg py-2 text-sm font-semibold transition ${view === v.key ? 'bg-white shadow-sm' : 'text-slate-600'}`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <button onClick={() => move(-1)} className="rounded-lg p-2 hover:bg-slate-200" aria-label="Anterior">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-lg font-bold">{title}</p>
          {list && (
            <p className="text-xs text-slate-500">
              {active.length} {active.length === 1 ? 'cita' : 'citas'} · {money(periodTotal, business.currency)}
            </p>
          )}
        </div>
        <button onClick={() => move(1)} className="rounded-lg p-2 hover:bg-slate-200" aria-label="Siguiente">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 6l6 6-6 6" /></svg>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} className="input w-auto py-1.5" aria-label="Ir a una fecha" />
        {!isCurrent && <Button size="sm" variant="secondary" onClick={() => setDay(today)}>Hoy</Button>}
        <label className="ml-auto flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} /> Ver canceladas
        </label>
      </div>

      {error && <Alert>{error}</Alert>}
      {!list && !error && <PageLoader />}

      {list && view === 'dia' && dayList(day, false)}

      {list && view === 'semana' && (
        <>
          {/* Resumen de la semana: toca un día para verlo solo */}
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((d) => {
              const n = byDay(d).filter(isActive).length
              return (
                <button
                  key={d}
                  onClick={() => { setDay(d); setView('dia') }}
                  className={`rounded-xl py-2 text-center ring-1 transition hover:ring-brand ${d === today ? 'bg-brand/10 ring-brand' : 'bg-white ring-slate-200'}`}
                >
                  <span className="block text-[11px] font-medium text-slate-500">{WEEKDAYS_SHORT[weekdayOf(d)]}</span>
                  <span className={`block text-lg font-extrabold ${d === today ? 'text-brand' : ''}`}>{Number(d.slice(8))}</span>
                  <span className={`block text-[11px] font-semibold ${n ? 'text-brand' : 'text-slate-300'}`}>{n ? `${n} ${n === 1 ? 'cita' : 'citas'}` : '—'}</span>
                </button>
              )
            })}
          </div>
          <div className="space-y-4">{Array.from({ length: 7 }, (_, i) => dayList(addDays(weekStart, i), true))}</div>
        </>
      )}

      {list && view === 'mes' && (
        <>
          <MonthGrid
            monthStart={monthStart}
            today={today}
            selected={day}
            count={(d) => byDay(d).filter(isActive).length}
            onPick={setDay}
          />
          {dayList(day, false)}
        </>
      )}

      {open && <AppointmentModal appointment={open} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); load() }} />}
      {adding && <NewAppointment defaultDate={day} onClose={() => setAdding(false)} onCreated={() => { setAdding(false); load() }} />}
    </div>
  )
}

/** Calendario del mes con el número de citas de cada día */
function MonthGrid({ monthStart, today, selected, count, onPick }: {
  monthStart: string
  today: string
  selected: string
  count: (d: string) => number
  onPick: (d: string) => void
}) {
  const month = monthStart.slice(0, 7)
  const cells: (string | null)[] = Array.from({ length: (weekdayOf(monthStart) + 6) % 7 }, () => null)
  for (let d = monthStart; d.slice(0, 7) === month; d = addDays(d, 1)) cells.push(d)
  const max = Math.max(1, ...cells.map((d) => (d ? count(d) : 0)))

  return (
    <div className="card p-3 sm:p-4">
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-500">
        {[1, 2, 3, 4, 5, 6, 0].map((w) => <div key={w} className="pb-1">{WEEKDAYS_SHORT[w]}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />
          const n = count(d)
          const isSel = d === selected
          const isToday = d === today
          return (
            <button
              key={d}
              onClick={() => onPick(d)}
              className={`flex aspect-square flex-col items-center justify-center rounded-xl text-sm transition ${
                isSel ? 'bg-brand text-white shadow' : n ? 'hover:ring-2 hover:ring-brand' : 'hover:bg-slate-100'
              } ${isToday && !isSel ? 'ring-2 ring-brand' : ''} ${d < today && !isSel ? 'opacity-60' : ''}`}
              // Cuantas más citas, más intenso el fondo
              style={!isSel && n ? { backgroundColor: `rgb(var(--brand-rgb) / ${0.1 + 0.3 * (n / max)})` } : undefined}
              aria-label={`${d}: ${n} citas`}
            >
              <span className={`font-bold ${isToday && !isSel ? 'text-brand' : ''}`}>{Number(d.slice(8))}</span>
              <span className={`text-[10px] font-semibold leading-none ${isSel ? 'text-white/90' : 'text-slate-600'} ${n ? '' : 'invisible'}`}>{n || 0}</span>
            </button>
          )
        })}
      </div>
      <p className="mt-3 text-center text-xs text-slate-500">El número bajo cada día son sus citas. Toca un día para verlas.</p>
    </div>
  )
}
