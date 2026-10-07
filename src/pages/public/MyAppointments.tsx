import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PageLoader, StatusBadge } from '../../components/ui'
import { dateKey, dayTitle, fullDateFromIso, money, timeOf } from '../../lib/format'
import { forgetBooking, savedBookings } from '../../lib/storage'
import { supabase } from '../../lib/supabase'
import { clientPath } from '../../lib/url'
import type { PublicBooking } from '../../lib/types'
import NotFound from '../NotFound'
import { Centered, PoweredBy, PublicHeader, usePublicBusiness } from './shared'

/** Todas las citas que el cliente reservó desde este móvil en un negocio */
export default function MyAppointments() {
  const { slug } = useParams()
  const { business, error } = usePublicBusiness(slug)
  const [bookings, setBookings] = useState<PublicBooking[] | null>(null)

  useEffect(() => {
    if (!slug) return
    const saved = savedBookings(slug)
    Promise.all(
      saved.map(async (s) => {
        const { data, error } = await supabase.rpc('get_booking', { p_token: s.token })
        if (!error && data === null) forgetBooking(s.token) // la cita ya no existe
        return (data as PublicBooking | null) || null
      }),
    ).then((list) => setBookings(list.filter((b): b is PublicBooking => Boolean(b))))
  }, [slug])

  if (error) return <Centered><p className="text-slate-600">{error}</p></Centered>
  if (business === undefined || bookings === null) return <PageLoader />
  if (business === null) return <NotFound />

  const tz = business.timezone || bookings[0]?.business.timezone || 'America/Havana'
  const currency = business.currency || bookings[0]?.business.currency || 'CUP'
  const now = Date.now()
  const upcoming = bookings
    .filter((b) => (b.status === 'pendiente' || b.status === 'confirmada') && new Date(b.ends_at).getTime() > now)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const past = bookings
    .filter((b) => !upcoming.includes(b))
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at))

  // El resumen del servidor cuenta todas las citas con ese teléfono, no solo las de este móvil
  const summary = bookings
    .map((b) => b.customer)
    .filter(Boolean)
    .sort((a, b) => b!.bookings - a!.bookings)[0]
  const spent = past.filter((b) => b.status === 'completada' || b.status === 'confirmada' || b.status === 'pendiente')
    .reduce((s, b) => s + Number(b.total), 0)

  return (
    <div className="min-h-dvh pb-10">
      <PublicHeader business={business} back />
      <main className="mx-auto max-w-xl space-y-4 px-4 py-5">
        <h1 className="text-2xl font-extrabold">Mis citas</h1>

        {bookings.length === 0 ? (
          <div className="card text-center">
            <p className="text-slate-600">Todavía no tienes citas guardadas en este móvil.</p>
            <p className="mt-1 text-sm text-slate-500">Si reservaste desde otro móvil, abre el enlace de tu cita y quedará guardada aquí.</p>
            {business.accepting && (
              <Link to={clientPath(business.slug, 'reservar')} className="mt-4 flex w-full items-center justify-center rounded-2xl bg-brand py-3.5 font-bold text-white">
                Reservar cita
              </Link>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Tile label="Visitas" value={String(summary?.visits ?? 0)} />
              <Tile label="Reservas" value={String(summary?.bookings ?? bookings.length)} />
              <Tile label="Gastado" value={money(spent, currency)} small />
            </div>
            {summary?.since && (
              <p className="text-center text-sm text-slate-500">Cliente desde el {fullDateFromIso(summary.since, tz)}</p>
            )}

            <section className="card">
              <h2 className="text-lg font-bold">Próximas</h2>
              {upcoming.length === 0 ? (
                <p className="mt-2 text-slate-500">No tienes citas próximas.</p>
              ) : (
                <BookingList items={upcoming} slug={business.slug} tz={tz} currency={currency} />
              )}
              {business.accepting && (
                <Link to={clientPath(business.slug, 'reservar')} className="mt-3 flex w-full items-center justify-center rounded-2xl bg-brand py-3.5 font-bold text-white">
                  Reservar otra cita
                </Link>
              )}
            </section>

            {past.length > 0 && (
              <section className="card">
                <h2 className="text-lg font-bold">Anteriores</h2>
                <BookingList items={past} slug={business.slug} tz={tz} currency={currency} />
              </section>
            )}
            <p className="text-center text-xs text-slate-400">Aquí aparecen las citas reservadas o abiertas desde este móvil.</p>
          </>
        )}
        <PoweredBy />
      </main>
    </div>
  )
}

function BookingList({ items, slug, tz, currency }: { items: PublicBooking[]; slug: string; tz: string; currency: string }) {
  return (
    <ul className="mt-2 divide-y divide-slate-100">
      {items.map((b) => (
        <li key={b.token}>
          <Link to={clientPath(slug, `cita/${b.token}`)} className="flex items-center justify-between gap-3 py-3">
            <span className="min-w-0">
              <span className="block font-semibold">
                {dayTitle(dateKey(b.starts_at, tz))} <span className="font-normal text-slate-500">· {timeOf(b.starts_at, tz)}</span>
              </span>
              <span className="block truncate text-sm text-slate-500">
                {b.services.map((s) => s.name).join(', ') || 'Cita'} · {money(b.total, currency)}
              </span>
              {b.can_review && !b.review && <span className="text-sm font-semibold text-brand">★ Deja tu opinión</span>}
            </span>
            <StatusBadge status={b.status} />
          </Link>
        </li>
      ))}
    </ul>
  )
}

function Tile({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-2xl bg-white p-3 text-center shadow-sm ring-1 ring-slate-200">
      <p className={`${small ? 'text-base' : 'text-2xl'} truncate font-extrabold text-brand`}>{value}</p>
      <p className="text-xs font-medium text-slate-500">{label}</p>
    </div>
  )
}
