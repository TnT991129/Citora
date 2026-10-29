import { useEffect, useState } from 'react'
import { Alert, LinkButton, PageLoader, StatusBadge, WhatsAppIcon } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { daysLeft, money } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import { businessType } from '../../lib/templates'
import { waLink } from '../../lib/whatsapp'
import { Icon } from '../panel/Panel'
import type { AdminOwner, AdminTab } from './Admin'
import { expiringMessage, type AdminStatsData } from './AdminStats'

interface Week { visitors: number; signups: number }

/** Inicio del administrador: cómo va Citora y lo que necesita tu atención hoy */
export function AdminHome({ go }: { go: (t: AdminTab) => void }) {
  const [owners, setOwners] = useState<AdminOwner[] | null>(null)
  const [stats, setStats] = useState<AdminStatsData | null>(null)
  const [week, setWeek] = useState<Week | null>(null)
  const [pendingClaims, setPendingClaims] = useState(0)
  const [price, setPrice] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      supabase.rpc('admin_list_owners'),
      supabase.rpc('admin_stats'),
      supabase.from('payment_claims').select('id', { count: 'exact', head: true }).eq('status', 'pendiente'),
      supabase.rpc('admin_traffic', { p_days: 7 }),
      supabase.rpc('get_public_prices'),
    ]).then(([o, s, c, t, p]) => {
      if (o.error || s.error) return setError(errorMessage(o.error || s.error))
      setOwners(o.data as AdminOwner[])
      setStats(s.data as AdminStatsData)
      setPendingClaims(c.count || 0)
      setPrice(Number((p.data as { basico?: number } | null)?.basico) || 0)
      // Las visitas pueden no estar aún (si falta aplicar el schema): el resto del inicio se ve igual
      if (!t.error) setWeek(t.data as Week)
    })
  }, [])

  if (error) return <Alert>{error}</Alert>
  if (!owners || !stats) return <PageLoader />

  const real = owners.filter((o) => !o.comped)
  const paying = real.filter((o) => o.status === 'activo').length
  const trial = real.filter((o) => o.status === 'prueba').length
  const monthly = paying * price
  const thisMonth = new Date().toISOString().slice(0, 7)
  const newThisMonth = real.filter((o) => o.signed_up_at.slice(0, 7) === thisMonth).length
  const latest = owners.slice(0, 5)
  const todo = pendingClaims + stats.expiring.length
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Havana', hour: '2-digit', hour12: false }).format(new Date()))
  const hello = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'

  return (
    <div className="space-y-5">
      {/* Resumen principal */}
      <section className="relative overflow-hidden rounded-3xl bg-[#0b0b14] p-6 text-white shadow-xl shadow-slate-900/10 sm:p-8">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-rose-500/30 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 left-10 h-64 w-64 rounded-full bg-orange-500/20 blur-3xl" />
        <p className="relative text-sm font-medium text-white/60">{hello} 👋</p>
        <h1 className="relative mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">Así va Citora</h1>
        {/* En el móvil, el ingreso ocupa toda la fila (es la cifra más larga) */}
        <div className="relative mt-6 grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 sm:gap-6">
          <div className="col-span-2 sm:col-span-1"><Big label="Ingreso mensual" value={money(monthly, 'CUP')} /></div>
          <Big label="Pagando" value={String(paying)} hint={`de ${real.length} dueños`} />
          <Big label="Nuevos este mes" value={String(newThisMonth)} hint={`${trial} en prueba`} />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        {/* Lo que necesita tu atención */}
        <section className="card">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-extrabold tracking-tight">
              <Icon name="bell" className="h-5 w-5 text-brand" /> Para hoy
            </h2>
            {todo > 0 && <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-bold text-white">{todo}</span>}
          </div>
          {todo === 0 ? (
            <p className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-3.5 py-3 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">
              ✓ Todo al día: no hay pagos por revisar ni planes por vencer.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {pendingClaims > 0 && (
                <li className="flex items-center justify-between gap-3 py-3">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><Icon name="card" className="h-5 w-5" /></span>
                    <span className="min-w-0">
                      <b className="block">{pendingClaims} {pendingClaims === 1 ? 'pago por revisar' : 'pagos por revisar'}</b>
                      <span className="text-sm text-slate-500">Dueños que declararon que ya pagaron</span>
                    </span>
                  </span>
                  <button onClick={() => go('pagos')} className="shrink-0 rounded-full bg-brand px-3.5 py-1.5 text-sm font-bold text-white shadow-sm">Revisar</button>
                </li>
              )}
              {stats.expiring.map((b) => {
                const d = daysLeft(b.ends_at)
                return (
                  <li key={b.id} className="flex items-center justify-between gap-3 py-3">
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand"><Icon name="clock" className="h-5 w-5" /></span>
                      <span className="min-w-0">
                        <b className="block truncate">{b.name}</b>
                        <span className="text-sm text-slate-500">
                          {b.kind === 'activo' ? 'Su plan vence' : 'Su prueba termina'} {d <= 0 ? 'hoy' : `en ${d} ${d === 1 ? 'día' : 'días'}`}
                        </span>
                      </span>
                    </span>
                    {b.whatsapp && (
                      <LinkButton href={waLink(b.whatsapp, expiringMessage(b))} variant="whatsapp" size="sm" newTab>
                        <WhatsAppIcon className="h-4 w-4" /> Escribir
                      </LinkButton>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* Últimos registros */}
        <section className="card">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-extrabold tracking-tight"><Icon name="users" className="h-5 w-5 text-brand" /> Últimos registros</h2>
            <button onClick={() => go('duenos')} className="text-sm font-semibold text-brand">Ver todos</button>
          </div>
          <ul className="mt-3 space-y-2.5">
            {latest.map((o) => (
              <li key={o.user_id} className="flex items-center gap-3">
                <OwnerAvatar owner={o} />
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-sm">{o.name || o.email}</b>
                  <span className="block truncate text-xs text-slate-500">{ago(o.signed_up_at)}</span>
                </span>
                {o.comped ? <span className="chip bg-violet-100 text-violet-700">Cortesía</span> : o.status === 'sin_negocio' ? <span className="chip bg-slate-100 text-slate-600">Sin negocio</span> : <StatusBadge status={o.status} />}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* La semana en números */}
      <section>
        <div className="mb-2.5 flex items-center justify-between px-1">
          <h2 className="font-extrabold tracking-tight">Últimos 7 días</h2>
          <button onClick={() => go('estadisticas')} className="text-sm font-semibold text-brand">Ver estadísticas</button>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile icon="globe" label="Visitantes de la portada" value={week ? String(week.visitors) : '—'} />
          <Tile icon="sparkles" label="Apps creadas" value={week ? String(week.signups) : '—'} hint={week && week.visitors > 0 ? `${Math.round((week.signups / week.visitors) * 100)}% de los visitantes` : undefined} />
          <Tile icon="calendar" label="Citas reservadas" value={String(stats.totals.appointments_30d)} hint="últimos 30 días" />
          <Tile icon="chart" label="Negocios con citas" value={String(stats.totals.active_30d)} hint="últimos 30 días" />
        </div>
      </section>
    </div>
  )
}

function Big({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-2xl font-extrabold tracking-tight sm:text-3xl">{value}</p>
      <p className="truncate text-xs font-semibold text-white/60 sm:text-sm">{label}</p>
      {hint && <p className="truncate text-[11px] text-white/40 sm:text-xs">{hint}</p>}
    </div>
  )
}

function Tile({ icon, label, value, hint }: { icon: string; label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/10 text-brand"><Icon name={icon} className="h-5 w-5" /></span>
      <p className="mt-3 text-2xl font-extrabold tracking-tight">{value}</p>
      <p className="truncate text-xs font-semibold text-slate-500">{label}</p>
      {hint && <p className="truncate text-[11px] text-slate-400">{hint}</p>}
    </div>
  )
}

/** Inicial del negocio (o del correo) en un círculo de color según el tipo de negocio */
export function OwnerAvatar({ owner, size = 'h-10 w-10' }: { owner: AdminOwner; size?: string }) {
  const name = owner.name || owner.email || '?'
  const emoji = owner.business_type ? businessType(owner.business_type).emoji : null
  return (
    <span className={`relative flex ${size} shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-orange-400 text-sm font-extrabold text-white shadow-sm`}>
      {name.trim().charAt(0).toUpperCase()}
      {emoji && <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[11px] shadow ring-1 ring-slate-200">{emoji}</span>}
    </span>
  )
}

/** "hoy", "ayer", "hace 5 días", "hace 2 meses" */
export function ago(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days <= 0) return 'Se registró hoy'
  if (days === 1) return 'Se registró ayer'
  if (days < 30) return `Se registró hace ${days} días`
  const months = Math.floor(days / 30)
  return `Se registró hace ${months} ${months === 1 ? 'mes' : 'meses'}`
}
