import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { InstallButton } from '../../components/InstallButton'
import { LinkButton, PageLoader, StatusBadge, WhatsAppIcon } from '../../components/ui'
import { cupRate, dateKey, duration, money, price, timeOf, WEEKDAYS, WEEKDAYS_SHORT, weekdayOf, dayTitle } from '../../lib/format'
import { savedBookings, type SavedBooking } from '../../lib/storage'
import { waLink } from '../../lib/whatsapp'
import { supabase } from '../../lib/supabase'
import { clientPath } from '../../lib/url'
import type { GalleryPhoto, PublicBooking, PublicBusiness, PublicReview, PublicService } from '../../lib/types'
import NotFound from '../NotFound'
import { shows } from '../../lib/appearance'
import { hasModule } from '../../lib/plans'
import { Announcement, BusinessHero, Centered, Closed, PoweredBy, Stars, usePublicBusiness } from './shared'

const WEEK = [1, 2, 3, 4, 5, 6, 0]

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
  const main = services.filter((s) => !s.is_extra)
  const extras = services.filter((s) => s.is_extra)
  const openDays = (business.schedule || []).filter((d) => d.is_open).map((d) => d.weekday)
  const minPrice = main.length ? Math.min(...main.map((s) => Number(s.price))) : 0
  const rate = cupRate(business)
  const team = hasModule(business.plan, 'empleados') ? business.staff || [] : []
  const look = business.appearance || {}
  const showPrices = shows(look, 'show_prices')
  const showDurations = shows(look, 'show_durations')
  const showReviews = shows(look, 'show_reviews')
  const showHours = shows(look, 'show_hours') && openDays.length > 0
  const today = business.today
  const todayOpen = today ? openDays.includes(weekdayOf(today)) && !(business.closed_days || []).includes(today) : false
  const rating = showReviews && business.rating && business.rating.count > 0 ? business.rating : null
  const book = (serviceId?: string) => clientPath(business.slug, serviceId ? `reservar?s=${serviceId}` : 'reservar')
  const wa = business.whatsapp ? waLink(business.whatsapp, `Hola, tengo una pregunta sobre ${business.name}.`) : null
  const bookLabel = look.book_label || 'Reservar cita'

  return (
    <div className="min-h-dvh pb-28">
      <BusinessHero
        business={business}
        rating={rating}
        status={today && showHours ? { open: todayOpen, label: todayOpen ? 'Abierto hoy' : 'Hoy cerrado' } : null}
        actions={
          <div className="flex flex-wrap items-center justify-center gap-2">
            {main.length > 0 && (
              <Link to={book()} className="inline-flex items-center gap-2 rounded-btn bg-[#fff] px-5 py-3 font-bold text-[#0f172a] shadow-lg shadow-black/10 transition active:scale-[0.98]">
                <Ico name="calendar" /> {bookLabel}
              </Link>
            )}
            {wa && (
              <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-btn bg-white/15 px-4 py-3 font-semibold text-white ring-1 ring-white/25 backdrop-blur transition hover:bg-white/25">
                <WhatsAppIcon className="h-5 w-5" /> WhatsApp
              </a>
            )}
            {look.maps_url && (
              <a href={look.maps_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-btn bg-white/15 px-4 py-3 font-semibold text-white ring-1 ring-white/25 backdrop-blur transition hover:bg-white/25">
                <Ico name="pin" /> Cómo llegar
              </a>
            )}
          </div>
        }
      />

      <main className="relative mx-auto -mt-10 max-w-xl space-y-5 px-4">
        <Highlights
          rating={rating}
          from={main.length > 0 && showPrices ? money(minPrice, currency) : null}
          days={showHours ? daysSummary(openDays) : null}
          count={main.length}
        />

        <Announcement text={look.announcement} />
        <MyBookings slug={business.slug} tz={tz} />

        <section>
          <SectionTitle eyebrow="Lo que hacemos" title="Servicios" />
          {main.length === 0 ? (
            <div className="card text-slate-500">Pronto publicaremos nuestros servicios.</div>
          ) : (
            <div className="space-y-2.5">
              {main.map((s) => (
                <ServiceCard key={s.id} s={s} to={book(s.id)} price={showPrices ? price(s.price, currency, rate) : null} showDuration={showDurations} />
              ))}
            </div>
          )}
          {extras.length > 0 && main.length > 0 && (
            <div className="card mt-3">
              <p className="font-bold">Complementos</p>
              <p className="text-sm text-slate-500">Añádelos a tu servicio al reservar.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {extras.map((s) => (
                  <span key={s.id} className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1.5 text-sm font-semibold text-brand">
                    + {s.name}
                    {showPrices && <span className="font-normal opacity-80">· {price(s.price, currency, rate)}</span>}
                  </span>
                ))}
              </div>
            </div>
          )}
          {rate && showPrices && (
            <p className="mt-3 text-center text-xs text-slate-500">Cambio en CUP a la tasa de hoy: 1 USD = {money(rate, 'CUP')}</p>
          )}
        </section>

        {team.length > 0 && main.length > 0 && (
          <section>
            <SectionTitle eyebrow="Quién te atiende" title="Nuestro equipo" />
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {team.map((s) => (
                <Link
                  key={s.id}
                  to={clientPath(business.slug, `reservar?p=${s.id}`)}
                  className="card flex flex-col items-center gap-2 py-5 text-center transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand/10 text-2xl font-extrabold text-brand">
                    {s.name.trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="w-full truncate font-bold">{s.name}</span>
                  <span className="text-xs font-semibold text-brand">Reservar con {s.name.split(' ')[0]} ›</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="card">
          <SectionTitle eyebrow="Fácil y rápido" title="Reserva en 3 pasos" inCard />
          <ol className="grid gap-3 sm:grid-cols-3">
            {[
              ['list', 'Elige', 'el servicio que quieras'],
              ['calendar', 'Escoge', 'el día y la hora libre'],
              ['check', 'Confirma', 'con tu nombre y teléfono'],
            ].map(([icon, t, d], i) => (
              <li key={t} className="flex items-center gap-3 sm:flex-col sm:text-center">
                <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                  <Ico name={icon} />
                  <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-white">{i + 1}</span>
                </span>
                <span className="text-sm text-slate-600"><b className="block text-slate-900">{t}</b>{d}</span>
              </li>
            ))}
          </ol>
        </section>

        {shows(look, 'show_gallery') && (business.gallery || []).length > 0 && <Gallery photos={business.gallery!} />}

        {rating && (business.reviews || []).length > 0 && <Reviews reviews={business.reviews!} rating={rating} tz={tz} />}

        {(showHours || business.address) && (
          <section className="card">
            <SectionTitle eyebrow="Visítanos" title="Dónde y cuándo" inCard />
            {business.address && (
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand"><Ico name="pin" /></span>
                <div className="min-w-0">
                  <p className="font-semibold">{business.address}</p>
                  {look.maps_url && (
                    <a href={look.maps_url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-brand">Ver en el mapa →</a>
                  )}
                </div>
              </div>
            )}
            {showHours && (
              <div className={`grid grid-cols-7 gap-1.5 ${business.address ? 'mt-4' : ''}`}>
                {WEEK.map((w) => {
                  const on = openDays.includes(w)
                  const isToday = today ? weekdayOf(today) === w : false
                  return (
                    <div
                      key={w}
                      className={`rounded-xl py-2 text-center text-xs font-semibold ${
                        on ? 'bg-brand/10 text-brand' : 'bg-slate-100 text-slate-400'
                      } ${isToday ? 'ring-2 ring-brand' : ''}`}
                      title={`${WEEKDAYS[w]}: ${on ? 'abierto' : 'cerrado'}`}
                    >
                      {WEEKDAYS_SHORT[w]}
                      <span className="mt-0.5 block text-[10px] font-medium opacity-80">{on ? 'Abre' : '—'}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )}

        {business.policies && (
          <section className="card">
            <SectionTitle eyebrow="Importante" title="Antes de tu cita" inCard />
            <p className="whitespace-pre-line text-slate-700">{business.policies}</p>
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
              <Ico name="refresh" className="mt-0.5 h-4 w-4 shrink-0" />
              Puedes cancelar tu cita hasta {business.cancel_notice_hours} h antes, o cambiar el día o la hora hasta {business.reschedule_notice_hours} h antes, desde el enlace que recibes al reservar.
            </p>
          </section>
        )}

        <section className="card text-center">
          <p className="text-lg font-bold">¿Tienes alguna pregunta?</p>
          <p className="text-sm text-slate-500">Escríbenos y te respondemos.</p>
          <div className="mt-4 space-y-2">
            {wa && (
              <LinkButton href={wa} variant="whatsapp" block newTab>
                <WhatsAppIcon /> Escribir por WhatsApp
              </LinkButton>
            )}
            <InstallButton appName={business.name} label={`Instalar la app de ${business.name}`} block />
          </div>
        </section>
        <PoweredBy />
      </main>

      {main.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur safe-bottom">
          <div className="mx-auto flex max-w-xl items-center gap-3">
            {showPrices && (
              <div className="shrink-0 leading-tight">
                <p className="text-xs text-slate-500">Desde</p>
                <p className="font-extrabold">{money(minPrice, currency)}</p>
              </div>
            )}
            <Link
              to={book()}
              className="flex flex-1 items-center justify-center gap-2 rounded-btn bg-brand bg-btn-grad py-3.5 text-lg font-bold text-white shadow-lg shadow-brand/30 active:scale-[0.98]"
            >
              {bookLabel}
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

/** "Lunes a sábado", "Lun, Mié y Vie"... */
function daysSummary(days: number[]): string {
  const idx = WEEK.map((w) => days.includes(w))
  const first = idx.indexOf(true)
  const last = idx.lastIndexOf(true)
  if (first >= 0 && idx.slice(first, last + 1).every(Boolean) && last > first) {
    return `${WEEKDAYS_SHORT[WEEK[first]]} a ${WEEKDAYS_SHORT[WEEK[last]]}`
  }
  const names = WEEK.filter((w) => days.includes(w)).map((w) => WEEKDAYS_SHORT[w])
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}` : names[0] || ''
}

/** Tres datos rápidos bajo la portada */
function Highlights({ rating, from, days, count }: { rating: PublicBusiness['rating']; from: string | null; days: string | null; count: number }) {
  const items: { icon: string; value: string; label: string }[] = []
  if (rating) items.push({ icon: 'star', value: Number(rating.avg).toFixed(1), label: `${rating.count} ${rating.count === 1 ? 'opinión' : 'opiniones'}` })
  if (from) items.push({ icon: 'tag', value: from, label: 'desde' })
  if (days) items.push({ icon: 'clock', value: days, label: 'abrimos' })
  if (items.length < 3 && count > 0) items.push({ icon: 'list', value: String(count), label: count === 1 ? 'servicio' : 'servicios' })
  if (items.length === 0) return null
  return (
    <div className={`grid divide-x divide-slate-100 rounded-2xl border border-slate-200 bg-white py-3 shadow-lg shadow-slate-900/5 ${items.length === 1 ? 'grid-cols-1' : items.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
      {items.slice(0, 3).map((it) => (
        <div key={it.icon} className="min-w-0 px-2 text-center">
          <p className="flex items-center justify-center gap-1 truncate font-extrabold">
            <Ico name={it.icon} className={`h-4 w-4 shrink-0 ${it.icon === 'star' ? 'text-amber-400' : 'text-brand'}`} />
            <span className="truncate">{it.value}</span>
          </p>
          <p className="truncate text-xs text-slate-500">{it.label}</p>
        </div>
      ))}
    </div>
  )
}

function SectionTitle({ eyebrow, title, inCard }: { eyebrow: string; title: string; inCard?: boolean }) {
  return (
    <div className={inCard ? 'mb-4' : 'mb-3 px-1'}>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">{eyebrow}</p>
      <h2 className="text-xl font-extrabold tracking-tight">{title}</h2>
    </div>
  )
}

function ServiceCard({ s, to, price, showDuration }: { s: PublicService; to: string; price: string | null; showDuration: boolean }) {
  return (
    <Link to={to} className="group card flex items-center gap-4 transition hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99]">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-lg font-extrabold text-brand">
        {s.name.trim().charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{s.name}</span>
        {s.description && <span className="mt-0.5 block text-sm text-slate-500">{s.description}</span>}
        {showDuration && (
          <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-slate-500">
            <Ico name="clock" className="h-3.5 w-3.5" /> {duration(s.duration_min)}
          </span>
        )}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        {price && <span className="text-right font-extrabold text-brand">{price}</span>}
        <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-slate-400 transition group-hover:text-brand">
          Reservar
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
        </span>
      </span>
    </Link>
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
  const hasHistory = savedBookings(slug).length > 0
  if (visible.length === 0) {
    if (!hasHistory) return null
    return (
      <Link to={clientPath(slug, 'mis-citas')} className="card flex items-center justify-between font-semibold">
        <span>📋 Mis citas</span>
        <span className="text-brand">Ver historial →</span>
      </Link>
    )
  }
  return (
    <section className="card border-brand/30 bg-brand/5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">Tus próximas citas</h2>
        <Link to={clientPath(slug, 'mis-citas')} className="text-sm font-semibold text-brand">Ver todas</Link>
      </div>
      <ul className="mt-2 divide-y divide-slate-100">
        {visible.map((b) => {
          const start = b.data?.starts_at || b.starts_at
          return (
            <li key={b.token}>
              <Link to={clientPath(slug, `cita/${b.token}`)} className="flex items-center justify-between gap-2 py-3">
                <span className="min-w-0 truncate">
                  <span className="font-semibold">{dayTitle(dateKey(start, tz))}</span>
                  <span className="text-slate-500"> · {timeOf(start, tz, true)}</span>
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

function Gallery({ photos }: { photos: GalleryPhoto[] }) {
  const [open, setOpen] = useState<number | null>(null)
  const current = open === null ? null : photos[open]

  useEffect(() => {
    if (open === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null)
      if (e.key === 'ArrowRight') setOpen((i) => (i === null ? i : (i + 1) % photos.length))
      if (e.key === 'ArrowLeft') setOpen((i) => (i === null ? i : (i - 1 + photos.length) % photos.length))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, photos.length])

  return (
    <section>
      <SectionTitle eyebrow="Galería" title="Nuestros trabajos" />
      {/* Mosaico: la primera foto más grande */}
      <div className="grid grid-cols-3 gap-1.5 overflow-hidden rounded-2xl">
        {photos.map((p, i) => (
          <button
            key={p.id}
            onClick={() => setOpen(i)}
            className={`relative aspect-square overflow-hidden bg-slate-100 ${i === 0 && photos.length % 3 === 0 ? 'col-span-2 row-span-2' : ''}`}
          >
            <img src={p.url} alt={p.caption || 'Trabajo'} loading="lazy" className="h-full w-full object-cover transition duration-300 hover:scale-105" />
          </button>
        ))}
      </div>
      {current && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/90" onClick={() => setOpen(null)} role="dialog" aria-modal>
          <div className="flex justify-end p-3">
            <button className="rounded-full p-2 text-white/80 hover:bg-white/10" aria-label="Cerrar">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
          <div className="flex flex-1 items-center justify-center px-3" onClick={(e) => e.stopPropagation()}>
            <img
              src={current.url}
              alt={current.caption || 'Trabajo'}
              className="max-h-[75dvh] max-w-full rounded-xl object-contain"
              onClick={() => setOpen(((open ?? 0) + 1) % photos.length)}
            />
          </div>
          <p className="p-4 pb-8 text-center text-white/90">
            {current.caption}
            <span className="ml-2 text-sm text-white/50">{(open ?? 0) + 1}/{photos.length}</span>
          </p>
        </div>
      )}
    </section>
  )
}

function Reviews({ reviews, rating, tz }: { reviews: PublicReview[]; rating: NonNullable<PublicBusiness['rating']>; tz: string }) {
  const [all, setAll] = useState(false)
  const shown = all ? reviews : reviews.slice(0, 3)
  return (
    <section id="opiniones" className="scroll-mt-4">
      <SectionTitle eyebrow="Opiniones" title="Lo que dicen nuestros clientes" />
      <div className="card mb-2.5 flex items-center gap-4">
        <p className="text-5xl font-extrabold tracking-tight">{Number(rating.avg).toFixed(1)}</p>
        <div>
          <Stars value={Number(rating.avg)} size={20} />
          <p className="text-sm text-slate-500">{rating.count} {rating.count === 1 ? 'opinión' : 'opiniones'} de clientes reales</p>
        </div>
      </div>
      <div className="space-y-2.5">
        {shown.map((r, i) => (
          <article key={i} className="card">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/10 font-bold text-brand">
                {r.name.trim().charAt(0).toUpperCase() || '·'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{r.name}</p>
                <p className="text-xs text-slate-400">{dayTitle(dateKey(r.created_at, tz))}</p>
              </div>
              <Stars value={r.rating} size={15} />
            </div>
            {r.comment && <p className="mt-3 text-slate-700">“{r.comment}”</p>}
            {r.reply && (
              <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
                <b>Respuesta del negocio:</b> {r.reply}
              </p>
            )}
          </article>
        ))}
      </div>
      {reviews.length > 3 && !all && (
        <button onClick={() => setAll(true)} className="mt-3 w-full rounded-btn py-2.5 text-sm font-semibold text-brand ring-1 ring-brand/30 hover:bg-brand/5">
          Ver las {reviews.length} opiniones
        </button>
      )}
    </section>
  )
}

function Ico({ name, className = 'h-5 w-5' }: { name: string; className?: string }) {
  const paths: Record<string, string> = {
    calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
    pin: 'M12 21s-7-6.2-7-11.5a7 7 0 0114 0C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
    clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
    list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
    check: 'M5 12l5 5 9-10',
    star: 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z',
    tag: 'M3 12V4h8l10 10-8 8L3 12zM7.5 8.5h.01',
    refresh: 'M20 11a8 8 0 00-14.9-3M4 4v4h4M4 13a8 8 0 0014.9 3M20 20v-4h-4',
  }
  return (
    <svg viewBox="0 0 24 24" className={className} fill={name === 'star' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={paths[name]} />
    </svg>
  )
}
