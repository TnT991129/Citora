import { useEffect, useState } from 'react'
import { BarChart, RankBars } from '../../components/BarChart'
import { Alert, PageLoader } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { addDays, dayTitle, money, shortDate, todayKey, WEEKDAYS, WEEKDAYS_SHORT } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import type { OwnerStats } from '../../lib/types'
import { usePanel } from './context'
import { Locked, useModule } from './Locked'

type Range = '7' | '30' | '90' | 'mes' | '365'
const RANGES: { key: Range; label: string }[] = [
  { key: '7', label: '7 días' },
  { key: '30', label: '30 días' },
  { key: 'mes', label: 'Este mes' },
  { key: '90', label: '90 días' },
  { key: '365', label: '12 meses' },
]

function rangeDates(r: Range, today: string): [string, string] {
  if (r === 'mes') return [today.slice(0, 8) + '01', today]
  return [addDays(today, -(Number(r) - 1)), today]
}

export default function Stats() {
  const allowed = useModule('finanzas')
  const { business } = usePanel()
  const [range, setRange] = useState<Range>('30')
  const [s, setS] = useState<OwnerStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const today = todayKey(business.timezone)
  const [from, to] = rangeDates(range, today)

  useEffect(() => {
    if (!allowed) return
    setS(null)
    setError(null)
    supabase.rpc('owner_stats', { p_from: from, p_to: to }).then(({ data, error }) => (error ? setError(errorMessage(error)) : setS(data as OwnerStats)))
  }, [allowed, from, to])

  if (!allowed) return <Locked module="finanzas" />

  const cur = (n: number) => money(n, business.currency)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Estadísticas</h1>
        <p className="text-slate-600">{shortDate(from)} – {shortDate(to)}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${range === r.key ? 'bg-slate-900 text-white' : 'bg-white ring-1 ring-slate-300'}`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {error && <Alert>{error}</Alert>}
      {!s && !error && <PageLoader />}
      {s && <StatsBody s={s} cur={cur} long={range === '365' || range === '90'} />}
    </div>
  )
}

function StatsBody({ s, cur, long }: { s: OwnerStats; cur: (n: number) => string; long: boolean }) {
  const t = s.summary
  const finished = t.done + t.no_shows
  const showRate = finished ? Math.round((t.done / finished) * 100) : null
  const cancelRate = t.bookings + t.cancelled ? Math.round((t.cancelled / (t.bookings + t.cancelled)) * 100) : null
  const avgTicket = t.done ? Number(t.revenue) / t.done : 0

  // Con rangos largos se agrupa por semana para que las barras no sean hilos
  const days = s.by_day
  const groups = long ? chunk(days, 7) : days.map((d) => [d])
  const bars = groups.map((g) => {
    const bookings = g.reduce((a, d) => a + d.bookings, 0)
    const revenue = g.reduce((a, d) => a + Number(d.revenue), 0)
    const label = shortDate(g[0].day).split(' ').slice(1).join(' ')
    const span = g.length > 1 ? `${shortDate(g[0].day)} – ${shortDate(g[g.length - 1].day)}` : dayTitle(g[0].day)
    return { bookings, revenue, label, span }
  })
  const every = Math.ceil(bars.length / 10)

  const weekdayOrder = [1, 2, 3, 4, 5, 6, 0]
  const busiestDay = weekdayOrder.reduce((best, d) => (s.by_weekday[d] > s.by_weekday[best] ? d : best), 1)
  const hours = s.by_hour.length ? range(Math.min(...s.by_hour.map((h) => h.hour)), Math.max(...s.by_hour.map((h) => h.hour))) : []

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Ingresos" value={cur(t.revenue)} hint={t.expected > 0 ? `+ ${cur(t.expected)} por venir` : undefined} />
        <Tile label="Citas atendidas" value={String(t.done)} hint={t.upcoming ? `${t.upcoming} por venir` : undefined} />
        <Tile label="Clientes" value={String(t.customers)} hint={`${t.new_customers} nuevos`} />
        <Tile label="Ticket medio" value={t.done ? cur(Math.round(avgTicket)) : '—'} />
        <Tile label="Asistencia" value={showRate === null ? '—' : `${showRate}%`} hint={t.no_shows ? `${t.no_shows} no vinieron` : undefined} />
        <Tile label="Canceladas" value={String(t.cancelled)} hint={cancelRate === null ? undefined : `${cancelRate}% de las reservas`} />
        <Tile label="Reservas online" value={String(t.web)} hint={`${t.manual} añadidas por ti`} />
        <Tile label="Día con más citas" value={t.bookings ? WEEKDAYS[busiestDay] : '—'} />
      </div>

      {t.bookings === 0 && t.cancelled === 0 ? (
        <div className="card text-center text-slate-600">No hay citas en este periodo.</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <section className="card md:col-span-2">
            <h2 className="font-bold">Ingresos {long ? 'por semana' : 'por día'}</h2>
            <p className="text-sm text-slate-500">Citas atendidas (o ya pasadas sin marcar)</p>
            <BarChart bars={bars.map((b) => ({ label: b.label, value: b.revenue, tip: `${b.span} · ${cur(b.revenue)}` }))} format={cur} labelEvery={every} />
          </section>
          <section className="card md:col-span-2">
            <h2 className="font-bold">Citas {long ? 'por semana' : 'por día'}</h2>
            <BarChart bars={bars.map((b) => ({ label: b.label, value: b.bookings, tip: `${b.span} · ${b.bookings} ${b.bookings === 1 ? 'cita' : 'citas'}` }))} labelEvery={every} />
          </section>
          <section className="card">
            <h2 className="font-bold">Servicios más pedidos</h2>
            <div className="mt-3">
              {s.top_services.length === 0 ? <p className="text-slate-500">Sin servicios en este periodo.</p> : (
                <RankBars items={s.top_services.map((x) => ({ label: x.name, value: x.count, extra: cur(x.revenue) }))} />
              )}
            </div>
          </section>
          <section className="card">
            <h2 className="font-bold">Días de la semana</h2>
            <BarChart
              height={110}
              bars={weekdayOrder.map((d) => ({ label: WEEKDAYS_SHORT[d], value: s.by_weekday[d], tip: `${WEEKDAYS[d]} · ${s.by_weekday[d]} citas` }))}
            />
          </section>
          {hours.length > 0 && (
            <section className="card md:col-span-2">
              <h2 className="font-bold">Horas más pedidas</h2>
              <BarChart
                height={110}
                bars={hours.map((h) => {
                  const n = s.by_hour.find((x) => x.hour === h)?.count || 0
                  return { label: `${h}h`, value: n, tip: `${String(h).padStart(2, '0')}:00 – ${String(h).padStart(2, '0')}:59 · ${n} citas` }
                })}
              />
            </section>
          )}
        </div>
      )}
    </>
  )
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

function range(a: number, b: number): number[] {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i)
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 truncate text-xl font-extrabold">{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-slate-400">{hint}</p>}
    </div>
  )
}
