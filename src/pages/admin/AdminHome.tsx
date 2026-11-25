// Inicio del administrador: un resumen de cómo va Citora. Arriba, el aviso de comprobantes por
// revisar (si hay); luego 4 cifras (cobrado este mes, pagando, en prueba y nuevos); "Para escribir
// hoy" (pruebas que acaban en 2 días o menos y negocios que no arrancan, con el WhatsApp listo) y,
// debajo, los últimos pagos y los últimos negocios que se apuntaron.
import { useEffect, useState } from 'react'
import { Alert, Button, PageLoader } from '../../components/ui'
import { serverNow } from '../../lib/clockSkew'
import { errorMessage } from '../../lib/errors'
import { daysLeft, money } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import { Icon } from '../panel/Panel'
import { waLink } from '../../lib/whatsapp'
import { ADMIN_TZ, agoShort, expiringMessage, hasBusiness, helpMessage, mergeRows, shortDay, stuckReason, trialLeft, type Activity, type AdminOwner, type AdminRow } from './adminData'
import { BizAvatar, Kpi, SectionTitle, StateChip, StateDetail } from './adminUi'
import type { AdminTab } from './Admin'
import type { BizFilter } from './Businesses'
import type { AdminStatsData } from './AdminStats'

const SHOWN = 5

export function AdminHome({ go }: { go: (t: AdminTab, filter?: BizFilter) => void }) {
  const [owners, setOwners] = useState<AdminOwner[] | null>(null)
  const [activity, setActivity] = useState<Activity[]>([])
  const [stats, setStats] = useState<AdminStatsData | null>(null)
  const [pending, setPending] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      supabase.rpc('admin_list_owners'),
      supabase.rpc('admin_stats'),
      supabase.from('payment_claims').select('id', { count: 'exact', head: true }).eq('status', 'pendiente'),
      supabase.rpc('admin_business_activity'),
    ]).then(([o, s, c, a]) => {
      if (o.error || s.error) return setError(errorMessage(o.error || s.error))
      setOwners(o.data as AdminOwner[])
      if (!a.error) setActivity(a.data as Activity[])
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

  // ----- Para escribir hoy -----
  const rows = mergeRows(owners, activity)
  // Pruebas que acaban en 2 días o menos (la que antes acaba, primero)
  const ending = rows
    .filter((r) => r.id && r.name && !r.comped && r.status === 'prueba' && r.trial_ends_at
      && new Date(r.trial_ends_at).getTime() - serverNow() <= 2 * 86400000)
    .sort((a, b) => a.trial_ends_at!.localeCompare(b.trial_ends_at!))
  // Negocios que no arrancan: llevan días sin ninguna reserva por la web (y no están ya en la lista de arriba)
  const stuck = rows.filter((r) => stuckReason(r) && !ending.includes(r))

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

      {(ending.length > 0 || stuck.length > 0) && (
        <div className="grid gap-6 lg:grid-cols-2">
          <ToWrite
            title="Su prueba acaba en 2 días o menos"
            empty="Ninguna prueba acaba estos días."
            rows={ending}
            detail={(r) => `${trialLeft(r.trial_ends_at!)} de prueba`}
            message={(r) => expiringMessage({ name: r.name!, kind: 'prueba', ends_at: r.trial_ends_at!, timezone: r.timezone })}
          />
          <ToWrite
            title="Necesitan un empujón"
            empty="Todos los negocios en prueba ya reciben reservas."
            rows={stuck}
            detail={(r) => stuckReason(r)!}
            message={(r) => helpMessage(r.name!)}
          />
        </div>
      )}

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

/** Negocios a los que conviene escribir hoy, cada uno con su WhatsApp y el mensaje ya escrito */
function ToWrite({ title, empty, rows, detail, message }: {
  title: string
  empty: string
  rows: AdminRow[]
  detail: (r: AdminRow) => string
  message: (r: AdminRow) => string
}) {
  return (
    <section>
      <SectionTitle title={`${title}${rows.length ? ` (${rows.length})` : ''}`} />
      {rows.length === 0 ? (
        <div className="card py-6 text-center text-sm text-slate-500">{empty}</div>
      ) : (
        <ul className="card divide-y divide-slate-100 overflow-hidden p-0 text-sm sm:p-0">
          {rows.map((r) => (
            <li key={r.user_id} className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
              <BizAvatar owner={r} />
              <span className="min-w-0">
                <span className="block truncate font-semibold">{r.name}</span>
                <span className="block text-xs text-slate-500">{detail(r)}</span>
              </span>
              {r.whatsapp ? (
                <a
                  href={waLink(r.whatsapp, message(r))}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#25D366] px-3 py-1.5 text-xs font-bold text-white"
                >
                  <Icon name="whatsapp" className="h-4 w-4" /> Escribir
                </a>
              ) : (
                <span className="text-xs text-slate-400">Sin WhatsApp</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
