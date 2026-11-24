import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart, RankBars } from '../../components/BarChart'
import { Alert, PageLoader } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { addDays, dayTitle, money, shortDate, time12, todayKey, WEEKDAYS, WEEKDAYS_SHORT } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import type { OwnerStats } from '../../lib/types'
import { usePanel } from './context'
import { Locked, useModule } from './Locked'
import { t as tx } from '../../lib/i18n'

type Range = '7' | '30' | '90' | 'mes' | '365'
const RANGES: { key: Range; label: string }[] = [
  { key: '7', label: tx('7 días') },
  { key: '30', label: tx('30 días') },
  { key: 'mes', label: tx('Este mes') },
  { key: '90', label: tx('90 días') },
  { key: '365', label: tx('12 meses') },
]

function rangeDates(r: Range, today: string): [string, string] {
  if (r === 'mes') return [today.slice(0, 8) + '01', today]
  return [addDays(today, -(Number(r) - 1)), today]
}

export default function Stats() {
  const allowed = useModule('finanzas')
  const { business, link } = usePanel()
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
        <h1 className="text-2xl font-extrabold">{tx('Estadísticas')}</h1>
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
      {s && <StatsBody s={s} cur={cur} long={range === '365' || range === '90'} expensesLink={link('gastos')} />}
    </div>
  )
}

function StatsBody({ s, cur, long, expensesLink }: { s: OwnerStats; cur: (n: number) => string; long: boolean; expensesLink: string }) {
  const t = s.summary
  // Las estadísticas anteriores a los gastos no traen estos campos
  const expenses = Number(t.expenses || 0)
  const profit = Number(t.revenue) - expenses
  const margin = Number(t.revenue) > 0 ? Math.round((profit / Number(t.revenue)) * 100) : null
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
    const spent = g.reduce((a, d) => a + Number(d.expenses || 0), 0)
    const label = shortDate(g[0].day).split(' ').slice(1).join(' ')
    const span = g.length > 1 ? `${shortDate(g[0].day)} – ${shortDate(g[g.length - 1].day)}` : dayTitle(g[0].day)
    return { bookings, revenue, spent, label, span }
  })
  const every = Math.ceil(bars.length / 10)

  const weekdayOrder = [1, 2, 3, 4, 5, 6, 0]
  const busiestDay = weekdayOrder.reduce((best, d) => (s.by_weekday[d] > s.by_weekday[best] ? d : best), 1)
  const hours = s.by_hour.length ? range(Math.min(...s.by_hour.map((h) => h.hour)), Math.max(...s.by_hour.map((h) => h.hour))) : []

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label={tx('Ingresos')} value={cur(t.revenue)} hint={t.expected > 0 ? tx('+ {cur} por venir', { cur: cur(t.expected) }) : undefined} />
        <Tile label={tx('Gastos')} value={cur(expenses)} link={expensesLink} hint={expenses ? undefined : tx('Toca para apuntarlos')} />
        <Tile label={tx('Ganancia')} value={cur(profit)} hint={margin === null ? undefined : tx('{margin}% de lo ingresado', { margin: margin })} tone={profit < 0 ? 'bad' : 'good'} />
        <Tile label={tx('Citas atendidas')} value={String(t.done)} hint={t.upcoming ? tx('{upcoming} por venir', { upcoming: t.upcoming }) : undefined} />
        <Tile label={tx('Clientes')} value={String(t.customers)} hint={tx('{new_customers} nuevos', { new_customers: t.new_customers })} />
        <Tile label={tx('Ticket medio')} value={t.done ? cur(Math.round(avgTicket)) : '—'} />
        <Tile label={tx('Asistencia')} value={showRate === null ? '—' : `${showRate}%`} hint={t.no_shows ? tx('{no_shows} no vinieron', { no_shows: t.no_shows }) : undefined} />
        <Tile label={tx('Canceladas')} value={String(t.cancelled)} hint={cancelRate === null ? undefined : tx('{cancelRate}% de las reservas', { cancelRate: cancelRate })} />
        <Tile label={tx('Reservas online')} value={String(t.web)} hint={tx('{manual} añadidas por ti', { manual: t.manual })} />
        <Tile label={tx('Día con más citas')} value={t.bookings ? WEEKDAYS[busiestDay] : '—'} />
      </div>

      {expenses > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <section className="card md:col-span-2">
            <h2 className="font-bold">{tx('Ganancia')}{' '}{long ? tx('por semana') : tx('por día')}</h2>
            <p className="text-sm text-slate-500">{tx('Ingresos menos gastos')}</p>
            <BarChart bars={bars.map((b) => ({ label: b.label, value: Math.max(0, b.revenue - b.spent), tip: tx('{span} · ingresos {cur} · gastos {cur2} · ganancia {cur3}', { span: b.span, cur: cur(b.revenue), cur2: cur(b.spent), cur3: cur(b.revenue - b.spent) }) }))} format={cur} labelEvery={every} />
          </section>
          <section className="card md:col-span-2">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-bold">{tx('Gastos por categoría')}</h2>
              <Link to={expensesLink} className="text-sm font-semibold text-brand">{tx('Ver gastos')}</Link>
            </div>
            <div className="mt-3">
              <RankBars items={(s.expenses_by_category || []).map((x) => ({ label: x.category, value: Number(x.total) }))} format={cur} />
            </div>
          </section>
        </div>
      )}

      {t.bookings === 0 && t.cancelled === 0 ? (
        <div className="card text-center text-slate-600">{tx('No hay citas en este periodo.')}</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <section className="card md:col-span-2">
            <h2 className="font-bold">{tx('Ingresos')}{' '}{long ? tx('por semana') : tx('por día')}</h2>
            <p className="text-sm text-slate-500">{tx('Citas atendidas (o ya pasadas sin marcar)')}</p>
            <BarChart bars={bars.map((b) => ({ label: b.label, value: b.revenue, tip: `${b.span} · ${cur(b.revenue)}` }))} format={cur} labelEvery={every} />
          </section>
          <section className="card md:col-span-2">
            <h2 className="font-bold">{tx('Citas')}{' '}{long ? tx('por semana') : tx('por día')}</h2>
            <BarChart bars={bars.map((b) => ({ label: b.label, value: b.bookings, tip: `${b.span} · ${b.bookings === 1 ? tx('1 cita') : tx('{n} citas', { n: b.bookings })}` }))} labelEvery={every} />
          </section>
          <section className="card">
            <h2 className="font-bold">{tx('Servicios más pedidos')}</h2>
            <div className="mt-3">
              {s.top_services.length === 0 ? <p className="text-slate-500">{tx('Sin servicios en este periodo.')}</p> : (
                <RankBars items={s.top_services.map((x) => ({ label: x.name, value: x.count, extra: cur(x.revenue) }))} />
              )}
            </div>
          </section>
          <section className="card">
            <h2 className="font-bold">{tx('Días de la semana')}</h2>
            <BarChart
              height={110}
              bars={weekdayOrder.map((d) => ({ label: WEEKDAYS_SHORT[d], value: s.by_weekday[d], tip: tx('{v} · {v2} citas', { v: WEEKDAYS[d], v2: s.by_weekday[d] }) }))}
            />
          </section>
          {hours.length > 0 && (
            <section className="card md:col-span-2">
              <h2 className="font-bold">{tx('Horas más pedidas')}</h2>
              <BarChart
                height={110}
                bars={hours.map((h) => {
                  const n = s.by_hour.find((x) => x.hour === h)?.count || 0
                  const hh = String(h).padStart(2, '0')
                  const h12 = h % 12 === 0 ? 12 : h % 12
                  return { label: `${h12}${h < 12 ? 'a' : 'p'}`, value: n, tip: tx('{time12} – {time122} · {n} citas', { time12: time12(`${hh}:00`), time122: time12(`${hh}:59`), n: n }) }
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

function Tile({ label, value, hint, link, tone }: { label: string; value: string; hint?: string; link?: string; tone?: 'good' | 'bad' }) {
  const body = (
    <>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 truncate text-xl font-extrabold ${tone === 'bad' ? 'text-red-600' : tone === 'good' ? 'text-emerald-700' : ''}`}>{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-slate-400">{hint}</p>}
    </>
  )
  const cls = 'block rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200'
  return link ? <Link to={link} className={`${cls} hover:ring-slate-300`}>{body}</Link> : <div className={cls}>{body}</div>
}
