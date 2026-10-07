import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Calendar, SlotPicker } from '../../components/Calendar'
import { Alert, Button, Field, PageLoader } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { duration, money, weekdayOf, zonedToIso, dayTitle } from '../../lib/format'
import { hasModule } from '../../lib/plans'
import { load, rememberBooking, save } from '../../lib/storage'
import { supabase } from '../../lib/supabase'
import { clientPath } from '../../lib/url'
import NotFound from '../NotFound'
import { Closed, PublicHeader, usePublicBusiness } from './shared'

const STEP_TITLES = ['Elige el servicio', 'Elige día y hora', 'Tus datos', 'Confirma tu cita']

export default function BookingFlow() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { business } = usePublicBusiness(slug)
  const saved = load<{ name: string; phone: string }>('citora:cliente', { name: '', phone: '' })

  const [step, setStep] = useState(0)
  const [selected, setSelected] = useState<string[]>([])
  const [date, setDate] = useState<string | null>(null)
  const [time, setTime] = useState<string | null>(null)
  const [name, setName] = useState(saved.name)
  const [phone, setPhone] = useState(saved.phone)
  const [note, setNote] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [staffId, setStaffId] = useState<string | null>(null)
  const [coupon, setCoupon] = useState<{ code: string; discount: number; total: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const services = business?.services || []
  const chosen = useMemo(() => services.filter((s) => selected.includes(s.id)), [services, selected])
  const total = chosen.reduce((a, s) => a + Number(s.price), 0)
  const minutes = chosen.reduce((a, s) => a + s.duration_min, 0)

  // Si cambian los servicios, el descuento se vuelve a calcular
  useEffect(() => setCoupon(null), [selected])

  if (business === undefined) return <PageLoader />
  if (business === null) return <NotFound />
  if (!business.accepting) return <Closed business={business} />

  const currency = business.currency!
  const team = hasModule(business.plan, 'empleados') ? business.staff || [] : []
  const openDays = new Set((business.schedule || []).filter((d) => d.is_open).map((d) => d.weekday))
  const closed = new Set(business.closed_days || [])
  const isOpen = (key: string) => openDays.has(weekdayOf(key)) && !closed.has(key)

  const go = (n: number) => {
    setError(null)
    setStep(n)
    window.scrollTo(0, 0)
  }

  const next = () => {
    if (step === 0 && chosen.length === 0) return setError('Elige al menos un servicio.')
    if (step === 1 && (!date || !time)) return setError('Elige el día y la hora.')
    if (step === 2) {
      if (name.trim().length < 2) return setError('Escribe tu nombre.')
      if (phone.replace(/\D/g, '').length < 8) return setError('Escribe tu teléfono (al menos 8 dígitos).')
    }
    go(step + 1)
  }

  const confirm = async () => {
    if (!accepted) return setError('Acepta las condiciones para continuar.')
    setBusy(true)
    setError(null)
    save('citora:cliente', { name: name.trim(), phone: phone.trim() })
    const { data, error } = await supabase.rpc('create_booking', {
      p_slug: business.slug,
      p_service_ids: selected,
      p_date: date,
      p_time: time,
      p_name: name.trim(),
      p_phone: phone.trim(),
      p_note: note.trim() || null,
      p_code: coupon?.code || null,
      p_staff: staffId,
    })
    setBusy(false)
    if (error) {
      const msg = errorMessage(error)
      setError(msg)
      if (/turno|horario/i.test(msg)) {
        setTime(null)
        setStep(1)
      }
      if (/código de descuento/i.test(msg)) setCoupon(null)
      return
    }
    const token = data as string
    rememberBooking({ token, slug: business.slug, starts_at: zonedToIso(date!, time!, business.timezone) })
    navigate(`${clientPath(business.slug, `cita/${token}`)}?nueva=1`, { replace: true })
  }

  return (
    <div className="min-h-dvh pb-28">
      <PublicHeader business={business} back />
      <main className="mx-auto max-w-xl px-4 py-5">
        <div className="mb-4 flex gap-1.5">
          {STEP_TITLES.map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-brand' : 'bg-slate-200'}`} />
          ))}
        </div>
        <h1 className="text-2xl font-bold">{STEP_TITLES[step]}</h1>

        {step === 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-sm text-slate-500">Puedes elegir varios.</p>
            {services.map((s) => {
              const on = selected.includes(s.id)
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelected(on ? selected.filter((x) => x !== s.id) : [...selected, s.id])}
                  className={`card flex w-full items-center gap-3 text-left transition ${on ? 'ring-2 ring-brand' : ''}`}
                >
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${on ? 'border-brand bg-brand text-white' : 'border-slate-300'}`}>
                    {on && <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12l5 5 9-10" /></svg>}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{s.name}</span>
                    <span className="block text-sm text-slate-500">{duration(s.duration_min)}</span>
                  </span>
                  <span className="font-semibold">{money(s.price, currency)}</span>
                </button>
              )
            })}
          </div>
        )}

        {step === 1 && (
          <div className="mt-4 space-y-5">
            {team.length > 0 && (
              <div>
                <h2 className="mb-2 font-semibold">¿Con quién?</h2>
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
            <div className="card">
              <Calendar
                today={business.today!}
                maxDays={business.max_days_ahead!}
                isOpen={isOpen}
                value={date}
                onChange={(d) => {
                  setDate(d)
                  setTime(null)
                }}
              />
            </div>
            {date && (
              <div>
                <h2 className="mb-2 font-semibold">{dayTitle(date)}</h2>
                <SlotPicker
                  slug={business.slug}
                  date={date}
                  duration={minutes}
                  value={time}
                  onChange={setTime}
                  staff={staffId}
                  whenFull={hasModule(business.plan, 'espera') ? <WaitlistForm slug={business.slug} date={date} name={name} phone={phone} /> : null}
                />
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="mt-4 space-y-4">
            <Field label="Tu nombre">
              <input className="input" autoComplete="name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Tu teléfono (WhatsApp)" hint="El negocio te escribirá aquí si hace falta.">
              <input className="input" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="53 5555 5555" />
            </Field>
            <Field label="Nota para el negocio (opcional)">
              <textarea className="input min-h-[90px]" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Algo que debamos saber" />
            </Field>
          </div>
        )}

        {step === 3 && (
          <div className="mt-4 space-y-4">
            <div className="card space-y-3">
              <Row label="Día" value={<span>{dayTitle(date!)}</span>} />
              <Row label="Hora" value={time!} />
              {team.length > 0 && <Row label="Con" value={team.find((s) => s.id === staffId)?.name || 'Cualquiera disponible'} />}
              <Row label="Nombre" value={name} />
              <Row label="Teléfono" value={phone} />
              <div className="border-t border-slate-100 pt-3">
                {chosen.map((s) => (
                  <div key={s.id} className="flex justify-between py-1 text-slate-700">
                    <span>{s.name}</span>
                    <span>{money(s.price, currency)}</span>
                  </div>
                ))}
                {coupon && (
                  <div className="flex justify-between py-1 font-medium text-emerald-700">
                    <span>Descuento ({coupon.code})</span>
                    <span>-{money(coupon.discount, currency)}</span>
                  </div>
                )}
                <div className="mt-2 flex justify-between border-t border-slate-100 pt-2 text-lg font-bold">
                  <span>Total</span>
                  <span>{money(coupon ? coupon.total : total, currency)}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">Se paga en el negocio. Duración aproximada: {duration(minutes)}.</p>
              </div>
            </div>
            {hasModule(business.plan, 'descuentos') && (
              <CouponBox slug={business.slug} serviceIds={selected} applied={coupon} onApplied={setCoupon} />
            )}
            <label className="flex items-start gap-3 rounded-xl bg-white p-3 ring-1 ring-slate-200">
              <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-1 h-5 w-5 accent-[rgb(var(--brand-rgb))]" />
              <span className="text-sm text-slate-700">
                Acepto las condiciones del negocio. Puedo cancelar o cambiar mi cita hasta {business.cancel_notice_hours} h antes.
                {business.policies && <span className="mt-1 block whitespace-pre-line text-slate-500">{business.policies}</span>}
              </span>
            </label>
          </div>
        )}

        {error && <div className="mt-4"><Alert>{error}</Alert></div>}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur safe-bottom">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          {step > 0 && <Button variant="secondary" onClick={() => go(step - 1)} disabled={busy}>Atrás</Button>}
          {step < 3 ? (
            <Button block size="lg" onClick={next}>
              {step === 0 && chosen.length > 0 ? `Continuar · ${money(total, currency)}` : 'Continuar'}
            </Button>
          ) : (
            <Button block size="lg" onClick={confirm} loading={busy}>Confirmar reserva</Button>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-semibold">{value}</span>
    </div>
  )
}

function CouponBox({ slug, serviceIds, applied, onApplied }: {
  slug: string
  serviceIds: string[]
  applied: { code: string } | null
  onApplied: (c: { code: string; discount: number; total: number } | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (applied) {
    return (
      <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-200">
        <span>Código <b>{applied.code}</b> aplicado</span>
        <button onClick={() => onApplied(null)} className="font-semibold underline">Quitar</button>
      </div>
    )
  }
  if (!open) {
    return <button onClick={() => setOpen(true)} className="text-sm font-semibold text-brand">¿Tienes un código de descuento?</button>
  }

  const apply = async () => {
    if (!code.trim()) return
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.rpc('check_discount', { p_slug: slug, p_code: code.trim(), p_service_ids: serviceIds })
    setBusy(false)
    if (error) return setError(errorMessage(error))
    const d = data as { code: string; discount: number; total: number }
    onApplied({ code: d.code, discount: Number(d.discount), total: Number(d.total) })
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          className="input uppercase"
          placeholder="CÓDIGO"
          value={code}
          maxLength={20}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && apply()}
          aria-label="Código de descuento"
        />
        <Button variant="secondary" onClick={apply} loading={busy}>Aplicar</Button>
      </div>
      {error && <Alert>{error}</Alert>}
    </div>
  )
}

function WaitlistForm({ slug, date, name: initialName, phone: initialPhone }: { slug: string; date: string; name: string; phone: string }) {
  const [name, setName] = useState(initialName)
  const [phone, setPhone] = useState(initialPhone)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setDone(false), [date])

  if (done) {
    return (
      <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900 ring-1 ring-emerald-200">
        <b>¡Te apuntamos!</b> Si se libera un hueco el {dayTitle(date).toLowerCase()}, el negocio te escribirá por WhatsApp.
      </div>
    )
  }

  const join = async () => {
    if (name.trim().length < 2) return setError('Escribe tu nombre.')
    if (phone.replace(/\D/g, '').length < 8) return setError('Escribe tu teléfono (al menos 8 dígitos).')
    setBusy(true)
    setError(null)
    save('citora:cliente', { name: name.trim(), phone: phone.trim() })
    const { error } = await supabase.rpc('join_waitlist', { p_slug: slug, p_date: date, p_name: name.trim(), p_phone: phone.trim(), p_note: note.trim() || null })
    setBusy(false)
    if (error) return setError(errorMessage(error))
    setDone(true)
  }

  return (
    <div className="card space-y-3">
      <div>
        <h3 className="font-bold">Apúntate a la lista de espera</h3>
        <p className="text-sm text-slate-500">Si alguien cancela, el negocio te avisa por WhatsApp.</p>
      </div>
      <input className="input" placeholder="Tu nombre" autoComplete="name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      <input className="input" placeholder="Tu teléfono (WhatsApp)" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <input className="input" placeholder="Horario que te viene bien (opcional)" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
      {error && <Alert>{error}</Alert>}
      <Button block variant="secondary" onClick={join} loading={busy}>Avisarme si se libera un hueco</Button>
    </div>
  )
}
