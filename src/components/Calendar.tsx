import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { addDays, MONTHS, WEEKDAYS_SHORT, weekdayOf } from '../lib/format'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/errors'
import { Alert, Spinner } from './ui'

interface CalendarProps {
  today: string
  maxDays: number
  isOpen: (key: string) => boolean
  value: string | null
  onChange: (key: string) => void
}

/** Calendario mensual. Bloquea días pasados, cerrados y fuera del rango. */
export function Calendar({ today, maxDays, isOpen, value, onChange }: CalendarProps) {
  const last = addDays(today, maxDays)
  const [month, setMonth] = useState(() => (value || today).slice(0, 7))

  const days = useMemo(() => {
    const first = `${month}-01`
    const offset = (weekdayOf(first) + 6) % 7 // semana empieza en lunes
    const cells: (string | null)[] = Array.from({ length: offset }, () => null)
    let d = first
    while (d.slice(0, 7) === month) {
      cells.push(d)
      d = addDays(d, 1)
    }
    return cells
  }, [month])

  const [y, m] = month.split('-').map(Number)
  const prevMonth = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  const canPrev = prevMonth >= today.slice(0, 7)
  const canNext = nextMonth <= last.slice(0, 7)

  return (
    <div className="select-none">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          disabled={!canPrev}
          onClick={() => setMonth(prevMonth)}
          className="rounded-full p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
          aria-label="Mes anterior"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
        <span className="font-semibold capitalize">{MONTHS[m - 1]} {y}</span>
        <button
          type="button"
          disabled={!canNext}
          onClick={() => setMonth(nextMonth)}
          className="rounded-full p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
          aria-label="Mes siguiente"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 6l6 6-6 6" /></svg>
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-500">
        {[1, 2, 3, 4, 5, 6, 0].map((w) => (
          <div key={w} className="py-1">{WEEKDAYS_SHORT[w]}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d, i) => {
          if (!d) return <div key={`e${i}`} />
          const disabled = d < today || d > last || !isOpen(d)
          const selected = d === value
          return (
            <button
              key={d}
              type="button"
              disabled={disabled}
              onClick={() => onChange(d)}
              className={`aspect-square rounded-xl text-sm font-semibold transition ${
                selected
                  ? 'bg-brand text-white shadow'
                  : disabled
                    ? 'text-slate-300 line-through decoration-slate-300'
                    : 'bg-white text-slate-800 ring-1 ring-slate-200 hover:ring-brand'
              } ${d === today && !selected ? 'ring-2 ring-brand/40' : ''}`}
            >
              {Number(d.slice(8))}
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface SlotPickerProps {
  slug: string
  date: string
  duration: number
  value: string | null
  onChange: (slot: string) => void
  /** Solo los huecos de este profesional (sin él: cualquiera libre) */
  staff?: string | null
  /** Se muestra debajo del aviso cuando el día está lleno (ej. lista de espera) */
  whenFull?: ReactNode
}

/** Turnos de un día, con los ocupados bloqueados */
export function SlotPicker({ slug, date, duration, value, onChange, staff, whenFull }: SlotPickerProps) {
  const [slots, setSlots] = useState<{ slot: string; available: boolean }[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setSlots(null)
    setError(null)
    supabase
      .rpc('get_available_slots', { p_slug: slug, p_date: date, p_duration: duration, p_staff: staff || null })
      .then(({ data, error }) => {
        if (!alive) return
        if (error) setError(errorMessage(error))
        else setSlots((data as { slot: string; available: boolean }[]) || [])
      })
    return () => {
      alive = false
    }
  }, [slug, date, duration, staff])

  if (error) return <Alert>{error}</Alert>
  if (!slots) return <div className="flex justify-center py-6 text-slate-400"><Spinner /></div>
  if (!slots.some((s) => s.available)) {
    return (
      <div className="space-y-3">
        <Alert kind="warning">No quedan turnos libres este día. Prueba con otro día.</Alert>
        {slots.length > 0 && whenFull}
      </div>
    )
  }
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {slots.map((s) => (
        <button
          key={s.slot}
          type="button"
          disabled={!s.available}
          onClick={() => onChange(s.slot)}
          className={`rounded-xl px-2 py-3 text-sm font-semibold transition ${
            value === s.slot
              ? 'bg-brand text-white shadow'
              : s.available
                ? 'bg-white text-slate-800 ring-1 ring-slate-200 hover:ring-brand'
                : 'bg-slate-100 text-slate-400 line-through'
          }`}
        >
          {s.slot}
        </button>
      ))}
    </div>
  )
}
