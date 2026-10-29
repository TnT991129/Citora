import { useEffect, useMemo, useState } from 'react'
import { Alert, LinkButton, Spinner, StatusBadge, WhatsAppIcon } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { money } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import { businessType } from '../../lib/templates'
import type { BusinessStatus } from '../../lib/types'
import { publicUrl } from '../../lib/url'
import { waLink } from '../../lib/whatsapp'

interface Activity {
  id: string
  name: string
  slug: string
  code: string
  business_type: string
  whatsapp: string
  currency: string
  comped: boolean
  created_at: string
  status: BusinessStatus
  bookings_total: number
  bookings_30d: number
  bookings_7d: number
  web_30d: number
  customers: number
  revenue_30d: number
  last_booking_at: string | null
  services: number
}

type Health = 'funciona' | 'parado' | 'nuevo'
type Filter = 'todos' | Health
type Sort = '30d' | '7d' | 'total' | 'clientes'

const ACTIVE_DAYS = 14
const HEALTH: Record<Health, { label: string; dot: string; chip: string; hint: string }> = {
  funciona: { label: 'Funcionando', dot: 'bg-emerald-500', chip: 'bg-emerald-100 text-emerald-800', hint: `con reservas en los últimos ${ACTIVE_DAYS} días` },
  parado: { label: 'Parado', dot: 'bg-amber-500', chip: 'bg-amber-100 text-amber-800', hint: `sin reservas en ${ACTIVE_DAYS} días` },
  nuevo: { label: 'Sin estrenar', dot: 'bg-slate-400', chip: 'bg-slate-100 text-slate-700', hint: 'nunca ha recibido una reserva' },
}
const SORTS: { key: Sort; label: string }[] = [
  { key: '30d', label: 'Reservas 30 días' },
  { key: '7d', label: 'Reservas 7 días' },
  { key: 'total', label: 'Reservas totales' },
  { key: 'clientes', label: 'Clientes' },
]

const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)

function health(a: Activity): Health {
  if (!a.last_booking_at) return 'nuevo'
  return daysSince(a.last_booking_at) <= ACTIVE_DAYS ? 'funciona' : 'parado'
}

function lastText(iso: string | null): string {
  if (!iso) return 'Nunca'
  const d = daysSince(iso)
  return d <= 0 ? 'Hoy' : d === 1 ? 'Ayer' : `Hace ${d} días`
}

/** Qué negocios están funcionando y cuáles reciben más reservas (ver admin_business_activity) */
export function BusinessActivity() {
  const [list, setList] = useState<Activity[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('todos')
  const [sort, setSort] = useState<Sort>('30d')

  useEffect(() => {
    supabase.rpc('admin_business_activity').then(({ data, error }) => (error ? setError(errorMessage(error)) : setList(data as Activity[])))
  }, [])

  const sorted = useMemo(() => {
    const key = (a: Activity) => (sort === '30d' ? a.bookings_30d : sort === '7d' ? a.bookings_7d : sort === 'total' ? a.bookings_total : a.customers)
    return [...(list || [])].sort((a, b) => key(b) - key(a) || b.bookings_total - a.bookings_total)
  }, [list, sort])
  // Los 3 con más reservas en 30 días (sin contar cortesías): candidatos a un premio o descuento
  const top = useMemo(
    () => new Set([...(list || [])].filter((a) => !a.comped && a.bookings_30d > 0).sort((a, b) => b.bookings_30d - a.bookings_30d).slice(0, 3).map((a) => a.id)),
    [list],
  )

  const count = (h: Health) => (list || []).filter((a) => health(a) === h).length
  const shown = sorted.filter((a) => filter === 'todos' || health(a) === filter)

  return (
    <section className="card space-y-5">
      <div>
        <h2 className="text-lg font-extrabold tracking-tight">Actividad de los negocios</h2>
        <p className="text-sm text-slate-500">Cuáles están funcionando y cuáles reciben más reservas. Las canceladas no cuentan.</p>
      </div>

      {error && <Alert>{error}</Alert>}
      {!list && !error && <div className="flex justify-center py-10 text-brand"><Spinner /></div>}

      {list && (
        <>
          {/* Resumen: cuántos funcionan, están parados o sin estrenar (se pueden pulsar para filtrar) */}
          <div className="grid grid-cols-3 gap-2.5">
            {(['funciona', 'parado', 'nuevo'] as const).map((h) => (
              <button
                key={h}
                onClick={() => setFilter(filter === h ? 'todos' : h)}
                aria-pressed={filter === h}
                className={`rounded-2xl p-3 text-left ring-1 transition ${filter === h ? 'bg-brand/5 ring-2 ring-brand' : 'bg-slate-50 ring-slate-200 hover:ring-slate-300'}`}
              >
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                  <span className={`h-2 w-2 rounded-full ${HEALTH[h].dot}`} /> {HEALTH[h].label}
                </span>
                <span className="mt-1 block text-2xl font-extrabold tracking-tight">{count(h)}</span>
                <span className="hidden text-[11px] leading-tight text-slate-400 sm:block">{HEALTH[h].hint}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-500">
              {filter === 'todos' ? `${list.length} negocios` : `${shown.length} ${HEALTH[filter].label.toLowerCase()}`}
              {filter !== 'todos' && <button onClick={() => setFilter('todos')} className="ml-2 font-semibold text-brand">Ver todos</button>}
            </p>
            <select className="input w-auto py-2 text-sm" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Ordenar por">
              {SORTS.map((s) => <option key={s.key} value={s.key}>Ordenar: {s.label}</option>)}
            </select>
          </div>

          {shown.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No hay negocios en este grupo.</p>
          ) : (
            <ol className="space-y-2.5">
              {shown.map((a, i) => {
                const h = health(a)
                const webPct = a.bookings_30d > 0 ? Math.round((a.web_30d / a.bookings_30d) * 100) : 0
                return (
                  <li key={a.id} className={`rounded-2xl p-3.5 ring-1 transition sm:p-4 ${top.has(a.id) ? 'bg-amber-50/60 ring-amber-300' : 'bg-white ring-slate-200'}`}>
                    <div className="flex items-start gap-3">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${i < 3 && sort !== 'clientes' && a.bookings_total > 0 ? 'bg-gradient-to-br from-amber-300 to-orange-400 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="truncate font-extrabold tracking-tight">{businessType(a.business_type).emoji} {a.name}</p>
                          <span className={`chip ${HEALTH[h].chip}`}><span className={`h-1.5 w-1.5 rounded-full ${HEALTH[h].dot}`} />{HEALTH[h].label}</span>
                          {a.comped ? <span className="chip bg-violet-100 text-violet-700">Cortesía</span> : <StatusBadge status={a.status} />}
                          {top.has(a.id) && <span className="chip bg-amber-200 text-amber-900">⭐ Candidato a descuento</span>}
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">Última reserva: <b className="text-slate-700">{lastText(a.last_booking_at)}</b> · {a.services} {a.services === 1 ? 'servicio' : 'servicios'}</p>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2 text-center sm:grid-cols-5">
                      <Num label="30 días" value={a.bookings_30d} strong />
                      <Num label="7 días" value={a.bookings_7d} />
                      <Num label="Totales" value={a.bookings_total} />
                      <Num label="Clientes" value={a.customers} className="hidden sm:block" />
                      <Num label="Desde la web" value={`${webPct}%`} className="hidden sm:block" />
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-slate-500">
                        Cobrado en citas (30 días): <b className="text-slate-700">{money(a.revenue_30d, a.currency)}</b>
                        <span className="sm:hidden"> · {a.customers} clientes · {webPct}% desde la web</span>
                      </p>
                      <div className="flex gap-2">
                        <LinkButton href={publicUrl(a.slug)} variant="secondary" size="sm" newTab>Ver web</LinkButton>
                        {h !== 'funciona' && a.whatsapp && (
                          <LinkButton
                            href={waLink(a.whatsapp, h === 'nuevo'
                              ? `Hola, te escribo de Citora. Vi que ${a.name} todavía no ha recibido su primera reserva. ¿Te ayudo a configurarla o a compartir tu enlace con tus clientes?`
                              : `Hola, te escribo de Citora. Vi que ${a.name} lleva unos días sin reservas. ¿Va todo bien? Si quieres, te ayudo a sacarle más partido.`)}
                            variant="whatsapp"
                            size="sm"
                            newTab
                          >
                            <WhatsAppIcon className="h-4 w-4" /> Ofrecer ayuda
                          </LinkButton>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </>
      )}
    </section>
  )
}

function Num({ label, value, strong, className = '' }: { label: string; value: number | string; strong?: boolean; className?: string }) {
  return (
    <div className={`rounded-xl bg-slate-50 px-2 py-2 ${className}`}>
      <p className={`text-lg font-extrabold tracking-tight ${strong ? 'text-brand' : ''}`}>{value}</p>
      <p className="truncate text-[11px] font-medium text-slate-500">{label}</p>
    </div>
  )
}
