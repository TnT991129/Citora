import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { TimeChips } from '../components/TimeChips'
import { ThemeToggle } from '../components/ThemeToggle'
import { CapacityStepper } from '../components/CapacityStepper'
import { Alert, Button, BusinessAvatar, CitoraLogo, Field } from '../components/ui'
import { useSession } from '../lib/auth'
import { setBrandColor } from '../lib/brand'
import { ColorPicker } from '../components/ColorPicker'
import { track } from '../lib/analytics'
import { changeCurrency, createBusinessFromDraft, draftSlots, loadDraft, newDraft, saveDraft, type Draft } from '../lib/draft'
import { DEFAULT_TOOLS, saveOnboarding, type SkipKey } from '../lib/onboarding'
import { errorMessage } from '../lib/errors'
import { cleanPhone, currencyFields, currencyOptions, duration, money, price, slugify, WEEKDAYS_SHORT } from '../lib/format'
import { supabase } from '../lib/supabase'
import { BUSINESS_TYPES, businessType } from '../lib/templates'
import { DEFAULT_PRICE, DEFAULT_TEAM_PRICE } from '../lib/plans'
import type { Prices } from '../lib/types'
import { IS_INT, isCubanPhone, marketBase } from '../lib/market'
import { panelPath, publicUrl, siteUrl } from '../lib/url'

const STEPS = ['Tipo', 'Negocio', 'Moneda', 'Servicios', 'Horario', 'Cuenta']
/** Cuánto le falta, según el paso */
const TIME_LEFT = ['Unos 3 minutos', 'Unos 3 minutos', 'Unos 2 minutos', 'Menos de 2 minutos', 'Un minuto', 'Último paso']
/** Los pasos que se pueden saltar (se cambian después en el panel) y el texto del botón */
const SKIP: Partial<Record<number, { key: SkipKey; label: string }>> = {
  2: { key: 'moneda', label: 'Saltar, uso CUP' },
  3: { key: 'servicios', label: 'Saltar, los reviso después' },
  4: { key: 'horario', label: 'Saltar, de lunes a sábado de 9:00 a 18:00' },
}
const SKIP_NAMES: Record<SkipKey, string> = {
  moneda: 'la moneda (CUP)',
  servicios: 'los servicios (de ejemplo)',
  horario: 'el horario (de lunes a sábado, de 9:00 a 18:00)',
}

export default function Create() {
  const session = useSession()
  const navigate = useNavigate()
  // En la versión internacional se empieza en USD (y un borrador hecho en la de Cuba se pasa a USD)
  const [draft, setDraft] = useState<Draft>(() => {
    const d = loadDraft() || newDraft('otro', IS_INT ? 'USD' : 'CUP')
    const cur = d.currency || 'CUP'
    if (IS_INT && (cur === 'CUP' || cur === 'AMBAS')) return { ...d, currency: 'USD', usd_rate: null, services: changeCurrency(d.services, d.type, cur, 'USD') }
    if (!IS_INT && cur !== 'CUP' && cur !== 'USD' && cur !== 'AMBAS') return { ...d, currency: 'CUP', services: changeCurrency(d.services, d.type, cur, 'CUP') }
    return d
  })
  const [step, setStep] = useState(0)
  const [slugState, setSlugState] = useState<'idle' | 'checking' | 'ok' | 'taken'>('idle')
  const [slugTouched, setSlugTouched] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ id: string; slug: string } | null>(null)
  // Medición del embudo (ver lib/analytics.ts): quién llega y hasta qué paso del asistente
  // Días de prueba y precio: los que se configuran en el administrador
  // Hasta que lleguen del servidor no se dice cuántos días (antes decía "3" aunque fueran 15)
  const [prices, setPrices] = useState<Prices>({ basico: DEFAULT_PRICE, plus: DEFAULT_PRICE, ultra: DEFAULT_TEAM_PRICE, trial_days: undefined })
  useEffect(() => {
    track('visita', { page: 'crear' })
    supabase.rpc('get_public_prices').then(({ data }) => data && setPrices(data as Prices))
  }, [])
  useEffect(() => {
    track('crear_paso', { step })
  }, [step])
  const [needsConfirm, setNeedsConfirm] = useState(false)

  useEffect(() => {
    document.title = 'Crear mi app · Citora'
  }, [])

  // Vista previa del color elegido
  useEffect(() => setBrandColor(draft.color), [draft.color])

  // Guarda el borrador en el móvil
  useEffect(() => {
    if (!done) saveDraft(draft)
  }, [draft, done])

  // Si la sesión abierta ya tiene un negocio (o es el administrador), se pregunta qué hacer:
  // cada cuenta tiene un solo negocio, así que para crear otra app hay que usar otro correo
  const [existing, setExisting] = useState<{ name: string; admin: boolean } | null>(null)
  useEffect(() => {
    if (!session || done) {
      setExisting(null)
      return
    }
    ;(async () => {
      const [{ data: biz }, { data: isAdmin }] = await Promise.all([
        supabase.from('businesses').select('name').eq('owner_id', session.user.id).maybeSingle(),
        supabase.rpc('is_platform_admin'),
      ])
      if (biz || isAdmin) setExisting({ name: (biz as { name: string } | null)?.name || '', admin: Boolean(isAdmin) })
    })()
  }, [session, done])

  const signOutForNew = async () => {
    await supabase.auth.signOut()
    setExisting(null)
    setStep(0)
    setDraft(newDraft('otro', IS_INT ? 'USD' : 'CUP'))
  }

  // Comprueba si el enlace está libre
  useEffect(() => {
    if (!draft.slug || draft.slug.length < 3) {
      setSlugState('idle')
      return
    }
    setSlugState('checking')
    // Solo vale la respuesta del último enlace escrito (una anterior puede llegar más tarde)
    let current = true
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc('check_slug_available', { p_slug: draft.slug })
      if (!current) return
      // Si la comprobación falla (sin conexión, sesión caducada...), no se bloquea: al crear la
      // app el servidor vuelve a comprobarlo y avisa si de verdad está ocupado
      if (error) console.warn('No se pudo comprobar el enlace', error)
      setSlugState(error ? 'idle' : data ? 'ok' : 'taken')
    }, 400)
    return () => {
      current = false
      clearTimeout(t)
    }
  }, [draft.slug])

  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))

  const slots = useMemo(() => draftSlots(draft), [draft])
  const mode = draft.currency || 'CUP'
  const main = currencyFields(mode).currency
  const rate = mode === 'AMBAS' ? Number(draft.usd_rate) || 0 : 0

  const stepValid = (): string | null => {
    if (step === 1) {
      if (draft.name.trim().length < 2) return 'Escribe el nombre de tu negocio.'
      if (draft.slug.length < 3) return 'Elige el enlace de tu app (mínimo 3 caracteres).'
      if (slugState === 'taken') return 'Ese enlace ya está en uso. Prueba otro.'
      if (cleanPhone(draft.whatsapp).length < 8) return `Escribe tu número de WhatsApp con el código del país (ej. ${IS_INT ? '1 305 555 1234' : '53 5555 5555'}).`
      // La versión de Cuba es para negocios con WhatsApp de Cuba (ver market.ts)
      if (!IS_INT && !isCubanPhone(draft.whatsapp)) return 'Ese número no es de Cuba. Si tu negocio está fuera de Cuba, créalo en la versión internacional (enlace debajo del WhatsApp).'
    }
    if (step === 2 && mode === 'AMBAS' && !(rate > 0)) return 'Escribe la tasa del dólar: cuántos CUP vale 1 USD.'
    if (step === 3) {
      const valid = draft.services.filter((s) => s.name.trim())
      if (valid.length === 0) return 'Añade al menos un servicio.'
    }
    if (step === 4) {
      if (draft.days.length === 0) return 'Elige al menos un día de trabajo.'
      if (slots.length === 0) return 'Añade al menos un turno.'
    }
    return null
  }

  const next = async () => {
    const msg = stepValid()
    if (msg) {
      setError(msg)
      return
    }
    setError(null)
    // Si antes lo saltó y ahora lo rellena, ya no cuenta como saltado
    const sk = SKIP[step]
    const d = sk && draft.skipped?.includes(sk.key) ? { ...draft, skipped: draft.skipped.filter((k) => k !== sk.key) } : draft
    if (d !== draft) setDraft(d)
    await advance(d)
  }

  const advance = async (d: Draft) => {
    if (step === 4 && session) {
      await finish(d)
      return
    }
    setStep((s) => s + 1)
    window.scrollTo(0, 0)
  }

  /** "Saltar": se queda con lo de siempre para ese paso y se le recuerda en su panel */
  const skip = async () => {
    const sk = SKIP[step]
    if (!sk) return
    setError(null)
    let patch: Partial<Draft>
    if (sk.key === 'moneda') {
      patch = { currency: 'CUP', usd_rate: null, services: changeCurrency(draft.services, draft.type, mode, 'CUP') }
    } else if (sk.key === 'servicios') {
      patch = { services: newDraft(draft.type, mode).services }
    } else {
      const base = newDraft(draft.type, mode)
      patch = { days: base.days, mode: 'intervalo', open: '09:00', close: '18:00', every: base.every, capacity: 1 }
    }
    const d: Draft = { ...draft, ...patch, skipped: Array.from(new Set([...(draft.skipped || []), sk.key])) }
    setDraft(d)
    track('paso_saltado', { step })
    await advance(d)
  }

  const finish = async (d: Draft = draft) => {
    setBusy(true)
    setError(null)
    try {
      const created = await createBusinessFromDraft(d)
      setDone({ id: created.id, slug: created.slug })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const signUpAndCreate = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Escribe un correo válido.')
    if (password.length < 6) return setError('La contraseña debe tener al menos 6 caracteres.')
    setBusy(true)
    setError(null)
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: `${siteUrl()}panel` },
      })
      if (error) throw error
      if (!data.session) {
        // El proyecto pide confirmar el correo: el borrador queda guardado y se crea al entrar
        setNeedsConfirm(true)
        return
      }
      const created = await createBusinessFromDraft(draft)
      setDone({ id: created.id, slug: created.slug })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  if (done) return <Welcome id={done.id} slug={done.slug} draft={draft} trialDays={prices.trial_days ?? null} />

  if (existing && session) {
    return (
      <Shell>
        <div className="card space-y-4 text-center">
          <h1 className="text-2xl font-bold">Ya tienes la sesión abierta</h1>
          <p className="text-slate-600">
            Estás conectado como <b>{session.user.email}</b>
            {existing.name ? <>, que ya tiene la app <b>{existing.name}</b></> : existing.admin ? <> (administrador)</> : null}.
            Cada cuenta tiene una sola app: para crear otra, usa otro correo.
          </p>
          <Button block size="lg" onClick={signOutForNew}>Cerrar sesión y crear otra cuenta</Button>
          <Button block variant="secondary" onClick={() => navigate(existing.admin && !existing.name ? '/admin' : '/panel')}>
            {existing.admin && !existing.name ? 'Ir al panel de administrador' : 'Ir a mi panel'}
          </Button>
        </div>
      </Shell>
    )
  }

  if (needsConfirm) {
    return (
      <Shell>
        <div className="card text-center">
          <h1 className="text-2xl font-bold">Revisa tu correo</h1>
          <p className="mt-2 text-slate-600">
            Te enviamos un enlace a <b>{email}</b> para confirmar tu cuenta. Al confirmarlo, entra y tu app se creará con todo lo que pusiste.
          </p>
          <Link to="/entrar" className="mt-5 inline-block font-semibold text-brand">Ir a entrar</Link>
        </div>
      </Shell>
    )
  }

  const totalSteps = session ? 5 : 6
  const skipLabel = SKIP[step]?.label

  return (
    <Shell>
      <div className="mb-5">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-xs font-bold uppercase tracking-[0.16em] text-brand">Paso {step + 1} de {totalSteps} · {STEPS[step]}</span>
          <span className="shrink-0 text-xs font-semibold text-slate-500">{step === totalSteps - 1 ? 'Último paso' : TIME_LEFT[step]}</span>
        </div>
        {/* Un tramo por paso: se ve cuánto falta de un vistazo */}
        <div className="mt-2.5 flex gap-1.5">
          {Array.from({ length: totalSteps }, (_, i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${i <= step ? 'bg-brand' : 'bg-slate-200'}`} />
          ))}
        </div>
      </div>

      {step === 0 && (
        <section>
          <h1 className="text-2xl font-bold">¿Qué tipo de negocio tienes?</h1>
          <p className="mt-1 text-slate-600">Te preparamos servicios, precios y horario típicos para empezar. Podrás cambiarlo todo.</p>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {BUSINESS_TYPES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  setDraft((d) => ({ ...newDraft(t.key, d.currency), name: d.name, slug: d.slug, whatsapp: d.whatsapp, address: d.address, color: d.color }))
                  setStep(1)
                }}
                className={`card flex flex-col items-center gap-2 py-5 text-center transition hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-lg active:scale-[0.98] ${draft.type === t.key ? 'border-brand bg-brand/5 ring-1 ring-brand' : ''}`}
              >
                <span className="text-3xl">{t.emoji}</span>
                <span className="font-semibold">{t.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="space-y-4">
          <div>
            <h1 className="text-2xl font-bold">Tu negocio</h1>
            <p className="mt-1 text-slate-600">Así te verán tus clientes cuando abran tu enlace.</p>
          </div>
          <Field label="Nombre del negocio">
            <input
              className="input"
              value={draft.name}
              maxLength={60}
              placeholder="Ej. Barbería Leo"
              onChange={(e) => {
                const name = e.target.value
                update(slugTouched ? { name } : { name, slug: slugify(name) })
              }}
            />
          </Field>
          <Field
            label="Enlace de tu app"
            error={slugState === 'taken' ? 'Ese enlace ya está en uso o no es válido.' : null}
            hint={
              slugState === 'ok' ? <span className="font-medium text-emerald-700">✓ Disponible</span>
                : slugState === 'checking' ? 'Comprobando…'
                  : 'Solo letras, números y guiones.'
            }
          >
            <div className="flex items-center overflow-hidden rounded-xl border border-slate-300 bg-white focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
              <span className="shrink-0 bg-slate-50 py-2.5 pl-3 pr-1 text-sm text-slate-500">{siteUrl().replace(/^https?:\/\//, '')}</span>
              <input
                className="w-full min-w-0 py-2.5 pr-3 text-base outline-none"
                value={draft.slug}
                maxLength={40}
                onChange={(e) => {
                  setSlugTouched(true)
                  update({ slug: slugify(e.target.value) })
                }}
              />
            </div>
          </Field>
          <Field label="WhatsApp del negocio" hint={`Con el código del país. Ej: ${IS_INT ? '1 305 555 1234' : '53 5555 5555'}. Tus clientes te escribirán aquí.`}>
            <input className="input" inputMode="tel" value={draft.whatsapp} placeholder={IS_INT ? '1 305 555 1234' : '53 5555 5555'} onChange={(e) => update({ whatsapp: e.target.value })} />
          </Field>
          {!IS_INT && cleanPhone(draft.whatsapp).length >= 8 && !isCubanPhone(draft.whatsapp) && (
            <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
              <p><b>Ese número no es de Cuba.</b> Esta versión de Citora es para negocios en Cuba.</p>
              {/* Recarga: la otra versión arranca con lo suyo. El borrador se guarda en el móvil y sigue allí. */}
              <a href={`${marketBase('int')}crear`} className="mt-1 inline-block font-semibold text-amber-900 underline">
                ¿Tu negocio está fuera de Cuba? Créalo en la versión internacional →
              </a>
            </div>
          )}
          <Field label="Dirección (opcional)">
            <input className="input" value={draft.address} maxLength={120} placeholder="Calle, número, municipio" onChange={(e) => update({ address: e.target.value })} />
          </Field>
          <div>
            <span className="label">Color de tu app</span>
            <ColorPicker value={draft.color} onChange={(c) => update({ color: c })} />
            <p className="mt-2 text-xs text-slate-500">Después podrás añadir degradados, foto de portada y más desde tu panel.</p>
          </div>
          <div className="card flex items-center gap-3">
            <BusinessAvatar name={draft.name || 'Tu negocio'} size={48} />
            <div className="min-w-0">
              <p className="truncate font-bold">{draft.name || 'Tu negocio'}</p>
              <p className="text-sm text-slate-500">Vista previa</p>
            </div>
            <span className="ml-auto rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white">Reservar</span>
          </div>
        </section>
      )}

      {step === 2 && (
        <section>
          <h1 className="text-2xl font-bold">¿En qué moneda cobras?</h1>
          <p className="mt-1 text-slate-600">Es la moneda en la que tus clientes verán tus precios.</p>
          <div className={IS_INT ? 'mt-5 grid gap-3 sm:grid-cols-2' : 'mt-5 space-y-3'}>
            {currencyOptions(IS_INT).map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => update({ currency: c.key, services: changeCurrency(draft.services, draft.type, mode, c.key) })}
                aria-pressed={mode === c.key}
                className={`card flex w-full items-center justify-between gap-3 text-left transition hover:ring-2 hover:ring-brand ${mode === c.key ? 'border-brand bg-brand/5 ring-2 ring-brand' : ''}`}
              >
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${mode === c.key ? 'border-brand bg-brand text-white' : 'border-slate-300'}`} aria-hidden>
                  {mode === c.key && (
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-bold">{c.name}</span>
                  <span className="block text-sm text-slate-500">{c.hint}</span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-slate-600">
                  {IS_INT ? null : c.key === 'CUP' ? price(1500, 'CUP') : price(5, 'USD', c.key === 'AMBAS' ? rate || 300 : null)}
                </span>
              </button>
            ))}
          </div>
          {mode === 'AMBAS' && (
            <div className="card mt-4">
              <Field label="Tasa del dólar de hoy" hint="Pondrás tus precios en USD y tus clientes verán también su cambio en CUP. Podrás actualizar la tasa cuando quieras desde tu panel.">
                <div className="flex items-center gap-2">
                  <span className="shrink-0 font-semibold text-slate-600">1 USD =</span>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    step="any"
                    inputMode="decimal"
                    placeholder="Ej. 300"
                    value={draft.usd_rate ?? ''}
                    onChange={(e) => update({ usd_rate: e.target.value === '' ? null : Number(e.target.value) })}
                  />
                  <span className="shrink-0 font-semibold text-slate-600">CUP</span>
                </div>
              </Field>
            </div>
          )}
        </section>
      )}

      {step === 3 && (
        <section>
          <h1 className="text-2xl font-bold">Tus servicios</h1>
          <p className="mt-1 text-slate-600">
            Te dejamos estos de ejemplo. Cambia lo que no sea igual que en tu negocio (precios en {main}).
            {rate > 0 && ` Tus clientes verán también el cambio en CUP (1 USD = ${money(rate, 'CUP')}).`}
          </p>
          <div className="mt-5 space-y-3">
            {draft.services.map((s, i) => (
              <div key={i} className="card space-y-2">
                <div className="flex gap-2">
                  <input
                    className="input"
                    value={s.name}
                    placeholder="Nombre del servicio"
                    maxLength={80}
                    onChange={(e) => update({ services: draft.services.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })}
                  />
                  <button
                    type="button"
                    onClick={() => update({ services: draft.services.filter((_, j) => j !== i) })}
                    className="shrink-0 rounded-xl px-3 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    aria-label="Quitar servicio"
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs font-medium text-slate-600">Precio ({main})
                    <input
                      className="input mt-1"
                      type="number"
                      min={0}
                      step="any"
                      inputMode="decimal"
                      value={s.price || ''}
                      placeholder="0"
                      onChange={(e) => update({ services: draft.services.map((x, j) => (j === i ? { ...x, price: Number(e.target.value) } : x)) })}
                    />
                    {rate > 0 && s.price > 0 && <span className="mt-1 block text-slate-400">≈ {money(Math.round(s.price * rate), 'CUP')}</span>}
                  </label>
                  <label className="text-xs font-medium text-slate-600">Duración
                    <select
                      className="input mt-1"
                      value={s.duration_min}
                      onChange={(e) => update({ services: draft.services.map((x, j) => (j === i ? { ...x, duration_min: Number(e.target.value) } : x)) })}
                    >
                      {[15, 20, 30, 45, 60, 75, 90, 120, 150, 180, 240].map((m) => <option key={m} value={m}>{duration(m)}</option>)}
                    </select>
                  </label>
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              block
              onClick={() => update({ services: [...draft.services, { name: '', price: 0, duration_min: 60 }] })}
            >
              + Añadir servicio
            </Button>
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="space-y-5">
          <div>
            <h1 className="text-2xl font-bold">¿Cuándo trabajas?</h1>
            <p className="mt-1 text-slate-600">Tus clientes solo podrán reservar en estos días y horas.</p>
          </div>
          <div>
            <span className="label">Días de trabajo</span>
            <div className="grid grid-cols-7 gap-1.5">
              {[1, 2, 3, 4, 5, 6, 0].map((w) => {
                const on = draft.days.includes(w)
                return (
                  <button
                    key={w}
                    type="button"
                    onClick={() => update({ days: on ? draft.days.filter((d) => d !== w) : [...draft.days, w] })}
                    className={`rounded-xl py-2.5 text-sm font-semibold ${on ? 'bg-brand text-white' : 'bg-white text-slate-500 ring-1 ring-slate-200'}`}
                  >
                    {WEEKDAYS_SHORT[w]}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <span className="label">¿Cómo das las citas?</span>
            <div className="grid grid-cols-2 gap-2">
              {([
                ['turnos', 'Turnos fijos', 'Ej. 10:00 y 13:00'],
                ['intervalo', 'Cada cierto tiempo', 'Ej. cada 30 min'],
              ] as const).map(([k, t, d]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => update({ mode: k })}
                  className={`card text-left ${draft.mode === k ? 'ring-2 ring-brand' : ''}`}
                >
                  <p className="font-semibold">{t}</p>
                  <p className="text-sm text-slate-500">{d}</p>
                </button>
              ))}
            </div>
          </div>
          {draft.mode === 'turnos' ? (
            <div className="card">
              <span className="label">Horas de los turnos</span>
              <TimeChips value={draft.turnos} onChange={(turnos) => update({ turnos })} />
            </div>
          ) : (
            <div className="card">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <label className="text-xs font-medium text-slate-600">Abres
                  <input type="time" className="input mt-1" value={draft.open} onChange={(e) => update({ open: e.target.value })} />
                </label>
                <label className="text-xs font-medium text-slate-600">Cierras
                  <input type="time" className="input mt-1" value={draft.close} onChange={(e) => update({ close: e.target.value })} />
                </label>
                <label className="col-span-2 text-xs font-medium text-slate-600 sm:col-span-1">Una cita cada
                  <select className="input mt-1" value={draft.every} onChange={(e) => update({ every: Number(e.target.value) })}>
                    {[15, 20, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m} min</option>)}
                  </select>
                </label>
              </div>
              <p className="mt-3 text-sm text-slate-600">
                Turnos: <span className="font-medium">{slots.length ? slots.join(' · ') : 'ninguno'}</span>
              </p>
            </div>
          )}
          <div className="card space-y-3">
            <div>
              <span className="label">Clientes por turno</span>
              <p className="text-sm text-slate-500">¿Cuántos clientes puedes atender a la misma hora? Por ejemplo, si trabajan 2 manicuras a la vez, pon 2.</p>
            </div>
            <CapacityStepper value={draft.capacity || 1} onChange={(n) => update({ capacity: n })} />
          </div>
          <p className="text-sm text-slate-500">
            Si un servicio dura más que un turno, el sistema bloquea solo los turnos que se solapan. Podrás poner horarios distintos por día y días cerrados desde tu panel.
          </p>
        </section>
      )}

      {step === 5 && !session && (
        <section className="space-y-4">
          <div>
            <h1 className="text-2xl font-bold">Crea tu cuenta</h1>
            <p className="mt-1 text-slate-600">Con este correo y contraseña entrarás a tu panel.</p>
          </div>
          <Field label="Correo electrónico">
            <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tucorreo@ejemplo.com" />
          </Field>
          <Field label="Contraseña" hint="Mínimo 6 caracteres.">
            <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {(draft.skipped || []).length > 0 && (
            <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
              <b>Dejaste para después:</b> {(draft.skipped || []).map((k) => SKIP_NAMES[k]).join(', ')}. Te lo recordaremos en tu panel.
            </div>
          )}
          <div className="card bg-slate-50">
            <p className="text-sm text-slate-700">
              <b>{businessType(draft.type).emoji} {draft.name}</b> · {draft.services.filter((s) => s.name.trim()).length} servicios · desde {money(Math.min(...draft.services.filter((s) => s.name.trim()).map((s) => s.price)), main)}
            </p>
            <p className="mt-1 text-sm text-slate-600">{prices.trial_days ? `Tendrás ${prices.trial_days} días gratis con todo incluido.` : 'Empiezas con una prueba gratis con todo incluido.'} Después eliges: Solo ({IS_INT ? money(prices.int_basico ?? 10, 'USD') : money(prices.basico, 'CUP')}/mes) o Equipo, si trabajas con más personas ({IS_INT ? money(prices.int_ultra ?? 20, 'USD') : money(prices.ultra, 'CUP')}/mes).</p>
          </div>
          <p className="text-sm text-slate-500">
            ¿Ya tienes cuenta? <Link to="/entrar" className="font-semibold text-brand">Entra</Link> y tu app se creará con estos datos.
          </p>
        </section>
      )}

      {error && <div className="mt-5"><Alert>{error}</Alert></div>}

      {step > 0 && (
        <div className="sticky bottom-0 -mx-4 mt-6 border-t border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur safe-bottom">
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => { setError(null); setStep((s) => s - 1) }} disabled={busy}>
              Atrás
            </Button>
            {step < 5 ? (
              <Button block onClick={next} loading={busy} disabled={step === 1 && slugState === 'checking'}>
                {step === 4 && session ? 'Crear mi app' : 'Siguiente'}
              </Button>
            ) : (
              <Button block onClick={signUpAndCreate} loading={busy}>Crear mi app</Button>
            )}
          </div>
          {skipLabel && (
            <button
              type="button"
              onClick={skip}
              disabled={busy}
              className="mt-2 w-full rounded-xl py-2.5 text-[15px] font-semibold text-slate-500 transition hover:bg-slate-100 disabled:opacity-50"
            >
              {skipLabel}
            </button>
          )}
        </div>
      )}
    </Shell>
  )
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-dvh">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-brand/10 to-transparent" />
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur-lg">
        <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-3">
          <Link to="/"><CitoraLogo className="text-lg" /></Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link to="/entrar" className="text-sm font-semibold text-slate-600">Entrar</Link>
          </div>
        </div>
      </header>
      <main className="ui-page relative mx-auto max-w-xl px-4 py-6">{children}</main>
    </div>
  )
}

/**
 * Bienvenida al terminar: su negocio ya existe. Le ofrece el tutorial (no se abre solo), ver su
 * página como un cliente o ir directo al panel.
 */
function Welcome({ id, slug, draft, trialDays }: { id: string; slug: string; draft: Draft; trialDays: number | null }) {
  const navigate = useNavigate()
  const url = publicUrl(slug)
  const mode = draft.currency || 'CUP'
  const main = currencyFields(mode).currency
  const services = draft.services.filter((s) => s.name.trim()).slice(0, 3)
  const later = (draft.skipped || []).filter((k) => k !== 'moneda')
  useEffect(() => {
    track('negocio_creado')
  }, [])

  const seePage = () => {
    window.open(url, '_blank', 'noopener')
    void saveOnboarding(id, { tools: [...DEFAULT_TOOLS], skipped: draft.skipped || [], steps: { ver: new Date().toISOString() } })
  }

  return (
    <div className="min-h-dvh bg-white">
      <div className="relative overflow-hidden bg-brand bg-btn-grad px-6 pb-24 pt-12 text-center text-white">
        <span aria-hidden className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
        <span aria-hidden className="pointer-events-none absolute -right-12 top-16 h-32 w-32 rounded-full bg-white/10" />
        <p className="ui-sheet text-5xl" aria-hidden>🎉</p>
        <p className="mt-4 text-sm font-semibold uppercase tracking-[0.16em] text-white/75">Tu app ya está lista</p>
        <h1 className="mx-auto mt-1 max-w-md text-[28px] font-extrabold leading-tight tracking-tight">Te damos la bienvenida a {draft.name}</h1>
        <p className="mt-2 text-white/85">{trialDays ? `Tus ${trialDays} días gratis con todo incluido ya empezaron.` : 'Tu prueba gratis con todo incluido ya empezó.'}</p>
      </div>

      <div className="mx-auto -mt-16 max-w-md px-5">
        <div className="ui-sheet overflow-hidden rounded-2xl bg-white shadow-xl shadow-slate-900/10 ring-1 ring-slate-200">
          <div className="flex items-center gap-1.5 truncate border-b border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-400">
            <span className="h-2 w-2 shrink-0 rounded-full bg-slate-300" />
            {url.replace(/^https?:\/\//, '')}
          </div>
          <div className="bg-brand bg-btn-grad px-4 py-4 text-white">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/20 text-lg">{businessType(draft.type).emoji}</span>
              <div className="min-w-0">
                <p className="truncate font-extrabold leading-tight">{draft.name}</p>
                <p className="truncate text-xs text-white/80">{businessType(draft.type).name}</p>
              </div>
            </div>
          </div>
          <div className="divide-y divide-slate-100 px-4">
            {services.map((s, i) => (
              <div key={i} className="flex justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0 font-semibold">
                  <span className="block truncate">{s.name}</span>
                  <span className="block text-xs font-normal text-slate-400">{duration(s.duration_min)}</span>
                </span>
                <span className="shrink-0 font-bold">{money(s.price, main)}</span>
              </div>
            ))}
          </div>
          <div className="px-4 pb-4 pt-1">
            <div className="rounded-btn bg-brand bg-btn-grad py-2.5 text-center text-sm font-bold text-white">Reservar cita</div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-md space-y-2.5 px-5 pb-10 pt-6">
        {later.length > 0 && (
          <p className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
            Dejaste <b>{later.map((k) => (k === 'servicios' ? 'los servicios' : 'el horario')).join(' y ')}</b> para después. Revísalo antes de compartir tu enlace: te lo recordamos en tu panel.
          </p>
        )}
        <Button block size="lg" onClick={() => navigate(`${panelPath(slug)}?tutorial=1`)}>
          <Icon name="sparkles" /> Hacer el tutorial · 2 minutos
        </Button>
        <Button block size="lg" variant="secondary" onClick={seePage}>
          <Icon name="eye" /> Ver mi página como un cliente
        </Button>
        <Link to={panelPath(slug)} className="block w-full rounded-xl py-3 text-center text-[15px] font-semibold text-slate-500 transition hover:bg-slate-50">
          Ahora no, ir a mi panel
        </Link>
      </div>
    </div>
  )
}

function Icon({ name }: { name: 'sparkles' | 'eye' }) {
  const d = name === 'sparkles'
    ? 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z'
    : 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z'
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  )
}
