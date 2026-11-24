// Inicio del administrador: un resumen de cómo va Citora. Arriba, el aviso de comprobantes por
// revisar (si hay); luego 4 cifras (cobrado este mes, pagando, en prueba y nuevos) y, debajo, los
// últimos pagos y los últimos negocios que se apuntaron.
import { useEffect, useState } from 'react'
import { Alert, Button, PageLoader } from '../../components/ui'
import { serverNow } from '../../lib/clockSkew'
import { errorMessage } from '../../lib/errors'
import { daysLeft, money } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import { Icon } from '../panel/Panel'
import { ADMIN_TZ, agoShort, hasBusiness, shortDay, type AdminOwner } from './adminData'
import { BizAvatar, Kpi, SectionTitle, StateChip, StateDetail } from './adminUi'
import type { AdminTab } from './Admin'
import type { BizFilter } from './Businesses'
import type { AdminStatsData } from './AdminStats'

const SHOWN = 5

export function AdminHome({ go }: { go: (t: AdminTab, filter?: BizFilter) => void }) {
  const [owners, setOwners] = useState<AdminOwner[] | null>(null)
  const [stats, setStats] = useState<AdminStatsData | null>(null)
  const [pending, setPending] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      supabase.rpc('admin_list_owners'),
      supabase.rpc('admin_stats'),
      supabase.from('payment_claims').select('id', { count: 'exact', head: true }).eq('status', 'pendiente'),
    ]).then(([o, s, c]) => {
      if (o.error || s.error) return setError(errorMessage(o.error || s.error))
      setOwners(o.data as AdminOwner[])
      setStats(s.data as AdminStatsData)
      setPending(c.count || 0)
    })
  }, [])

  if (error) return <Alert>{error}</Alert>
  if (!owners || !stats) return <PageLoader />

  // ----- Cifras -----
  const real = owners.filter((r) => r.id && !r.comped)
  const paying = real.filter((r) => r.status === 'activo').length
  const trial = real.filter((r) => r.status === 'prueba')
  const endingSoon = trial.filter((r) => r.trial_ends_at && daysLeft(r.trial_ends_at) <= 7).length
  const thisMonth = stats.months[stats.months.length - 1]
  const lastMonth = stats.months[stats.months.length - 2]
  const revenue = Number(thisMonth?.revenue || 0)
  const prevRevenue = Number(lastMonth?.revenue || 0)
  // Lo cobrado en USD (versión internacional) va aparte, nunca sumado a los CUP
  const revenueUsd = Number(thisMonth?.revenue_usd || 0)
  const revenueHint = revenueUsd > 0 ? `y ${money(revenueUsd, 'USD')} de fuera` : prevRevenue > 0
    ? `${revenue >= prevRevenue ? '+' : '−'}${Math.abs(Math.round(((revenue - prevRevenue) / prevRevenue) * 100))} % que el mes pasado`
    : `${thisMonth?.payments || 0} ${thisMonth?.payments === 1 ? 'pago' : 'pagos'} este mes`
  const signups = thisMonth?.signups || 0
  const prevSignups = lastMonth?.signups || 0

  // ----- Listas -----
  const payments = stats.recent_payments.slice(0, SHOWN)
  const newest = owners
    .filter(hasBusiness)
    .sort((a, b) => (b.created_at || b.signed_up_at).localeCompare(a.created_at || a.signed_up_at))
    .slice(0, SHOWN)

  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: ADMIN_TZ, hour: '2-digit', hour12: false }).format(new Date(serverNow())))
  const hello = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'
  const day = new Intl.DateTimeFormat('es-ES', { timeZone: ADMIN_TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(serverNow()))
  const today = day.charAt(0).toUpperCase() + day.slice(1)

  return (
    <div className="space-y-7">
      <div>
        <p className="text-sm font-medium text-slate-500">{today}</p>
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">{hello}</h1>
        <p className="text-slate-500">Así va Citora.</p>
      </div>

      {pending > 0 && (
        <button onClick={() => go('cobros')} className="card flex w-full items-center gap-3 text-left transition hover:ring-citora-300">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-citora-50 text-citora-600"><Icon name="card" className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{pending} {pending === 1 ? 'comprobante de pago por revisar' : 'comprobantes de pago por revisar'}</span>
            <span className="block text-sm text-slate-500">Revísalos en Cobros para activar sus meses</span>
          </span>
          <Icon name="chevron" className="h-5 w-5 shrink-0 text-slate-400" />
        </button>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Cobrado este mes" value={money(revenue, 'CUP')} hint={revenueHint} />
        <Kpi label="Pagando" value={String(paying)} hint={`de ${real.length} negocios`} />
        <Kpi label="En prueba" value={String(trial.length)} hint={endingSoon ? `${endingSoon} ${endingSoon === 1 ? 'acaba' : 'acaban'} esta semana` : 'ninguna acaba esta semana'} />
        <Kpi label="Nuevos este mes" value={String(signups)} hint={`${prevSignups} el mes pasado`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionTitle title="Últimos pagos" right={<LinkText onClick={() => go('cobros')}>Ver todos</LinkText>} />
          {payments.length === 0 ? (
            <div className="card py-8 text-center text-sm text-slate-500">Todavía no hay pagos.</div>
          ) : (
            <ul className="card divide-y divide-slate-100 overflow-hidden p-0 text-sm sm:p-0">
              {payments.map((p) => (
                <li key={p.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{p.name}</span>
                    <span className="block text-xs text-slate-400">{shortDay(p.created_at)} · {p.months} {p.months === 1 ? 'mes' : 'meses'}</span>
                  </span>
                  <b className="tabular-nums">{p.amount === null ? '—' : money(Number(p.amount), p.currency || 'CUP')}</b>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionTitle title="Últimos negocios" right={<LinkText onClick={() => go('negocios')}>Ver todos</LinkText>} />
          {newest.length === 0 ? (
            <div className="card py-8 text-center text-sm text-slate-500">Todavía no hay negocios.</div>
          ) : (
            <ul className="card divide-y divide-slate-100 overflow-hidden p-0 text-sm sm:p-0">
              {newest.map((o) => (
                <li key={o.user_id} className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
                  <BizAvatar owner={o} />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{o.name}</span>
                    <span className="block text-xs text-slate-400">Se apuntó {agoShort(o.created_at || o.signed_up_at)}</span>
                  </span>
                  <span className="flex flex-col items-end gap-0.5">
                    <StateChip owner={o} />
                    <StateDetail owner={o} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Button variant="secondary" block onClick={() => go('numeros')} className="lg:hidden">
        <Icon name="chart" className="h-[18px] w-[18px]" /> Ver todos los números
      </Button>
    </div>
  )
}

function LinkText({ onClick, children }: { onClick: () => void; children: string }) {
  return <button onClick={onClick} className="text-sm font-semibold text-brand hover:underline">{children}</button>
}
