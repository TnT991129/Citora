import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Calendar, SlotPicker } from '../../components/Calendar'
import { Alert, Button, Field, flash, LinkButton, Modal, PageLoader, StatusBadge, WhatsAppIcon } from '../../components/ui'
import { applyAppearance } from '../../lib/appearance'
import { setBrandColor } from '../../lib/brand'
import { setAppManifest } from '../../lib/pwa'
import { errorMessage } from '../../lib/errors'
import { cupRate, dateKey, duration, longDate, money, price, timeOf, todayKey, weekdayOf, dayTitle } from '../../lib/format'
import { hasModule } from '../../lib/plans'
import { rememberBooking } from '../../lib/storage'
import { supabase } from '../../lib/supabase'
import type { PublicBooking, PublicBusiness } from '../../lib/types'
import { bookingUrl, clientPath } from '../../lib/url'
import { waLink } from '../../lib/whatsapp'
import { hasMainService, ServicePicker } from './ServicePicker'
import { Centered, PoweredBy, PublicHeader, Stars } from './shared'

export default function BookingPage() {
  const { slug, token } = useParams()
  const [params] = useSearchParams()
  const isNew = params.get('nueva') === '1'
  const [booking, setBooking] = useState<PublicBooking | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)

  const loadBooking = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_booking', { p_token: token })
    if (error) {
      setError(errorMessage(error))
      return
    }
    const b = data as PublicBooking | null
    setBooking(b)
    if (b) {
      setBrandColor(b.business.color_primary)
      applyAppearance(b.business.appearance)
      setAppManifest({ name: b.business.name, path: clientPath(b.business.slug).slice(1), color: b.business.color_primary, logo: b.business.logo_url })
      document.title = `Tu cita · ${b.business.name}`
      rememberBooking({ token: b.token, slug: b.business.slug, starts_at: b.starts_at })
    }
  }, [token])

  useEffect(() => {
    loadBooking()
  }, [loadBooking])

  if (error && booking === undefined) return <Centered><p className="text-slate-600">{error}</p></Centered>
  if (booking === undefined) return <PageLoader />
  if (booking === null || booking.business.slug !== slug) {
    return (
      <Centered>
        <h1 className="text-xl font-bold">No encontramos esta cita</h1>
        <p className="text-slate-600">Revisa el enlace.</p>
        <Link to={clientPath(slug || '')} className="font-semibold text-brand">Ir al negocio</Link>
      </Centered>
    )
  }

  const b = booking.business
  const tz = b.timezone
  const key = dateKey(booking.starts_at, tz)
  const time = timeOf(booking.starts_at, tz)
  const active = booking.status === 'pendiente' || booking.status === 'confirmada'
  const minutes = booking.services.reduce((a, s) => a + s.duration_min, 0)
  const link = bookingUrl(b.slug, booking.token)

  const waText = [
    `Hola, soy ${booking.customer_name}. Reservé una cita en ${b.name}:`,
    `📅 ${longDate(key)} a las ${time}`,
    `✂️ ${booking.services.map((s) => s.name).join(', ')}`,
    `💵 Total: ${price(booking.total, b.currency, booking.usd_rate)}`,
    booking.customer_note ? `📝 ${booking.customer_note}` : '',
    `Mi cita: ${link}`,
  ].filter(Boolean).join('\n')

  const cancel = async () => {
    setBusy(true)
    const { error } = await supabase.rpc('cancel_booking', { p_token: booking.token })
    setBusy(false)
    setConfirmCancel(false)
    if (error) setError(errorMessage(error))
    else {
      setError(null)
      loadBooking()
    }
  }

  return (
    <div className="min-h-dvh pb-10">
      <PublicHeader business={b} back />
      <main className="mx-auto max-w-xl space-y-4 px-4 py-5">
        {isNew && active && (
          <div className="rounded-2xl bg-emerald-50 p-4 text-emerald-900 ring-1 ring-emerald-200">
            <p className="text-lg font-bold">¡Reserva hecha! 🎉</p>
            {booking.business.appearance?.thanks_message && (
              <p className="mt-1 whitespace-pre-line">{booking.business.appearance.thanks_message}</p>
            )}
            <p className="mt-1 text-sm">Guarda este enlace: desde aquí puedes ver, cambiar o cancelar tu cita. También queda guardada en este móvil.</p>
          </div>
        )}

        <section className="card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500">Tu cita</p>
              <p className="mt-1 text-2xl font-extrabold">{dayTitle(key)}</p>
              <p className="text-xl font-bold text-brand">{time}</p>
              {booking.staff_name && <p className="text-sm text-slate-600">Con <b>{booking.staff_name}</b></p>}
            </div>
            <StatusBadge status={booking.status} />
          </div>
          <div className="mt-4 border-t border-slate-100 pt-3">
            {booking.services.map((s, i) => (
              <div key={i} className="flex justify-between py-1 text-slate-700">
                <span>{s.name}</span>
                <span className="text-right">{price(s.price, b.currency, booking.usd_rate)}</span>
              </div>
            ))}
            {Number(booking.discount || 0) > 0 && (
              <div className="flex justify-between py-1 font-medium text-emerald-700">
                <span>Descuento{booking.discount_code ? ` (${booking.discount_code})` : ''}</span>
                <span>-{money(Number(booking.discount), b.currency)}</span>
              </div>
            )}
            <div className="mt-2 flex justify-between border-t border-slate-100 pt-2 font-bold">
              <span>Total</span>
              <span className="text-right">{price(booking.total, b.currency, booking.usd_rate)}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">Duración aproximada: {duration(minutes)}</p>
          </div>
          {b.address && <p className="mt-3 text-sm text-slate-600">📍 {b.address}</p>}
          {booking.status === 'pendiente' && (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
              El negocio confirmará tu cita. Si quieres, avísale por WhatsApp ahora.
            </p>
          )}
        </section>

        {booking.customer && booking.customer.visits > 0 && (
          <p className="rounded-2xl bg-white px-4 py-3 text-center text-sm text-slate-600 ring-1 ring-slate-200">
            {booking.customer.visits === 1
              ? <>Ya has venido <b>1 vez</b> a {b.name}.</>
              : <>Llevas <b>{booking.customer.visits} visitas</b> a {b.name}. ¡Gracias por volver!</>}
            {' '}<Link to={clientPath(b.slug, 'mis-citas')} className="font-semibold text-brand">Mis citas</Link>
          </p>
        )}

        {(booking.can_review || booking.review) && (
          <ReviewBox booking={booking} onSaved={loadBooking} />
        )}

        {error && <Alert>{error}</Alert>}

        {active && b.whatsapp && (
          <LinkButton href={waLink(b.whatsapp, waText)} variant="whatsapp" size="lg" block newTab>
            <WhatsAppIcon /> Avisar al negocio por WhatsApp
          </LinkButton>
        )}

        {active && booking.can_change && (
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={() => setEditing(true)}>Editar cita</Button>
            <Button variant="danger" onClick={() => setConfirmCancel(true)}>Cancelar cita</Button>
          </div>
        )}
        {active && !booking.can_change && (
          <p className="text-center text-sm text-slate-500">
            Faltan menos de {b.cancel_notice_hours} h para tu cita. Para cambios, escribe al negocio por WhatsApp.
          </p>
        )}

        {!active && (
          <Link to={clientPath(b.slug, 'reservar')} className="flex w-full items-center justify-center rounded-btn bg-brand bg-btn-grad py-4 text-lg font-bold text-white">
            Reservar otra cita
          </Link>
        )}

        <PoweredBy />
      </main>

      <Modal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="¿Cancelar la cita?"
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" block onClick={() => setConfirmCancel(false)}>No, mantener</Button>
            <Button variant="danger" block onClick={cancel} loading={busy}>Sí, cancelar</Button>
          </div>
        }
      >
        <p className="text-slate-700">Se liberará tu turno del <b>{longDate(key)}</b> a las <b>{time}</b>.</p>
      </Modal>

      {editing && (
        <EditBooking
          booking={booking}
          onClose={() => setEditing(false)}
          onDone={() => {
            setEditing(false)
            flash('Cita actualizada')
            loadBooking()
          }}
        />
      )}
    </div>
  )
}

function EditBooking({ booking, onClose, onDone }: {
  booking: PublicBooking
  onClose: () => void
  onDone: () => void
}) {
  const tz = booking.business.timezone
  const original = booking.services.map((s) => s.id).filter((id): id is string => Boolean(id))
  const [biz, setBiz] = useState<PublicBusiness | null>(null)
  const [selected, setSelected] = useState<string[]>(original)
  const [staffId, setStaffId] = useState<string | null>(booking.staff_id || null)
  const [date, setDate] = useState<string | null>(dateKey(booking.starts_at, tz))
  const [time, setTime] = useState<string | null>(timeOf(booking.starts_at, tz))
  const [name, setName] = useState(booking.customer_name)
  const [note, setNote] = useState(booking.customer_note || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.rpc('get_public_business', { p_slug: booking.business.slug }).then(({ data }) => setBiz(data as PublicBusiness))
  }, [booking.business.slug])

  const services = biz?.services || []
  const same = selected.length === original.length && selected.every((id) => original.includes(id))
  const chosen = services.filter((s) => selected.includes(s.id))
  const minutes = same ? booking.services.reduce((a, s) => a + s.duration_min, 0) : chosen.reduce((a, s) => a + s.duration_min, 0)
  const total = same ? Number(booking.total) : chosen.reduce((a, s) => a + Number(s.price), 0)
  const rate = same ? booking.usd_rate : biz ? cupRate(biz) : null
  const team = biz && hasModule(biz.plan, 'empleados') ? biz.staff || [] : []
  const openDays = new Set((biz?.schedule || []).filter((d) => d.is_open).map((d) => d.weekday))
  const closed = new Set(biz?.closed_days || [])

  const save = async () => {
    if (!same && !hasMainService(services, selected)) return setError('Elige al menos un servicio principal.')
    if (!date || !time) return setError('Elige el día y la hora.')
    if (name.trim().length < 2) return setError('Escribe tu nombre.')
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('edit_booking', {
      p_token: booking.token,
      p_service_ids: selected,
      p_date: date,
      p_time: time,
      p_name: name.trim(),
      p_note: note.trim() || null,
      p_staff: staffId,
    })
    setBusy(false)
    if (error) {
      const msg = errorMessage(error)
      setError(msg)
      if (/turno|horario/i.test(msg)) setTime(null)
    } else onDone()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Editar mi cita"
      footer={<Button block onClick={save} loading={busy} disabled={!biz?.accepting}>Guardar cambios · {price(total, booking.business.currency, rate)}</Button>}
    >
      {!biz ? (
        <PageLoader />
      ) : !biz.accepting ? (
        <Alert kind="warning">El negocio no está recibiendo reservas ahora. Para cambios, escríbele por WhatsApp.</Alert>
      ) : (
        <div className="space-y-5">
          <div>
            <h3 className="mb-2 font-bold">Servicios</h3>
            <ServicePicker
              services={services}
              selected={selected}
              onChange={(ids) => setSelected(ids.filter((id) => services.some((s) => s.id === id)))}
              currency={booking.business.currency}
              rate={cupRate(biz)}
            />
          </div>
          {team.length > 0 && (
            <div>
              <h3 className="mb-2 font-bold">¿Con quién?</h3>
              <div className="flex flex-wrap gap-2">
                {[{ id: null, name: 'Cualquiera' }, ...team].map((s) => (
                  <button
                    key={s.id || 'any'}
                    type="button"
                    onClick={() => {
                      setStaffId(s.id)
                      setTime(null)
                    }}
                    className={`rounded-full px-4 py-2 text-sm font-semibold ${staffId === s.id ? 'bg-brand text-white shadow' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <h3 className="mb-2 font-bold">Día y hora</h3>
            <Calendar
              today={biz.today || todayKey(tz)}
              maxDays={biz.max_days_ahead || 60}
              isOpen={(k) => openDays.has(weekdayOf(k)) && !closed.has(k)}
              value={date}
              onChange={(d) => {
                setDate(d)
                setTime(null)
              }}
            />
            {date && (
              <div className="mt-3">
                <SlotPicker slug={biz.slug} date={date} duration={minutes || 60} value={time} onChange={setTime} staff={staffId} excludeToken={booking.token} />
              </div>
            )}
          </div>
          <Field label="Tu nombre">
            <input className="input" autoComplete="name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Nota para el negocio (opcional)">
            <textarea className="input min-h-[80px]" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <p className="text-xs text-slate-500">
            Si cambias los servicios, el día, la hora o el profesional, el negocio tendrá que volver a confirmar tu cita.
          </p>
          {error && <Alert>{error}</Alert>}
        </div>
      )}
    </Modal>
  )
}

function ReviewBox({ booking, onSaved }: { booking: PublicBooking; onSaved: () => void }) {
  const [editing, setEditing] = useState(!booking.review)
  const [rating, setRating] = useState(booking.review?.rating || 0)
  const [comment, setComment] = useState(booking.review?.comment || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (!rating) return setError('Elige de 1 a 5 estrellas.')
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('submit_review', { p_token: booking.token, p_rating: rating, p_comment: comment })
    setBusy(false)
    if (error) return setError(errorMessage(error))
    setEditing(false)
    onSaved()
  }

  if (!editing && booking.review) {
    return (
      <section className="card">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold">Tu opinión</h2>
          <Stars value={booking.review.rating} size={18} />
        </div>
        {booking.review.comment && <p className="mt-2 text-slate-700">{booking.review.comment}</p>}
        {booking.review.reply && (
          <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600"><b>Respuesta del negocio:</b> {booking.review.reply}</p>
        )}
        {booking.can_review && (
          <button onClick={() => setEditing(true)} className="mt-2 text-sm font-semibold text-brand">Cambiar mi opinión</button>
        )}
      </section>
    )
  }

  return (
    <section className="card">
      <h2 className="font-bold">¿Qué tal tu visita?</h2>
      <p className="text-sm text-slate-500">Tu opinión ayuda a {booking.business.name} y a otros clientes.</p>
      <div className="mt-3 flex justify-center"><Stars value={rating} onChange={setRating} size={34} /></div>
      <textarea
        className="input mt-3 min-h-[80px]"
        maxLength={500}
        placeholder="Cuéntanos qué te pareció (opcional)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      <Button block className="mt-3" onClick={save} loading={busy} disabled={!rating}>Enviar opinión</Button>
    </section>
  )
}
