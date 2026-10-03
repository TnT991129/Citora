import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Calendar, SlotPicker } from '../../components/Calendar'
import { Alert, Button, LinkButton, Modal, PageLoader, StatusBadge, WhatsAppIcon } from '../../components/ui'
import { setBrandColor } from '../../lib/brand'
import { errorMessage } from '../../lib/errors'
import { dateKey, duration, longDate, money, timeOf, todayKey, weekdayOf, dayTitle } from '../../lib/format'
import { rememberBooking } from '../../lib/storage'
import { supabase } from '../../lib/supabase'
import type { PublicBooking, PublicBusiness } from '../../lib/types'
import { bookingUrl } from '../../lib/url'
import { waLink } from '../../lib/whatsapp'
import { Centered, PoweredBy, PublicHeader } from './shared'

export default function BookingPage() {
  const { slug, token } = useParams()
  const [params] = useSearchParams()
  const isNew = params.get('nueva') === '1'
  const [booking, setBooking] = useState<PublicBooking | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [rescheduling, setRescheduling] = useState(false)
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
        <Link to={`/${slug}`} className="font-semibold text-brand">Ir al negocio</Link>
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
    `💵 Total: ${money(booking.total, b.currency)}`,
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
            <p className="mt-1 text-sm">Guarda este enlace: desde aquí puedes ver, cambiar o cancelar tu cita. También queda guardada en este móvil.</p>
          </div>
        )}

        <section className="card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500">Tu cita</p>
              <p className="mt-1 text-2xl font-extrabold">{dayTitle(key)}</p>
              <p className="text-xl font-bold text-brand">{time}</p>
            </div>
            <StatusBadge status={booking.status} />
          </div>
          <div className="mt-4 border-t border-slate-100 pt-3">
            {booking.services.map((s, i) => (
              <div key={i} className="flex justify-between py-1 text-slate-700">
                <span>{s.name}</span>
                <span>{money(s.price, b.currency)}</span>
              </div>
            ))}
            <div className="mt-2 flex justify-between border-t border-slate-100 pt-2 font-bold">
              <span>Total</span>
              <span>{money(booking.total, b.currency)}</span>
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

        {error && <Alert>{error}</Alert>}

        {active && b.whatsapp && (
          <LinkButton href={waLink(b.whatsapp, waText)} variant="whatsapp" size="lg" block newTab>
            <WhatsAppIcon /> Avisar al negocio por WhatsApp
          </LinkButton>
        )}

        {active && booking.can_change && (
          <div className="grid grid-cols-2 gap-3">
            {booking.reschedule_count < 1 && (
              <Button variant="secondary" onClick={() => setRescheduling(true)}>Cambiar fecha</Button>
            )}
            <Button variant="danger" onClick={() => setConfirmCancel(true)} className={booking.reschedule_count >= 1 ? 'col-span-2' : ''}>
              Cancelar cita
            </Button>
          </div>
        )}
        {active && !booking.can_change && (
          <p className="text-center text-sm text-slate-500">
            Faltan menos de {b.cancel_notice_hours} h para tu cita. Para cambios, escribe al negocio por WhatsApp.
          </p>
        )}

        {!active && (
          <Link to={`/${b.slug}/reservar`} className="flex w-full items-center justify-center rounded-2xl bg-brand py-4 text-lg font-bold text-white">
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

      {rescheduling && (
        <Reschedule
          booking={booking}
          minutes={minutes}
          onClose={() => setRescheduling(false)}
          onDone={() => {
            setRescheduling(false)
            loadBooking()
          }}
        />
      )}
    </div>
  )
}

function Reschedule({ booking, minutes, onClose, onDone }: {
  booking: PublicBooking
  minutes: number
  onClose: () => void
  onDone: () => void
}) {
  const [biz, setBiz] = useState<PublicBusiness | null>(null)
  const [date, setDate] = useState<string | null>(null)
  const [time, setTime] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.rpc('get_public_business', { p_slug: booking.business.slug }).then(({ data }) => setBiz(data as PublicBusiness))
  }, [booking.business.slug])

  const save = async () => {
    if (!date || !time) return setError('Elige el día y la hora.')
    setBusy(true)
    const { error } = await supabase.rpc('reschedule_booking', { p_token: booking.token, p_date: date, p_time: time })
    setBusy(false)
    if (error) {
      setError(errorMessage(error))
      setTime(null)
    } else onDone()
  }

  const openDays = new Set((biz?.schedule || []).filter((d) => d.is_open).map((d) => d.weekday))
  const closed = new Set(biz?.closed_days || [])

  return (
    <Modal
      open
      onClose={onClose}
      title="Cambiar fecha"
      footer={<Button block onClick={save} loading={busy} disabled={!date || !time}>Guardar cambio</Button>}
    >
      {!biz ? (
        <PageLoader />
      ) : !biz.accepting ? (
        <Alert kind="warning">El negocio no está recibiendo reservas ahora.</Alert>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">Solo puedes cambiar la fecha una vez.</p>
          <Calendar
            today={biz.today || todayKey(booking.business.timezone)}
            maxDays={biz.max_days_ahead || 60}
            isOpen={(k) => openDays.has(weekdayOf(k)) && !closed.has(k)}
            value={date}
            onChange={(d) => {
              setDate(d)
              setTime(null)
            }}
          />
          {date && <SlotPicker slug={biz.slug} date={date} duration={minutes} value={time} onChange={setTime} />}
          {error && <Alert>{error}</Alert>}
        </div>
      )}
    </Modal>
  )
}
