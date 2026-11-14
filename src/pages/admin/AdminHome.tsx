// Inicio del administrador: lo que hay que hacer hoy (cada cosa con su botón), cómo va Citora en
// 4 cifras y el embudo del último mes (visitas → apps creadas → primera reserva → pagan).
import { useEffect, useState, type ReactNode } from 'react'
import { Alert, Button, LinkButton, PageLoader, WhatsAppIcon } from '../../components/ui'
import { serverNow } from '../../lib/clockSkew'
import { errorMessage } from '../../lib/errors'
import { daysLeft, money } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import { waLink } from '../../lib/whatsapp'
import { Icon } from '../panel/Panel'
import {
  ADMIN_TZ, daysSince, expiredAt, expiredMessage, expiringMessage, helpMessage, int, mergeRows, pct, rowState, stepsCount, stuckReason,
  type Activity, type AdminOwner, type AdminRow,
} from './adminData'
import { Kpi, SectionTitle } from './adminUi'
import type { AdminTab } from './Admin'
import type { BizFilter } from './Businesses'
import type { AdminStatsData } from './AdminStats'

interface Todo {
  key: string
  icon: string
  tone: string
  title: string
  sub: string
  action: ReactNode
}

const STUCK_SHOWN = 4

export function AdminHome({ go }: { go: (t: AdminTab, filter?: BizFilter) => void }) {
  const [rows, setRows] = useState<AdminRow[] | null>(null)
  const [stats, setStats] = useState<AdminStatsData | null>(null)
  const [claims, setClaims] = useState<{ months: number; businesses: { name: string } | null }[]>([])
  const [visitors, setVisitors] = useState<number | null>(null)
  const [price, setPrice] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      supabase.rpc('admin_list_owners'),
      supabase.rpc('admin_business_activity'),
      supabase.rpc('admin_stats'),
      supabase.from('payment_claims').select('months, businesses(name)').eq('status', 'pendiente').order('created_at'),
      supabase.rpc('admin_traffic', { p_days: 30 }),
      supabase.rpc('get_public_prices'),
    ]).then(([o, a, s, c, t, p]) => {
      if (o.error || a.error || s.error) return setError(errorMessage(o.error || a.error || s.error))
      setRows(mergeRows(o.data as AdminOwner[], a.data as Activity[]))
      setStats(s.data as AdminStatsData)
      setClaims((c.data as unknown as typeof claims) || [])
      setPrice(Number((p.data as { basico?: number } | null)?.basico) || 0)
      // Las visitas pueden no estar aún (si falta aplicar el schema): el resto del inicio se ve igual
      if (!t.error) setVisitors((t.data as { visitors: number }).visitors)
    })
  }, [])

  if (error) return <Alert>{error}</Alert>
  if (!rows || !stats) return <PageLoader />

  // ----- Para hoy -----
  const todo: Todo[] = []
  if (claims.length > 0) {
    todo.push({
      key: 'claims', icon: 'card', tone: 'bg-citora-50 text-citora-600',
      title: `${claims.length} ${claims.length === 1 ? 'comprobante por revisar' : 'comprobantes por revisar'}`,
      sub: claims.slice(0, 3).map((c) => `${c.businesses?.name || 'Negocio'} (${c.months} ${c.months === 1 ? 'mes' : 'meses'})`).join(' · '),
      action: <Button size="sm" block onClick={() => go('cobros')} className="!bg-slate-900 !bg-none !shadow-none">Revisar</Button>,
    })
  }
  const byId = new Map(rows.filter((r) => r.id).map((r) => [r.id as string, r]))
  for (const b of stats.expiring) {
    const d = daysLeft(b.ends_at)
    const when = d <= 0 ? 'hoy' : d === 1 ? 'mañana' : `en ${d} días`
    const row = byId.get(b.id)
    const web = row?.act?.web_total || 0
    const stuckToo = row ? stuckReason(row) : null
    todo.push({
      key: `exp-${b.id}`, icon: stuckToo ? 'alert' : 'clock', tone: stuckToo ? 'bg-amber-50 text-amber-600' : 'bg-sky-50 text-sky-600',
      title: b.kind === 'activo' ? `${b.name}: su plan vence ${when}` : `${b.name}: la prueba acaba ${when}`,
      sub: b.kind === 'activo' ? 'Recuérdale que renueve'
        : stuckToo ? `${stuckToo} · ${stepsCount(row!.act)} de 6 primeros pasos`
        : web > 0 ? `${web} ${web === 1 ? 'reserva' : 'reservas'} por la web en la prueba: buena señal para que pague` : 'Todavía sin reservas por la web',
      // Si además está atascado, mejor ofrecerle ayuda que recordarle que pague
      action: b.whatsapp ? <WaButton href={waLink(b.whatsapp, stuckToo ? helpMessage(b.name) : expiringMessage(b))} /> : null,
    })
  }
  // Un negocio sale una sola vez: si su prueba ya está en la lista de arriba, no se repite como atascado
  const listed = new Set(stats.expiring.map((b) => b.id))
  const stuck = rows
    .filter((r) => stuckReason(r) !== null && !listed.has(r.id || ''))
    .sort((a, b) => stepsCount(a.act) - stepsCount(b.act))
  for (const r of stuck.slice(0, STUCK_SHOWN)) {
    todo.push({
      key: `stuck-${r.user_id}`, icon: 'alert', tone: 'bg-amber-50 text-amber-600',
      title: `${r.name} está atascado`,
      sub: `${stuckReason(r)} · ${stepsCount(r.act)} de 6 primeros pasos`,
      action: r.whatsapp ? <WaButton href={waLink(r.whatsapp, helpMessage(r.name || ''))} /> : null,
    })
  }
  if (stuck.length > STUCK_SHOWN) {
    todo.push({
      key: 'stuck-more', icon: 'alert', tone: 'bg-amber-50 text-amber-600',
      title: `Y ${stuck.length - STUCK_SHOWN} negocios atascados más`, sub: 'Míralos todos en Negocios',
      action: <Button size="sm" variant="secondary" block onClick={() => go('negocios', 'atascados')}>Ver</Button>,
    })
  }
  // Los que dejaron de funcionar en la última semana: aún se les puede recuperar
  const expired = rows.filter((r) => rowState(r) === 'vencido' && r.id && expiredAt(r) && daysSince(expiredAt(r)!) <= 7)
  for (const r of expired) {
    const d = daysSince(expiredAt(r)!)
    const wasTrial = !r.paid_until
    todo.push({
      key: `exp-done-${r.user_id}`, icon: 'ban', tone: 'bg-red-50 text-red-600',
      title: `${r.name} ${d === 0 ? 'venció hoy' : `venció hace ${d} ${d === 1 ? 'día' : 'días'}`}`,
      sub: `${wasTrial ? 'Terminó la prueba sin pagar' : 'No renovó la mensualidad'} · ${r.act?.bookings_30d || 0} reservas este mes`,
      action: r.whatsapp ? <WaButton href={waLink(r.whatsapp, expiredMessage(r.name || '', wasTrial))} /> : null,
    })
  }

  // ----- Cifras -----
  const real = rows.filter((r) => r.id && !r.comped)
  const paying = real.filter((r) => r.status === 'activo').length
  const trial = real.filter((r) => r.status === 'prueba')
  const endingSoon = trial.filter((r) => r.trial_ends_at && daysLeft(r.trial_ends_at) <= 7).length
  const activated = real.filter((r) => (r.act?.web_total || 0) > 0).length
  const activation = real.length ? Math.round((activated / real.length) * 100) : 0
  const thisMonth = stats.months[stats.months.length - 1]
  const lastMonth = stats.months[stats.months.length - 2]
  const revenue = Number(thisMonth?.revenue || 0)
  const prevRevenue = Number(lastMonth?.revenue || 0)
  const revenueHint = prevRevenue > 0
    ? `${revenue >= prevRevenue ? '+' : '−'}${Math.abs(Math.round(((revenue - prevRevenue) / prevRevenue) * 100))} % que el mes pasado`
    : `${paying} × ${money(price, 'CUP')} al mes`

  // ----- Embudo de 30 días -----
  const recent = real.filter((r) => daysSince(r.created_at || r.signed_up_at) <= 30)
  const recentFirst = recent.filter((r) => (r.act?.web_total || 0) > 0)
  const recentPaid = recent.filter((r) => r.act?.paid)
  const funnel: [string, number | null][] = [
    ['Visitas a la portada', visitors],
    ['Crearon su app', recent.length],
    ['Recibieron su 1.ª reserva', recentFirst.length],
    ['Pagaron', recentPaid.length],
  ]
  const lostAtFirst = recent.length > 0 ? Math.round(((recent.length - recentFirst.length) / recent.length) * 100) : 0

  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: ADMIN_TZ, hour: '2-digit', hour12: false }).format(new Date(serverNow())))
  const hello = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'
  const day = new Intl.DateTimeFormat('es-ES', { timeZone: ADMIN_TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(serverNow()))
  const today = day.charAt(0).toUpperCase() + day.slice(1)

  return (
    <div className="space-y-7">
      <div>
        <p className="text-sm font-medium text-slate-500">{today}</p>
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">{hello}</h1>
        <p className="text-slate-500">
          {todo.length === 0 ? 'Todo al día: no hay nada pendiente.' : <>Tienes <b className="text-slate-900">{todo.length} {todo.length === 1 ? 'cosa' : 'cosas'}</b> para hoy.</>}
        </p>
      </div>

      <section>
        <SectionTitle title="Para hoy" />
        {todo.length === 0 ? (
          <div className="card flex items-center gap-3 text-emerald-800">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600"><Icon name="check" className="h-5 w-5" /></span>
            <p className="font-semibold">No hay pagos por revisar, planes por vencer ni negocios atascados.</p>
          </div>
        ) : (
          <ul className="card divide-y divide-slate-100 overflow-hidden p-0 sm:p-0">
            {todo.map((t) => (
              <li key={t.key} className="grid grid-cols-[40px_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5 px-4 py-3.5 sm:grid-cols-[40px_minmax(0,1fr)_120px]">
                <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${t.tone}`}><Icon name={t.icon} className="h-5 w-5" /></span>
                <span className="min-w-0">
                  <span className="block font-semibold leading-snug sm:truncate">{t.title}</span>
                  <span className="block text-sm text-slate-500 sm:truncate" title={t.sub}>{t.sub}</span>
                </span>
                <span className="col-start-2 sm:col-start-auto">{t.action}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Cobrado este mes" value={money(revenue, 'CUP')} hint={revenueHint} />
        <Kpi label="Pagando" value={String(paying)} hint={`de ${real.length} negocios`} />
        <Kpi label="En prueba" value={String(trial.length)} hint={endingSoon ? `${endingSoon} acaban esta semana` : 'ninguna acaba esta semana'} />
        <Kpi label="Activación" value={`${activation} %`} hint="recibieron su 1.ª reserva por la web" />
      </div>

      <section>
        <SectionTitle title="Embudo de los últimos 30 días" />
        <div className="card space-y-3.5">
          {funnel.map(([label, value], i) => {
            const prev = i > 0 ? funnel[i - 1][1] : null
            const base = funnel[1][1] || 1
            const width = value === null ? 0 : i === 0 ? 100 : Math.max(value > 0 ? 4 : 0, (value / Math.max(base, 1)) * 70)
            return (
              <div key={label}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate font-semibold">{label}</span>
                  <span className="shrink-0 tabular-nums text-slate-500">
                    <b className="text-slate-900">{value === null ? '—' : int(value)}</b>
                    {i > 0 && prev !== null && prev > 0 && value !== null && <> · {pct(value, prev)}</>}
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-gradient-to-r from-rose-400 to-orange-400 transition-all duration-700" style={{ width: `${width}%` }} />
                </div>
              </div>
            )
          })}
          {recent.length >= 3 && (
            <p className="pt-1 text-sm text-slate-500">
              De crear la app a la primera reserva se queda el <b className="text-slate-700">{lostAtFirst} %</b>: es el paso que más hay que cuidar.
            </p>
          )}
        </div>
      </section>
    </div>
  )
}

function WaButton({ href }: { href: string }) {
  return (
    <LinkButton href={href} variant="whatsapp" size="sm" block newTab>
      <WhatsAppIcon className="h-4 w-4" /> Escribir
    </LinkButton>
  )
}
