import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Calendar, SlotPicker } from '../../components/Calendar'
import { Alert, Button, Field, flash, LinkButton, Modal, PageLoader, StatusBadge, WhatsAppIcon } from '../../components/ui'
import { applyAppearance } from '../../lib/appearance'
import { setBrandColor } from '../../lib/brand'
import { setAppManifest } from '../../lib/pwa'
import { errorMessage } from '../../lib/errors'
import { goToMarket } from '../../lib/market'
import { cupRate, dateKey, duration, longDate, money, price, timeOf, todayKey, weekdayOf, dayTitle } from '../../lib/format'
import { buildAppointmentIcs, downloadIcs } from '../../lib/ics'
import { hasModule } from '../../lib/plans'
import { keepStaff, MIXED_PEOPLE, ownerInfo, requiredIds, staffDoes, whoAttends } from '../../lib/staff'
import { isPushSubscribed, pushProblemMessage, pushSupported, subscribeCustomerPush } from '../../lib/push'
import { rememberBooking } from '../../lib/storage'
import { supabase } from '../../lib/supabase'
import type { PublicBooking, PublicBusiness } from '../../lib/types'
import { bookingUrl, clientPath } from '../../lib/url'
import { waLink } from '../../lib/whatsapp'
import { hasMainService, ServicePicker } from './ServicePicker'
import { applyOptions, missingOption, optionsFor, type OptionChoice } from '../../lib/serviceOptions'
import { Centered, PoweredBy, PublicHeader, Stars } from './shared'
import { t } from '../../lib/i18n'

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
    // Negocio de la otra versión (Cuba o /int/): la cita se abre allí
    if (b && goToMarket(b.business.market)) return
    setBooking(b)
    if (b) {
      setBrandColor(b.business.color_primary)
      applyAppearance(b.business.appearance)
      setAppManifest({ name: b.business.name, path: clientPath(b.business.slug).slice(1), color: b.business.color_primary, logo: b.business.logo_url })
      document.title = t('Tu cita · {name}', { name: b.business.name })
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
        <h1 className="text-xl font-bold">{t('No encontramos esta cita')}</h1>
        <p className="text-slate-600">{t('Revisa el enlace.')}</p>
        <Link to={clientPath(slug || '')} className="font-semibold text-brand">{t('Ir al negocio')}</Link>
      </Centered>
    )
  }

  const b = booking.business
  const tz = b.timezone
  const key = dateKey(booking.starts_at, tz)
  const time = timeOf(booking.starts_at, tz, true)
  const active = booking.status === 'pendiente' || booking.status === 'confirmada'
  const minutes = booking.services.reduce((a, s) => a + s.duration_min, 0)
  const link = bookingUrl(b.slug, booking.token)

  const waText = [
    t('Hola, soy {customer_name}. Reservé una cita en {name}:', { customer_name: booking.customer_name, name: b.name }),
    t('📅 {longDate} a las {time}', { longDate: longDate(key), time: time }),
    `✂️ ${booking.services.map((s) => s.name).join(', ')}`,
    t('💵 Total: {price}', { price: price(booking.total, b.currency, booking.usd_rate) }),
    booking.customer_note ? `📝 ${booking.customer_note}` : '',
    t('Mi cita: {link}', { link: link }),
  ].filter(Boolean).join('\n')

  const addToCalendar = () => {
    downloadIcs(`cita-${b.slug}.ics`, buildAppointmentIcs({
      token: booking.token,
      startsAt: booking.starts_at,
      endsAt: booking.ends_at,
      title: `${booking.services.map((s) => s.name).join(', ')} · ${b.name}`,
      location: b.address,
      description: booking.customer_note,
    }))
  }

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
            <p className="text-lg font-bold">{t('¡Reserva hecha! 🎉')}</p>
            {booking.business.appearance?.thanks_message && (
              <p className="mt-1 whitespace-pre-line">{booking.business.appearance.thanks_message}</p>
            )}
            <p className="mt-1 text-sm">{t('Guarda este enlace: desde aquí puedes ver, cambiar o cancelar tu cita. También queda guardada en este móvil.')}</p>
          </div>
        )}

        <section className="card">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-slate-500">{t('Tu cita')}</p>
              <p className="mt-1 truncate text-2xl font-extrabold">{dayTitle(key)}</p>
              <p className="text-xl font-bold text-brand">{time}</p>
              {booking.staff_name && <p className="truncate text-sm text-slate-600">{t('Con')}{' '}<b>{booking.staff_name}</b></p>}
            </div>
            <StatusBadge status={booking.status} />
          </div>
          <div className="mt-4 border-t border-slate-100 pt-3">
            {booking.services.map((s, i) => (
              <div key={i} className="flex justify-between gap-3 py-1 text-slate-700">
                <span className="min-w-0 break-words">{s.name}</span>
                <span className="shrink-0 text-right">{price(s.price, b.currency, booking.usd_rate)}</span>
              </div>
            ))}
            {Number(booking.discount || 0) > 0 && (
              <div className="flex justify-between gap-3 py-1 font-medium text-emerald-700">
                <span className="min-w-0 break-words">{t('Descuento')}{booking.discount_code ? ` (${booking.discount_code})` : ''}</span>
                <span className="shrink-0 text-right">-{money(Number(booking.discount), b.currency)}</span>
              </div>
            )}
            <div className="mt-2 flex justify-between gap-3 border-t border-slate-100 pt-2 font-bold">
              <span className="shrink-0">{t('Total')}</span>
              <span className="min-w-0 text-right">{price(booking.total, b.currency, booking.usd_rate)}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">{t('Duración aproximada:')}{' '}{duration(minutes)}</p>
          </div>
          {b.address && <p className="mt-3 text-sm text-slate-600">📍 {b.address}</p>}
          {booking.status === 'pendiente' && (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {t('El negocio confirmará tu cita. Si quieres, avísale por WhatsApp ahora.')}
            </p>
          )}
        </section>

        {booking.customer && booking.customer.visits > 0 && (
          <p className="rounded-2xl bg-white px-4 py-3 text-center text-sm text-slate-600 ring-1 ring-slate-200">
            {booking.customer.visits === 1
              ? <>{t('Ya has venido')}{' '}<b>{t('1 vez')}</b> {t('a')}{' '}{b.name}.</>
              : <>{t('Llevas')}{' '}<b>{booking.customer.visits} {t('visitas')}</b> {t('a')}{' '}{b.name}{t('. ¡Gracias por volver!')}</>}
            {' '}<Link to={clientPath(b.slug, 'mis-citas')} className="font-semibold text-brand">{t('Mis citas')}</Link>
          </p>
        )}

        {booking.customer && b.loyalty_enabled && b.loyalty_every && (
          <LoyaltyNote visits={booking.customer.visits} every={b.loyalty_every} reward={b.loyalty_reward} />
        )}

        {active && <PushReminderBox token={booking.token} />}

        {(booking.can_review || booking.review) && (
          <ReviewBox booking={booking} onSaved={loadBooking} />
        )}

        {error && <Alert>{error}</Alert>}

        {active && b.whatsapp && (
          <LinkButton href={waLink(b.whatsapp, waText)} variant="whatsapp" size="lg" block newTab>
            <WhatsAppIcon /> {t('Avisar al negocio por WhatsApp')}
          </LinkButton>
        )}
        {active && <Button variant="secondary" block onClick={addToCalendar}>{t('📅 Agregar al calendario')}</Button>}

        {active && (booking.can_cancel || booking.can_edit) && (
          <div className={`grid gap-3 ${booking.can_edit && booking.can_cancel ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {booking.can_edit && <Button variant="secondary" onClick={() => setEditing(true)}>{t('Editar cita')}</Button>}
            {booking.can_cancel && <Button variant="danger" onClick={() => setConfirmCancel(true)}>{t('Cancelar cita')}</Button>}
          </div>
        )}
        {active && !booking.can_cancel && !booking.can_edit && (
          <p className="text-center text-sm text-slate-500">
            {t('Ya no se puede cambiar ni cancelar desde aquí. Para cambios, escribe al negocio por WhatsApp.')}
          </p>
        )}

        {!active && (
          <Link to={clientPath(b.slug, 'reservar')} className="flex w-full items-center justify-center rounded-btn bg-brand bg-btn-grad py-4 text-lg font-bold text-white">
            {t('Reservar otra cita')}
          </Link>
        )}

        <PoweredBy />
      </main>

      <Modal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title={t('¿Cancelar la cita?')}
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" block onClick={() => setConfirmCancel(false)}>{t('No, mantener')}</Button>
            <Button variant="danger" block onClick={cancel} loading={busy}>{t('Sí, cancelar')}</Button>
          </div>
        }
      >
        <p className="text-slate-700">{t('Se liberará tu turno del')}{' '}<b>{longDate(key)}</b> {t('a las')}{' '}<b>{time}</b>.</p>
      </Modal>

      {editing && (
        <EditBooking
          booking={booking}
          onClose={() => setEditing(false)}
          onDone={() => {
            setEditing(false)
            flash(t('Cita actualizada'))
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
  // option_id de la cita: "o1" o, si eligió varias, "o1,o3"
  const originalChoice: OptionChoice = Object.fromEntries(booking.services.filter((s) => s.id && s.option_id).map((s) => [s.id!, s.option_id!.split(',')]))
  const [choice, setChoice] = useState<OptionChoice>(originalChoice)
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
    && Object.entries(originalChoice).every(([id, o]) => [...(choice[id] || [])].sort().join(',') === [...o].sort().join(','))
  const chosen = applyOptions(services.filter((s) => selected.includes(s.id)), choice)
  const minutes = same ? booking.services.reduce((a, s) => a + s.duration_min, 0) : chosen.reduce((a, s) => a + s.duration_min, 0)
  const total = same ? Number(booking.total) : chosen.reduce((a, s) => a + Number(s.price), 0)
  const rate = same ? booking.usd_rate : biz ? cupRate(biz) : null
  const team = biz && hasModule(biz.plan, 'empleados') ? biz.staff || [] : []
  const eligibleTeam = team.filter((s) => staffDoes(s, requiredIds(selected, services, team)))
  const who = whoAttends(selected, services, team)
  const openDays = new Set((biz?.schedule || []).filter((d) => d.is_open).map((d) => d.weekday))
  const closed = new Set(biz?.closed_days || [])

  const save = async () => {
    if (!same && !hasMainService(services, selected)) return setError(t('Elige al menos un servicio principal.'))
    if (!same && who === null) return setError(t(MIXED_PEOPLE))
    const noOption = !same && missingOption(services, selected, choice)
    if (noOption) return setError(t('Elige una opción de «{name}».', { name: noOption.name }))
    if (!date || !time) return setError(t('Elige el día y la hora.'))
    if (name.trim().length < 2) return setError(t('Escribe tu nombre.'))
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('edit_booking', {
      p_token: booking.token,
      p_service_ids: selected,
      p_date: date,
      p_time: time,
      p_name: name.trim(),
      p_note: note.trim() || null,
      p_staff: who === 'dueno' ? null : eligibleTeam.length === 1 ? eligibleTeam[0].id : staffId,
      p_options: optionsFor(selected, choice),
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
      title={t('Editar mi cita')}
      footer={<Button block onClick={save} loading={busy} disabled={!biz?.accepting}>{t('Guardar cambios ·')}{' '}{price(total, booking.business.currency, rate)}</Button>}
    >
      {!biz ? (
        <PageLoader />
      ) : !biz.accepting ? (
        <Alert kind="warning">{t('El negocio no está recibiendo reservas ahora. Para cambios, escríbele por WhatsApp.')}</Alert>
      ) : (
        <div className="space-y-5">
          <div>
            <h3 className="mb-2 font-bold">{t('Servicios')}</h3>
            <ServicePicker
              services={services}
              selected={selected}
              onChange={(ids) => {
                const next = ids.filter((id) => services.some((s) => s.id === id))
                setSelected(next)
                // Si el profesional elegido no hace los nuevos servicios, pasa a "Cualquiera"
                const kept = keepStaff(team, staffId, requiredIds(next, services, team))
                if (kept !== staffId) {
                  setStaffId(kept)
                  setTime(null)
                }
              }}
              choice={choice}
              onChoice={setChoice}
              currency={booking.business.currency}
              rate={cupRate(biz)}
              team={team}
              owner={ownerInfo(biz)}
            />
          </div>
          {team.length > 0 && who !== 'dueno' && eligibleTeam.length >= 2 && (
            <div>
              <h3 className="mb-2 font-bold">{t('¿Con quién?')}</h3>
              <div className="flex flex-wrap gap-2">
                {[{ id: null, name: t('Cualquiera') }, ...eligibleTeam].map((s) => (
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
            <h3 className="mb-2 font-bold">{t('Día y hora')}</h3>
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
                <SlotPicker slug={biz.slug} date={date} duration={minutes || 60} value={time} onChange={setTime} staff={who === 'dueno' ? null : eligibleTeam.length === 1 ? eligibleTeam[0].id : staffId} serviceIds={selected} excludeToken={booking.token} />
              </div>
            )}
          </div>
          <Field label={t('Tu nombre')}>
            <input className="input" autoComplete="name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={t('Nota para el negocio (opcional)')}>
            <textarea className="input min-h-[80px]" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <p className="text-xs text-slate-500">
            {t('Si cambias los servicios, el día, la hora o el profesional, el negocio tendrá que volver a confirmar tu cita.')}
            {booking.business.max_reschedules != null && (
              <> {t('Cambios de día u hora usados:')}{' '}{booking.reschedule_count} {t('de')}{' '}{booking.business.max_reschedules}.</>
            )}
          </p>
          {error && <Alert>{error}</Alert>}
        </div>
      )}
    </Modal>
  )
}

function LoyaltyNote({ visits, every, reward }: { visits: number; every: number; reward: string | null }) {
  if (visits <= 0) return null
  const hit = visits % every === 0
  const left = every - (visits % every)
  return (
    <div className={`rounded-2xl p-4 text-center text-sm ring-1 ${hit ? 'bg-amber-50 text-amber-900 ring-amber-200' : 'bg-white text-slate-600 ring-slate-200'}`}>
      {hit
        ? <>{t('🎉 ¡Llegaste a tus')}{' '}<b>{visits} {t('visitas')}</b>! {reward ? <>{t('Pregunta por:')}{' '}<b>{reward}</b></> : t('Pregunta por tu premio.')}</>
        : <>{t('Te')}{' '}{left === 1 ? t('falta') : t('faltan')} <b>{left} {left === 1 ? t('visita') : t('visitas')}</b> {t('para tu premio')}{reward ? <>: <b>{reward}</b></> : ''}.</>}
    </div>
  )
}

function PushReminderBox({ token }: { token: string }) {
  const [on, setOn] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (pushSupported()) isPushSubscribed().then(setOn)
  }, [])

  if (!pushSupported() || on === true) return null

  const activate = async () => {
    setBusy(true)
    const res = await subscribeCustomerPush(token)
    setBusy(false)
    if (res !== true) return flash(pushProblemMessage(res))
    setOn(true)
    flash(t('Listo, te avisaremos en este dispositivo'))
  }

  return (
    <button
      onClick={activate}
      disabled={busy}
      className="w-full rounded-2xl bg-white px-4 py-3 text-left text-sm ring-1 ring-slate-200"
    >
      🔔 <span className="font-semibold text-brand">{t('Avisarme de esta cita')}</span> {t('en este dispositivo (recordatorio, si se confirma o si cambia).')}
    </button>
  )
}

function ReviewBox({ booking, onSaved }: { booking: PublicBooking; onSaved: () => void }) {
  const [editing, setEditing] = useState(!booking.review)
  const [rating, setRating] = useState(booking.review?.rating || 0)
  const [comment, setComment] = useState(booking.review?.comment || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (!rating) return setError(t('Elige de 1 a 5 estrellas.'))
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
          <h2 className="font-bold">{t('Tu opinión')}</h2>
          <Stars value={booking.review.rating} size={18} />
        </div>
        {booking.review.comment && <p className="mt-2 text-slate-700">{booking.review.comment}</p>}
        {booking.review.reply && (
          <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600"><b>{t('Respuesta del negocio:')}</b> {booking.review.reply}</p>
        )}
        {booking.can_review && (
          <button onClick={() => setEditing(true)} className="mt-2 text-sm font-semibold text-brand">{t('Cambiar mi opinión')}</button>
        )}
      </section>
    )
  }

  return (
    <section className="card">
      <h2 className="font-bold">{t('¿Qué tal tu visita?')}</h2>
      <p className="text-sm text-slate-500">{t('Tu opinión ayuda a')}{' '}{booking.business.name} {t('y a otros clientes.')}</p>
      <div className="mt-3 flex justify-center"><Stars value={rating} onChange={setRating} size={34} /></div>
      <textarea
        className="input mt-3 min-h-[80px]"
        maxLength={500}
        placeholder={t('Cuéntanos qué te pareció (opcional)')}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      <Button block className="mt-3" onClick={save} loading={busy} disabled={!rating}>{t('Enviar opinión')}</Button>
    </section>
  )
}
