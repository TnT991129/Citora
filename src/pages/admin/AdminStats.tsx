import { useEffect, useState } from 'react'
import { BarChart, RankBars } from '../../components/BarChart'
import { Alert, LinkButton, PageLoader, WhatsAppIcon } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { daysLeft, fullDateFromIso, MONTHS, money } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import { businessType } from '../../lib/templates'
import type { PlanKey } from '../../lib/types'
import { waLink } from '../../lib/whatsapp'

interface AdminStatsData {
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
  by_plan: Record<PlanKey | 'prueba' | 'vencido', number>
  by_type: { type: string; count: number }[]
  top_businesses: { name: string; slug: string; code: string; count: number }[]
  expiring: { id: string; name: string; code: string; whatsapp: string; kind: 'activo' | 'prueba'; ends_at: string }[]
  recent_payments: { name: string; code: string; plan: PlanKey; months: number; amount: number | null; note: string | null; created_at: string }[]
}

const TZ = 'America/Havana'

function monthLabel(m: string, long = false): string {
  const [y, mm] = m.split('-').map(Number)
  const name = MONTHS[mm - 1]
  return long ? `${name.charAt(0).toUpperCase() + name.slice(1)} ${y}` : name.slice(0, 3)
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
  const conversion = t.ended_trials ? Math.round((t.converted / t.ended_trials) * 100) : null
  const thisMonth = s.months[s.months.length - 1]
  const paying = s.by_plan.basico + s.by_plan.plus + s.by_plan.ultra
  const cup = (n: number) => money(n, 'CUP')

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Cobrado este mes" value={cup(thisMonth?.revenue || 0)} />
        <Stat label="Cobrado en total" value={cup(t.revenue)} />
        <Stat label="Conversión prueba → pago" value={conversion === null ? '—' : `${conversion}%`} hint={`${t.converted} de ${t.ended_trials} pruebas terminadas`} />
        <Stat label="Dueños con negocio" value={String(t.businesses)} hint={`${paying} pagando ahora`} />
      </div>

      {s.expiring.length > 0 && (
        <section className="card">
          <h2 className="font-bold">Para escribir hoy</h2>
          <p className="text-sm text-slate-500">Planes que vencen en 7 días y pruebas que terminan en 2.</p>
          <ul className="mt-2 divide-y divide-slate-100">
            {s.expiring.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="font-semibold">{b.name} <span className="font-mono text-sm text-slate-500">{b.code}</span></p>
                  <p className="text-sm text-slate-500">
                    {b.kind === 'activo' ? 'Plan vence' : 'Prueba termina'} {daysLeft(b.ends_at) <= 0 ? 'hoy' : `en ${daysLeft(b.ends_at)} ${daysLeft(b.ends_at) === 1 ? 'día' : 'días'}`}
                  </p>
                </div>
                {b.whatsapp && (
                  <LinkButton
                    href={waLink(b.whatsapp, b.kind === 'activo'
                      ? `Hola, te escribo de Citora. El plan de ${b.name} vence el ${fullDateFromIso(b.ends_at, TZ)}. Para renovarlo entra en tu panel > Plan. ¡Gracias!`
                      : `Hola, te escribo de Citora. Tu prueba gratis de ${b.name} termina el ${fullDateFromIso(b.ends_at, TZ)}. Para seguir recibiendo reservas entra en tu panel > Plan. ¿Te ayudo con algo?`)}
                    variant="whatsapp"
                    size="sm"
                    newTab
                  >
                    <WhatsAppIcon className="h-4 w-4" /> Escribir
                  </LinkButton>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card">
          <h2 className="font-bold">Cobros por mes</h2>
          <BarChart
            barClass="bg-citora-500"
            format={cup}
            bars={s.months.map((m) => ({ label: monthLabel(m.month), value: Number(m.revenue), tip: `${monthLabel(m.month, true)} · ${cup(Number(m.revenue))} (${m.payments} ${m.payments === 1 ? 'pago' : 'pagos'})` }))}
          />
        </section>
        <section className="card">
          <h2 className="font-bold">Dueños nuevos por mes</h2>
          <BarChart
            barClass="bg-citora-500"
            bars={s.months.map((m) => ({ label: monthLabel(m.month), value: m.signups, tip: `${monthLabel(m.month, true)} · ${m.signups} ${m.signups === 1 ? 'dueño nuevo' : 'dueños nuevos'}` }))}
          />
        </section>
        <section className="card">
          <h2 className="font-bold">Negocios por estado</h2>
          <p className="text-sm text-slate-500">{paying} pagando ahora</p>
          <div className="mt-3">
            <RankBars
              barClass="bg-citora-500"
              items={[
                { label: 'Pagando', value: paying },
                { label: 'En prueba', value: s.by_plan.prueba },
                { label: 'Vencidos', value: s.by_plan.vencido },
              ]}
            />
          </div>
        </section>
        <section className="card">
          <h2 className="font-bold">Tipos de negocio</h2>
          <div className="mt-3">
            {s.by_type.length === 0 ? <p className="text-slate-500">Aún no hay negocios.</p> : (
              <RankBars barClass="bg-citora-500" items={s.by_type.map((x) => ({ label: `${businessType(x.type).emoji} ${businessType(x.type).name}`, value: x.count }))} />
            )}
          </div>
        </section>
      </div>

      <section className="card">
        <h2 className="font-bold">Últimos pagos</h2>
        {s.recent_payments.length === 0 ? <p className="mt-2 text-slate-500">Todavía no hay pagos.</p> : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr><th className="py-1.5 pr-3 font-medium">Fecha</th><th className="pr-3 font-medium">Negocio</th><th className="pr-3 font-medium">Meses</th><th className="pr-3 text-right font-medium">Importe</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {s.recent_payments.map((p, i) => (
                  <tr key={i}>
                    <td className="whitespace-nowrap py-2 pr-3 text-slate-500">{fullDateFromIso(p.created_at, TZ)}</td>
                    <td className="pr-3"><span className="font-medium">{p.name}</span> <span className="font-mono text-xs text-slate-400">{p.code}</span>{p.note && <span className="block text-xs text-slate-400">{p.note}</span>}</td>
                    <td className="whitespace-nowrap pr-3">{p.months} {p.months === 1 ? 'mes' : 'meses'}</td>
                    <td className="whitespace-nowrap pr-3 text-right font-semibold">{p.amount === null ? '—' : cup(Number(p.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 truncate text-xl font-extrabold">{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-slate-400">{hint}</p>}
    </div>
  )
}
