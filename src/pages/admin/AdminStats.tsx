// Pestaña "Números": lo importante en tres bloques fáciles de leer (dinero, negocios y reservas) y,
// plegado en "Más detalles", lo que se mira de vez en cuando (tipos de negocio, los que más reservan,
// negocios nuevos por mes y las visitas a la portada).
import { useEffect, useState, type ReactNode } from 'react'
import { BarChart, RankBars } from '../../components/BarChart'
import { Alert, PageLoader } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { MONTHS, money } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import { businessType } from '../../lib/templates'
import type { PlanKey } from '../../lib/types'
import { Icon } from '../panel/Panel'
import { int } from './adminData'
import { Kpi, PageTitle, SectionTitle } from './adminUi'
import type { RecentPayment } from './Payments'
import { Traffic } from './Traffic'

export interface AdminStatsData {
  months: { month: string; signups: number; revenue: number; payments: number; appointments: number }[]
  totals: {
    businesses: number
    revenue: number
    appointments: number
    appointments_30d: number
    active_30d: number
    ended_trials: number
    converted: number
    /** Pruebas que acabaron sin pagar y se borraron solas (todas y en los últimos 30 días) */
    purged?: number
    purged_30d?: number
  }
  by_plan: Record<PlanKey | 'prueba' | 'vencido' | 'cortesia', number>
  by_type: { type: string; count: number }[]
  top_businesses: { name: string; slug: string; code: string; count: number }[]
  expiring: { id: string; name: string; code: string; whatsapp: string; timezone?: string; kind: 'activo' | 'prueba'; ends_at: string }[]
  recent_payments: RecentPayment[]
}

function monthLabel(m: string, long = false): string {
  const [y, mm] = m.split('-').map(Number)
  const name = MONTHS[mm - 1]
  return long ? `${name.charAt(0).toUpperCase() + name.slice(1)} ${y}` : name.slice(0, 3)
}

const cup = (n: number) => money(n, 'CUP')

/** "+12 % que el mes pasado" o null si no hay con qué comparar */
function vsLastMonth(now: number, before: number): string | null {
  if (before <= 0) return null
  const p = Math.round(((now - before) / before) * 100)
  return p === 0 ? 'Igual que el mes pasado' : `${p > 0 ? '+' : '−'}${Math.abs(p)} % que el mes pasado`
}

export default function AdminStats() {
  const [s, setS] = useState<AdminStatsData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.rpc('admin_stats').then(({ data, error }) => (error ? setError(errorMessage(error)) : setS(data as AdminStatsData)))
  }, [])

  if (error) return <Alert>{error}</Alert>
  if (!s) return <PageLoader />

  const t = s.totals
  const thisMonth = s.months[s.months.length - 1]
  const lastMonth = s.months[s.months.length - 2]
  const revenue = Number(thisMonth?.revenue || 0)
  const prevRevenue = Number(lastMonth?.revenue || 0)
  const paying = s.by_plan.basico + s.by_plan.plus + s.by_plan.ultra
  const conversion = t.ended_trials ? Math.round((t.converted / t.ended_trials) * 100) : null
  // Media de los meses con cobros (sin contar el actual, que aún no ha terminado)
  const closed = s.months.slice(0, -1).filter((m) => Number(m.revenue) > 0)
  const average = closed.length ? closed.reduce((a, m) => a + Number(m.revenue), 0) / closed.length : 0

  const states = [
    { label: 'Pagando', value: paying, color: 'bg-emerald-500' },
    { label: 'En prueba', value: s.by_plan.prueba, color: 'bg-sky-500' },
    { label: 'Vencidos', value: s.by_plan.vencido, color: 'bg-red-400' },
    { label: 'Cortesía', value: s.by_plan.cortesia, color: 'bg-violet-400' },
  ]
  const totalStates = states.reduce((a, x) => a + x.value, 0)

  return (
    <div className="space-y-8">
      <PageTitle title="Números" sub="Lo importante de Citora de un vistazo." />

      {/* ----- Dinero ----- */}
      <section>
        <SectionTitle title="Dinero" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Kpi label="Cobrado este mes" value={cup(revenue)} hint={vsLastMonth(revenue, prevRevenue) || `${thisMonth?.payments || 0} pagos`} />
          <Kpi label="Mes pasado" value={cup(prevRevenue)} hint={average > 0 ? `Media: ${cup(Math.round(average))}/mes` : 'Aún sin media'} />
          <div className="col-span-2 lg:col-span-1">
            <Kpi label="Cobrado en total" value={cup(Number(t.revenue))} hint="desde el principio" />
          </div>
        </div>
        <div className="card mt-3">
          <h3 className="font-bold">Cobrado por mes</h3>
          <BarChart
            height={190}
            barClass="bg-citora-500"
            format={cup}
            bars={s.months.map((m) => ({ label: monthLabel(m.month), value: Number(m.revenue), tip: `${monthLabel(m.month, true)} · ${cup(Number(m.revenue))} (${m.payments} ${m.payments === 1 ? 'pago' : 'pagos'})` }))}
          />
        </div>
      </section>

      {/* ----- Negocios ----- */}
      <section>
        <SectionTitle title="Negocios" />
        <div className="card space-y-5">
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-3xl font-extrabold tracking-tight">{int(totalStates)}</p>
              <p className="text-sm text-slate-500">negocios en Citora</p>
            </div>
            {totalStates > 0 && (
              <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                {states.filter((x) => x.value > 0).map((x) => (
                  <div key={x.label} className={x.color} style={{ width: `${(x.value / totalStates) * 100}%` }} />
                ))}
              </div>
            )}
            <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
              {states.map((x) => (
                <li key={x.label} className="flex items-center gap-2 text-sm">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${x.color}`} />
                  <span className="text-slate-600">{x.label}</span>
                  <b className="ml-auto tabular-nums sm:ml-0">{x.value}</b>
                </li>
              ))}
            </ul>
          </div>
          <div className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3">
            <Line label="Nuevos este mes" value={String(thisMonth?.signups || 0)} hint={`${lastMonth?.signups || 0} el mes pasado`} />
            <Line
              label="De la prueba al pago"
              value={conversion === null ? '—' : `${conversion} %`}
              hint={`${t.converted} de ${t.ended_trials} pruebas terminadas`}
            />
            <Line label="Borrados por no pagar" value={String(t.purged_30d || 0)} hint={`en 30 días · ${t.purged || 0} en total`} />
          </div>
        </div>
      </section>

      {/* ----- Reservas ----- */}
      <section>
        <SectionTitle title="Reservas" />
        <div className="grid grid-cols-2 gap-3">
          <Kpi
            label="Reservas este mes"
            value={int(thisMonth?.appointments || 0)}
            hint={vsLastMonth(thisMonth?.appointments || 0, lastMonth?.appointments || 0) || 'en todos los negocios'}
          />
          <Kpi label="Negocios activos" value={String(t.active_30d)} hint="con reservas en 30 días" />
        </div>
      </section>

      {/* ----- Lo demás, plegado ----- */}
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-bold text-slate-500 [&::-webkit-details-marker]:hidden">
          <Icon name="chevron" className="h-4 w-4 transition group-open:rotate-90" /> Más detalles: tipos de negocio, los que más reservan y visitas
        </summary>
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Box title="Los que más reservan" sub="Últimos 30 días">
              {s.top_businesses.length === 0 ? <p className="text-slate-500">Aún no hay reservas este mes.</p> : (
                <RankBars barClass="bg-citora-500" items={s.top_businesses.slice(0, 6).map((b) => ({ label: b.name, value: b.count }))} />
              )}
            </Box>
            <Box title="Tipos de negocio">
              {s.by_type.length === 0 ? <p className="text-slate-500">Aún no hay negocios.</p> : (
                <RankBars barClass="bg-slate-800" items={s.by_type.map((x) => ({ label: `${businessType(x.type).emoji} ${businessType(x.type).name}`, value: x.count }))} />
              )}
            </Box>
          </div>
          <Box title="Negocios nuevos por mes">
            <BarChart
              height={170}
              barClass="bg-citora-500"
              bars={s.months.map((m) => ({ label: monthLabel(m.month), value: m.signups, tip: `${monthLabel(m.month, true)} · ${m.signups} ${m.signups === 1 ? 'negocio nuevo' : 'negocios nuevos'}` }))}
            />
          </Box>
          <Traffic />
        </div>
      </details>
    </div>
  )
}

function Line({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-sm text-slate-500">{label}</p>
      <p className="text-xl font-extrabold tracking-tight">{value}</p>
      <p className="truncate text-xs text-slate-400">{hint}</p>
    </div>
  )
}

function Box({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="card h-full">
      <h3 className="font-bold">{title}</h3>
      {sub && <p className="text-sm text-slate-500">{sub}</p>}
      <div className="mt-3">{children}</div>
    </section>
  )
}
