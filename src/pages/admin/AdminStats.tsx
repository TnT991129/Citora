// Pestaña "Números": cobros, conversión, tipos de negocio, los que más reservan y las visitas a la
// portada (Traffic). Junta lo que antes eran "Estadísticas" y la actividad de los negocios.
import { useEffect, useState } from 'react'
import { BarChart, RankBars } from '../../components/BarChart'
import { Alert, PageLoader } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { MONTHS, money } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import { businessType } from '../../lib/templates'
import type { PlanKey } from '../../lib/types'
import { Kpi, PageTitle } from './adminUi'
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
  }
  by_plan: Record<PlanKey | 'prueba' | 'vencido' | 'cortesia', number>
  by_type: { type: string; count: number }[]
  top_businesses: { name: string; slug: string; code: string; count: number }[]
  expiring: { id: string; name: string; code: string; whatsapp: string; timezone?: string; kind: 'activo' | 'prueba'; ends_at: string }[]
  recent_payments: { name: string; code: string; plan: PlanKey; months: number; amount: number | null; note: string | null; created_at: string }[]
}

function monthLabel(m: string, long = false): string {
  const [y, mm] = m.split('-').map(Number)
  const name = MONTHS[mm - 1]
  return long ? `${name.charAt(0).toUpperCase() + name.slice(1)} ${y}` : name.slice(0, 3)
}

const cup = (n: number) => money(n, 'CUP')

export default function AdminStats() {
  const [s, setS] = useState<AdminStatsData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.rpc('admin_stats').then(({ data, error }) => (error ? setError(errorMessage(error)) : setS(data as AdminStatsData)))
  }, [])

  if (error) return <Alert>{error}</Alert>
  if (!s) return <PageLoader />

  const t = s.totals
  const conversion = t.ended_trials ? Math.round((t.converted / t.ended_trials) * 100) : null
  const thisMonth = s.months[s.months.length - 1]
  const paying = s.by_plan.basico + s.by_plan.plus + s.by_plan.ultra

  return (
    <div className="space-y-7">
      <PageTitle title="Números" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Cobrado en total" value={cup(t.revenue)} hint={`${cup(Number(thisMonth?.revenue || 0))} este mes`} />
        <Kpi label="Prueba → pago" value={conversion === null ? '—' : `${conversion} %`} hint={`${t.converted} de ${t.ended_trials} pruebas terminadas`} />
        <Kpi label="Reservas este mes" value={String(thisMonth?.appointments || 0)} hint="en todos los negocios" />
        <Kpi label="Negocios" value={String(t.businesses)} hint={`${paying} pagando · ${s.by_plan.prueba} en prueba`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="card h-full">
          <h2 className="font-bold">Cobrado por mes</h2>
          <BarChart
            height={210}
            barClass="bg-citora-500"
            format={cup}
            bars={s.months.map((m) => ({ label: monthLabel(m.month), value: Number(m.revenue), tip: `${monthLabel(m.month, true)} · ${cup(Number(m.revenue))} (${m.payments} ${m.payments === 1 ? 'pago' : 'pagos'})` }))}
          />
        </section>
        <section className="card h-full">
          <h2 className="mb-3 font-bold">Tipos de negocio</h2>
          {s.by_type.length === 0 ? <p className="text-slate-500">Aún no hay negocios.</p> : (
            <RankBars barClass="bg-slate-800" items={s.by_type.map((x) => ({ label: `${businessType(x.type).emoji} ${businessType(x.type).name}`, value: x.count }))} />
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="card h-full">
          <h2 className="font-bold">Negocios nuevos por mes</h2>
          <BarChart
            height={210}
            barClass="bg-citora-500"
            bars={s.months.map((m) => ({ label: monthLabel(m.month), value: m.signups, tip: `${monthLabel(m.month, true)} · ${m.signups} ${m.signups === 1 ? 'negocio nuevo' : 'negocios nuevos'}` }))}
          />
        </section>
        <section className="card h-full">
          <h2 className="font-bold">Los que más reservan</h2>
          <p className="mb-3 text-sm text-slate-500">Últimos 30 días. Candidatos a un premio o un descuento.</p>
          {s.top_businesses.length === 0 ? <p className="text-slate-500">Aún no hay reservas este mes.</p> : (
            <RankBars barClass="bg-citora-500" items={s.top_businesses.slice(0, 6).map((b) => ({ label: b.name, value: b.count }))} />
          )}
        </section>
      </div>

      <Traffic />
    </div>
  )
}
