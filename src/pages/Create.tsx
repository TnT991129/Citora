import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { TimeChips } from '../components/TimeChips'
import { ThemeToggle } from '../components/ThemeToggle'
import { CapacityStepper } from '../components/CapacityStepper'
import { Alert, Button, BusinessAvatar, CitoraLogo, CopyButton, Field, LinkButton, WhatsAppIcon } from '../components/ui'
import { useSession } from '../lib/auth'
import { setBrandColor } from '../lib/brand'
import { ColorPicker } from '../components/ColorPicker'
import { track } from '../lib/analytics'
import { changeCurrency, createBusinessFromDraft, draftSlots, loadDraft, newDraft, saveDraft, type Draft } from '../lib/draft'
import { errorMessage } from '../lib/errors'
import { cleanPhone, currencyFields, CURRENCY_MODES, duration, money, price, slugify, WEEKDAYS_SHORT } from '../lib/format'
import { supabase } from '../lib/supabase'
import { BUSINESS_TYPES, businessType } from '../lib/templates'
import { panelPath, publicUrl, siteUrl } from '../lib/url'
import { shareLink } from '../lib/whatsapp'

const STEPS = ['Tipo', 'Negocio', 'Moneda', 'Servicios', 'Horario', 'Cuenta']

export default function Create() {
  const session = useSession()
  const navigate = useNavigate()
  const [draft, setDraft] = useState<Draft>(() => loadDraft() || newDraft())
  const [step, setStep] = useState(0)
  const [slugState, setSlugState] = useState<'idle' | 'checking' | 'ok' | 'taken'>('idle')
  const [slugTouched, setSlugTouched] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ slug: string } | null>(null)
  // Medición del embudo (ver lib/analytics.ts): quién llega y hasta qué paso del asistente
  useEffect(() => {
    track('visita', { page: 'crear' })
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
    setDraft(newDraft())
  }

  // Comprueba si el enlace está libre
  useEffect(() => {
    if (!draft.slug || draft.slug.length < 3) {
      setSlugState('idle')
      return
    }
    setSlugState('checking')
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('check_slug_available', { p_slug: draft.slug })
      setSlugState(data ? 'ok' : 'taken')
    }, 400)
    return () => clearTimeout(t)
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
      if (cleanPhone(draft.whatsapp).length < 8) return 'Escribe tu número de WhatsApp con el código del país (ej. 53 5555 5555).'
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
    if (step === 4 && session) {
      await finish()
      return
    }
    setStep((s) => s + 1)
    window.scrollTo(0, 0)
  }

  const finish = async () => {
    setBusy(true)
    setError(null)
    try {
      const created = await createBusinessFromDraft(draft)
      setDone({ slug: created.slug })
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
        options: { emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}panel` },
      })
      if (error) throw error
      if (!data.session) {
        // El proyecto pide confirmar el correo: el borrador queda guardado y se crea al entrar
        setNeedsConfirm(true)
        return
      }
      const created = await createBusinessFromDraft(draft)
      setDone({ slug: created.slug })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  if (done) return <Success slug={done.slug} name={draft.name} />

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

  return (
    <Shell>
      <div className="mb-5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-xs font-bold uppercase tracking-[0.16em] text-brand">Paso {step + 1} de {totalSteps}</span>
          <span className="font-semibold text-slate-500">{STEPS[step]}</span>
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
          <p className="mt-1 text-slate-600">Te prepararemos servicios típicos que podrás cambiar.</p>
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
            <p className="mt-1 text-slate-600">Así lo verán tus clientes.</p>
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
          <Field label="WhatsApp del negocio" hint="Con el código del país. Ej: 53 5555 5555. Tus clientes te escribirán aquí.">
            <input className="input" inputMode="tel" value={draft.whatsapp} placeholder="53 5555 5555" onChange={(e) => update({ whatsapp: e.target.value })} />
          </Field>
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
          <p className="mt-1 text-slate-600">Así verán tus clientes los precios. Podrás cambiarlo después en Ajustes.</p>
          <div className="mt-5 space-y-3">
            {CURRENCY_MODES.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => update({ currency: c.key, services: changeCurrency(draft.services, draft.type, mode, c.key) })}
                className={`card flex w-full items-center justify-between gap-3 text-left transition hover:ring-2 hover:ring-brand ${mode === c.key ? 'ring-2 ring-brand' : ''}`}
              >
                <span>
                  <span className="block text-lg font-bold">{c.name}</span>
                  <span className="block text-sm text-slate-500">{c.hint}</span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-slate-600">
                  {c.key === 'CUP' ? price(1500, 'CUP') : price(5, 'USD', c.key === 'AMBAS' ? rate || 300 : null)}
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
            Cambia nombres, precios (en {main}) y duración. Podrás editarlos después.
            {rate > 0 && ` Tus clientes verán también el cambio en CUP (1 USD = ${money(rate, 'CUP')}).`}
            {' '}Los servicios complementarios (extras) los añades después desde tu panel.
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
            <h1 className="text-2xl font-bold">Tu horario</h1>
            <p className="mt-1 text-slate-600">Qué días trabajas y a qué horas pueden empezar las citas.</p>
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
            <p className="mt-1 text-slate-600">Con ella entrarás a tu panel para ver tus citas.</p>
          </div>
          <Field label="Correo electrónico">
            <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tucorreo@ejemplo.com" />
          </Field>
          <Field label="Contraseña" hint="Mínimo 6 caracteres.">
            <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <div className="card bg-slate-50">
            <p className="text-sm text-slate-700">
              <b>{businessType(draft.type).emoji} {draft.name}</b> · {draft.services.filter((s) => s.name.trim()).length} servicios · desde {money(Math.min(...draft.services.filter((s) => s.name.trim()).map((s) => s.price)), main)}
            </p>
            <p className="mt-1 text-sm text-slate-600">Tendrás 3 días gratis con todo incluido. Después, una sola mensualidad de 1.500 CUP.</p>
          </div>
          <p className="text-sm text-slate-500">
            ¿Ya tienes cuenta? <Link to="/entrar" className="font-semibold text-brand">Entra</Link> y tu app se creará con estos datos.
          </p>
        </section>
      )}

      {error && <div className="mt-5"><Alert>{error}</Alert></div>}

      {step > 0 && (
        <div className="sticky bottom-0 -mx-4 mt-6 flex gap-3 border-t border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur safe-bottom">
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

function Success({ slug, name }: { slug: string; name: string }) {
  const url = publicUrl(slug)
  useEffect(() => {
    track('negocio_creado')
  }, [])
  return (
    <Shell>
      <div className="text-center">
        <div className="ui-sheet mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 ring-8 ring-emerald-50">
          <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12l5 5 9-10" /></svg>
        </div>
        <h1 className="mt-5 text-3xl font-extrabold tracking-tight">¡Tu app está lista!</h1>
        {/* Antes decía "3 días gratis" fijo, aunque la prueba dura lo que se configure en el administrador */}
        <p className="mt-2 text-slate-600">Tu prueba gratis con todo incluido ya empezó. Comparte tu enlace para empezar a recibir reservas.</p>
      </div>
      <div className="card mt-6">
        <p className="text-sm font-medium text-slate-500">Tu enlace</p>
        <p className="mt-1 break-all text-lg font-bold text-brand">{url.replace(/^https?:\/\//, '')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <CopyButton text={url} label="Copiar enlace" />
          <LinkButton href={shareLink(`¡Ya puedes reservar tu cita en ${name} desde aquí! ${url}`)} variant="whatsapp" size="sm" newTab>
            <WhatsAppIcon className="h-4 w-4" /> Compartir
          </LinkButton>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <LinkButton href={url} variant="secondary" size="lg" newTab>Ver mi app</LinkButton>
        <Link to={panelPath(slug)} className="inline-flex items-center justify-center rounded-btn bg-brand bg-btn-grad px-5 py-3.5 font-semibold text-white shadow-md shadow-brand/25 transition hover:brightness-110">Ir a mi panel</Link>
      </div>
    </Shell>
  )
}
