import { useState } from 'react'
import { generateSlots, time12 } from '../lib/format'
import { Button } from './ui'
import { t as tx } from '../lib/i18n'

/** Lista de horas de inicio de turnos, con añadir / quitar y generador automático */
export function TimeChips({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [time, setTime] = useState('09:00')
  const [gen, setGen] = useState(false)
  const [open, setOpen] = useState('09:00')
  const [close, setClose] = useState('18:00')
  const [every, setEvery] = useState(60)

  const add = () => {
    if (!/^\d{2}:\d{2}$/.test(time)) return
    onChange(Array.from(new Set([...value, time])).sort())
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {value.length === 0 && <span className="text-sm text-slate-500">{tx('Sin turnos')}</span>}
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-brand/10 py-1 pl-3 pr-1 text-sm font-semibold text-brand">
            {time12(t)}
            <button
              type="button"
              onClick={() => onChange(value.filter((x) => x !== t))}
              className="rounded-full p-1 hover:bg-brand/20"
              aria-label={tx('Quitar {t}', { t: t })}
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="input w-32" step={300} />
        <Button type="button" variant="secondary" size="sm" onClick={add}>{tx('Añadir hora')}</Button>
        <button type="button" onClick={() => setGen((g) => !g)} className="text-sm font-semibold text-brand">
          {gen ? tx('Cerrar') : tx('Generar automáticamente')}
        </button>
      </div>
      {gen && (
        <div className="mt-3 rounded-xl bg-slate-50 p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <label className="text-xs font-medium text-slate-600">{tx('Abre')}
              <input type="time" value={open} onChange={(e) => setOpen(e.target.value)} className="input mt-1" />
            </label>
            <label className="text-xs font-medium text-slate-600">{tx('Cierra')}
              <input type="time" value={close} onChange={(e) => setClose(e.target.value)} className="input mt-1" />
            </label>
            <label className="col-span-2 text-xs font-medium text-slate-600 sm:col-span-1">{tx('Cada')}
              <select value={every} onChange={(e) => setEvery(Number(e.target.value))} className="input mt-1">
                {[15, 20, 30, 45, 60, 90, 120, 180].map((m) => <option key={m} value={m}>{m} {tx('min')}</option>)}
              </select>
            </label>
          </div>
          <Button
            type="button"
            size="sm"
            className="mt-3"
            onClick={() => {
              onChange(generateSlots(open, close, every))
              setGen(false)
            }}
          >
            {tx('Usar estos turnos')}
          </Button>
        </div>
      )}
    </div>
  )
}
