import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Calendar, SlotPicker } from '../../components/Calendar'
import { Alert, Button, Field, PageLoader } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { cupRate, duration, money, price, weekdayOf, zonedToIso, dayTitle } from '../../lib/format'
import { hasModule } from '../../lib/plans'
import { load, rememberBooking, save } from '../../lib/storage'
import { supabase } from '../../lib/supabase'
import { clientPath } from '../../lib/url'
import NotFound from '../NotFound'
import { hasMainService, ServicePicker } from './ServicePicker'
import { Closed, PublicHeader, usePublicBusiness } from './shared'

type StepKey = 'servicio' | 'equipo' | 'fecha' | 'datos' | 'confirmar'
const STEP_TITLES: Record<StepKey, string> = {
  servicio: 'Elige el servicio',
  equipo: '¿Con quién quieres tu cita?',
  fecha: 'Elige día y hora',
  datos: 'Tus datos',
  confirmar: 'Confirma tu cita',
}

export default function BookingFlow() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { business } = usePublicBusiness(slug)
  const saved = load<{ name: string; phone: string }>('citora:cliente', { name: '', phone: '' })

  const [step, setStep] = useState(0)
  // ?s=<id>: viene de tocar un servicio en la web del negocio
  const [params] = useSearchParams()
  const [selected, setSelected] = useState<string[]>(() => (params.get('s') ? [params.get('s')!] : []))
  const [date, setDate] = useState<string | null>(null)
  const [time, setTime] = useState<string | null>(null)
  const [name, setName] = useState(saved.name)
  const [phone, setPhone] = useState(saved.phone)
  const [note, setNote] = useState('')
  const [accepted, setAccepted] = useState(false)
  // ?p=<id>: viene de tocar a una persona del equipo en la web del negocio
  const [staffId, setStaffId] = useState<string | null>(() => params.get('p'))
  const [coupon, setCoupon] = useState<Coupon | null>(null)
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
  const rate = cupRate(business)
  const team = hasModule(business.plan, 'empleados') ? business.staff || [] : []
  const openDays = new Set((business.schedule || []).filter((d) => d.is_open).map((d) => d.weekday))
  const closed = new Set(business.closed_days || [])
  const isOpen = (key: string) => openDays.has(weekdayOf(key)) && !closed.has(key)
  // Con equipo, el cliente elige con quién antes del día y la hora
  const steps: StepKey[] = team.length > 0 ? ['servicio', 'equipo', 'fecha', 'datos', 'confirmar'] : ['servicio', 'fecha', 'datos', 'confirmar']
  const cur = steps[Math.min(step, steps.length - 1)]
  const last = steps.length - 1
  const person = team.find((s) => s.id === staffId) || null

  const go = (n: number) => {
    setError(null)
    setStep(n)
    window.scrollTo(0, 0)
  }

  const pickStaff = (id: string | null) => {
    if (id !== staffId) setTime(null)
    setStaffId(id)
    go(steps.indexOf('fecha'))
  }

  const next = () => {
    if (cur === 'servicio' && !hasMainService(services, selected)) {
      return setError(chosen.length ? 'Elige también un servicio principal: los complementos se añaden a un servicio.' : 'Elige al menos un servicio.')
    }
    if (cur === 'fecha' && (!date || !time)) return setError('Elige el día y la hora.')
    if (cur === 'datos') {
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
      p_service_ids: chosen.map((s) => s.id),
      p_date: date,
      p_time: time,
      p_name: name.trim(),
      p_phone: phone.trim(),
      p_note: note.trim() || null,
      p_code: coupon?.code || null,
      p_staff: person?.id ?? null,
    })
    setBusy(false)
    if (error) {
      const msg = errorMessage(error)
      setError(msg)
      if (/turno|horario/i.test(msg)) {
        setTime(null)
        setStep(steps.indexOf('fecha'))
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
          {steps.map((k, i) => (
            <div key={k} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-brand' : 'bg-slate-200'}`} />
          ))}
        </div>
        <h1 className="text-2xl font-bold">{STEP_TITLES[cur]}</h1>

        {cur === 'servicio' && (
          <div className="mt-4">
            <ServicePicker services={services} selected={selected} onChange={setSelected} currency={currency} rate={rate} />
          </div>
        )}

        {cur === 'equipo' && (
          <div className="mt-4 space-y-2.5">
            <p className="text-sm text-slate-500">Elige a la persona que prefieras o deja que te atienda quien esté libre.</p>
            <StaffCard
              name="Cualquiera disponible"
              hint="Te atiende quien esté libre a la hora que elijas. Así verás más horas."
              icon="any"
              selected={staffId === null}
              onClick={() => pickStaff(null)}
            />
            {team.map((s) => (
              <StaffCard key={s.id} name={s.name} hint="Ver sus horas libres" selected={staffId === s.id} onClick={() => pickStaff(s.id)} />
            ))}
          </div>
        )}

        {cur === 'fecha' && (
          <div className="mt-4 space-y-5">
            {team.length > 0 && (
              <div className="flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-slate-200">
                <Initial name={person?.name || '?'} any={!person} />
                <p className="min-w-0 flex-1 text-sm">
                  <span className="block text-slate-500">Tu cita con</span>
                  <span className="block truncate font-bold">{person?.name || 'Cualquiera disponible'}</span>
                </p>
                <button onClick={() => go(steps.indexOf('equipo'))} className="text-sm font-semibold text-brand">Cambiar</button>
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
                  staff={person?.id ?? null}
                  whenFull={hasModule(business.plan, 'espera') ? <WaitlistForm slug={business.slug} date={date} name={name} phone={phone} /> : null}
                />
              </div>
            )}
          </div>
        )}

        {cur === 'datos' && (
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

        {cur === 'confirmar' && (
          <div className="mt-4 space-y-4">
            <div className="card space-y-3">
              <Row label="Día" value={<span>{dayTitle(date!)}</span>} />
              <Row label="Hora" value={time!} />
              {team.length > 0 && <Row label="Con" value={person?.name || 'Cualquiera disponible'} />}
              <Row label="Nombre" value={name} />
              <Row label="Teléfono" value={phone} />
              <div className="border-t border-slate-100 pt-3">
                {chosen.map((s) => (
                  <div key={s.id} className="flex justify-between py-1 text-slate-700">
                    <span>{s.is_extra ? '+ ' : ''}{s.name}</span>
                    <span>{price(s.price, currency, rate)}</span>
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
                  <span className="text-right">{price(coupon ? coupon.total : total, currency, rate)}</span>
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
                Acepto las condiciones del negocio. Puedo cancelar mi cita hasta {business.cancel_notice_hours} h antes, o cambiarla hasta {business.reschedule_notice_hours} h antes.
                {business.policies && (
                  <span className="mt-2 block max-h-48 overflow-y-auto whitespace-pre-line rounded-lg bg-slate-50 px-3 py-2 text-slate-500">{business.policies}</span>
                )}
              </span>
            </label>
          </div>
        )}

        {error && <div className="mt-4"><Alert>{error}</Alert></div>}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur safe-bottom">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          {step > 0 && <Button variant="secondary" onClick={() => go(step - 1)} disabled={busy}>Atrás</Button>}
          {step < last ? (
            <Button block size="lg" onClick={next}>
              {cur === 'servicio' && chosen.length > 0 ? `Continuar · ${price(total, currency, rate)}` : 'Continuar'}
            </Button>
          ) : (
            <Button block size="lg" onClick={confirm} loading={busy}>Confirmar reserva</Button>
          )}
        </div>
      </div>
    </div>
  )
}

/** Inicial de la persona en un círculo (o un icono de grupo para "cualquiera") */
function Initial({ name, any }: { name: string; any?: boolean }) {
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand/10 text-lg font-extrabold text-brand">
      {any ? (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8" />
        </svg>
      ) : (
        name.trim().charAt(0).toUpperCase() || '·'
      )}
    </span>
  )
}

function StaffCard({ name, hint, icon, selected, onClick }: { name: string; hint: string; icon?: 'any'; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`card flex w-full items-center gap-3 text-left transition hover:ring-2 hover:ring-brand ${selected ? 'ring-2 ring-brand' : ''}`}>
      <Initial name={name} any={icon === 'any'} />
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{name}</span>
        <span className="block text-sm text-slate-500">{hint}</span>
      </span>
      <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
    </button>
  )
}

type Coupon ={ code: string; percent: number | null; discount: number; total: number }

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
  onApplied: (c: Coupon | null) => void
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
    const d = data as { code: string; percent: number | null; discount: number; total: number }
    onApplied({ code: d.code, percent: d.percent, discount: Number(d.discount), total: Number(d.total) })
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
