import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BusinessAvatar, LinkButton, PageLoader, StatusBadge, WhatsAppIcon } from '../../components/ui'
import { dateKey, duration, money, timeOf, WEEKDAYS, dayTitle } from '../../lib/format'
import { savedBookings, type SavedBooking } from '../../lib/storage'
import { waLink } from '../../lib/whatsapp'
import { supabase } from '../../lib/supabase'
import type { PublicBooking } from '../../lib/types'
import NotFound from '../NotFound'
import { Centered, Closed, PoweredBy, usePublicBusiness } from './shared'

export default function BusinessHome() {
  const { slug } = useParams()
  const { business, error } = usePublicBusiness(slug)

  if (error) return <Centered><p className="text-slate-600">{error}</p></Centered>
  if (business === undefined) return <PageLoader />
  if (business === null) return <NotFound />
  if (!business.accepting) return <Closed business={business} />

  const tz = business.timezone!
  const currency = business.currency!
  const services = business.services || []
  const openDays = (business.schedule || []).filter((d) => d.is_open).map((d) => d.weekday)
  const minPrice = services.length ? Math.min(...services.map((s) => Number(s.price))) : 0

  return (
    <div className="min-h-dvh pb-28">
      {/* Portada con el color del negocio */}
      <div className="bg-brand pb-16 pt-10 text-white">
        <div className="mx-auto max-w-xl px-4 text-center">
          <div className="flex justify-center"><BusinessAvatar name={business.name} logo={business.logo_url} size={80} inverted /></div>
          <h1 className="mt-4 text-3xl font-extrabold">{business.name}</h1>
          {business.description && <p className="mt-2 text-white/90">{business.description}</p>}
          {business.address && <p className="mt-2 text-sm text-white/80">📍 {business.address}</p>}
        </div>
      </div>

      <main className="mx-auto -mt-10 max-w-xl space-y-4 px-4">
        <MyBookings slug={business.slug} tz={tz} />

        <section className="card">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold">Servicios</h2>
            {services.length > 0 && <span className="text-sm text-slate-500">desde {money(minPrice, currency)}</span>}
          </div>
          <ul className="mt-3 divide-y divide-slate-100">
            {services.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-semibold">{s.name}</p>
                  {s.description && <p className="text-sm text-slate-500">{s.description}</p>}
                  <p className="text-sm text-slate-500">{duration(s.duration_min)}</p>
                </div>
                <span className="shrink-0 font-semibold">{money(s.price, currency)}</span>
              </li>
            ))}
            {services.length === 0 && <li className="py-3 text-slate-500">Pronto publicaremos nuestros servicios.</li>}
          </ul>
        </section>

        <section className="card">
          <h2 className="text-lg font-bold">Cómo reservar</h2>
          <ol className="mt-3 space-y-2 text-slate-700">
            <li><b className="text-brand">1.</b> Elige el servicio.</li>
            <li><b className="text-brand">2.</b> Elige el día y la hora.</li>
            <li><b className="text-brand">3.</b> Pon tu nombre y teléfono. ¡Listo!</li>
          </ol>
          {openDays.length > 0 && (
            <p className="mt-3 text-sm text-slate-500">
              Abrimos: {[1, 2, 3, 4, 5, 6, 0].filter((d) => openDays.includes(d)).map((d) => WEEKDAYS[d]).join(', ')}.
            </p>
          )}
        </section>

        {business.policies && (
          <section className="card">
            <h2 className="text-lg font-bold">Antes de tu cita</h2>
            <p className="mt-2 whitespace-pre-line text-slate-700">{business.policies}</p>
            <p className="mt-2 text-sm text-slate-500">
              Puedes cancelar o cambiar tu cita hasta {business.cancel_notice_hours} h antes desde el enlace que recibes al reservar.
            </p>
          </section>
        )}

        {business.whatsapp && (
          <LinkButton href={waLink(business.whatsapp, `Hola, tengo una pregunta sobre ${business.name}.`)} variant="whatsapp" block newTab>
            <WhatsAppIcon /> Escribir por WhatsApp
          </LinkButton>
        )}
        <PoweredBy />
      </main>

      {services.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur safe-bottom">
          <div className="mx-auto max-w-xl">
            <Link
              to={`/${business.slug}/reservar`}
              className="flex w-full items-center justify-center rounded-2xl bg-brand py-4 text-lg font-bold text-white shadow-lg shadow-brand/30 active:scale-[0.98]"
            >
              Reservar cita
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

/** Próximas citas reservadas desde este móvil */
function MyBookings({ slug, tz }: { slug: string; tz: string }) {
  const [items, setItems] = useState<(SavedBooking & { data?: PublicBooking | null })[]>([])

  useEffect(() => {
    const upcoming = savedBookings(slug)
      .filter((b) => new Date(b.starts_at).getTime() > Date.now() - 3600000)
      .slice(0, 3)
    setItems(upcoming)
    upcoming.forEach((b) => {
      supabase.rpc('get_booking', { p_token: b.token }).then(({ data }) => {
        setItems((list) => list.map((x) => (x.token === b.token ? { ...x, data: data as PublicBooking | null } : x)))
      })
    })
  }, [slug])

  const visible = items.filter((i) => i.data === undefined || (i.data && i.data.status !== 'cancelada'))
  if (visible.length === 0) return null
  return (
    <section className="card">
      <h2 className="text-lg font-bold">Tus próximas citas</h2>
      <ul className="mt-2 divide-y divide-slate-100">
        {visible.map((b) => {
          const start = b.data?.starts_at || b.starts_at
          return (
            <li key={b.token}>
              <Link to={`/${slug}/cita/${b.token}`} className="flex items-center justify-between gap-2 py-3">
                <span>
                  <span className="font-semibold">{dayTitle(dateKey(start, tz))}</span>
                  <span className="text-slate-500"> · {timeOf(start, tz)}</span>
                </span>
                {b.data && <StatusBadge status={b.data.status} />}
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
