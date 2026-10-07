import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { TimeChips } from '../components/TimeChips'
import { Alert, Button, BusinessAvatar, CitoraLogo, CopyButton, Field, LinkButton, WhatsAppIcon } from '../components/ui'
import { useSession } from '../lib/auth'
import { COLOR_PRESETS, setBrandColor } from '../lib/brand'
import { createBusinessFromDraft, draftSlots, loadDraft, newDraft, saveDraft, type Draft } from '../lib/draft'
import { errorMessage } from '../lib/errors'
import { cleanPhone, duration, money, slugify, WEEKDAYS_SHORT } from '../lib/format'
import { supabase } from '../lib/supabase'
import { BUSINESS_TYPES, businessType } from '../lib/templates'
import { publicUrl } from '../lib/url'
import { shareLink } from '../lib/whatsapp'

const STEPS = ['Tipo', 'Negocio', 'Servicios', 'Horario', 'Cuenta']

export default function Create() {
  const session = useSession()
  const [draft, setDraft] = useState<Draft>(() => loadDraft() || newDraft())
  const [step, setStep] = useState(0)
  const [slugState, setSlugState] = useState<'idle' | 'checking' | 'ok' | 'taken'>('idle')
  const [slugTouched, setSlugTouched] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ slug: string } | null>(null)
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

  // Con sesión iniciada y negocios ya creados, este será uno más de la misma cuenta
  const [owned, setOwned] = useState(0)
  useEffect(() => {
    if (!session) return
    supabase.from('businesses').select('id', { count: 'exact', head: true }).then(({ count }) => setOwned(count || 0))
  }, [session])

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

  const stepValid = (): string | null => {
    if (step === 1) {
      if (draft.name.trim().length < 2) return 'Escribe el nombre de tu negocio.'
      if (draft.slug.length < 3) return 'Elige el enlace de tu app (mínimo 3 caracteres).'
      if (slugState === 'taken') return 'Ese enlace ya está en uso. Prueba otro.'
      if (cleanPhone(draft.whatsapp).length < 8) return 'Escribe tu número de WhatsApp con el código del país (ej. 53 5555 5555).'
    }
    if (step === 2) {
      const valid = draft.services.filter((s) => s.name.trim())
      if (valid.length === 0) return 'Añade al menos un servicio.'
    }
    if (step === 3) {
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
    if (step === 3 && session) {
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

  const totalSteps = session ? 4 : 5

  return (
    <Shell>
      <div className="mb-5">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-slate-700">Paso {step + 1} de {totalSteps}</span>
          <span className="text-slate-500">{STEPS[step]}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${((step + 1) / totalSteps) * 100}%` }} />
        </div>
      </div>

      {session && owned > 0 && step === 0 && (
        <div className="mb-5">
          <Alert kind={owned >= 5 ? 'warning' : 'info'}>
            {owned >= 5
              ? 'Ya tienes 5 negocios, el máximo por cuenta.'
              : `Vas a crear otro negocio con tu cuenta (ya tienes ${owned}). Tendrá su propia web, su propio panel y su propia prueba gratis.`}{' '}
            <Link to="/panel" className="font-semibold underline">Volver a mi panel</Link>
          </Alert>
        </div>
      )}

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
                  const fresh = newDraft(t.key)
                  setDraft((d) => ({ ...fresh, name: d.name, slug: d.slug, whatsapp: d.whatsapp, address: d.address, color: d.color }))
                  setStep(1)
                }}
                className={`card flex flex-col items-center gap-2 py-5 text-center transition hover:ring-2 hover:ring-brand ${draft.type === t.key ? 'ring-2 ring-brand' : ''}`}
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
              <span className="shrink-0 bg-slate-50 py-2.5 pl-3 pr-1 text-sm text-slate-500">{publicUrl('').replace(/^https?:\/\//, '')}</span>
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
            <div className="flex flex-wrap gap-2">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => update({ color: c })}
                  className={`h-10 w-10 rounded-full transition ${draft.color === c ? 'ring-4 ring-offset-2' : ''}`}
                  style={{ background: c, ['--tw-ring-color' as string]: c }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
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
          <h1 className="text-2xl font-bold">Tus servicios</h1>
          <p className="mt-1 text-slate-600">Cambia nombres, precios (en CUP) y duración. Podrás editarlos después.</p>
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
                  <label className="text-xs font-medium text-slate-600">Precio (CUP)
                    <input
                      className="input mt-1"
                      type="number"
                      min={0}
                      inputMode="decimal"
                      value={s.price}
                      onChange={(e) => update({ services: draft.services.map((x, j) => (j === i ? { ...x, price: Number(e.target.value) } : x)) })}
                    />
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

      {step === 3 && (
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
          <p className="text-sm text-slate-500">
            Si un servicio dura más que un turno, el sistema bloquea solo los turnos que se solapan. Podrás poner horarios distintos por día y días cerrados desde tu panel.
          </p>
        </section>
      )}

      {step === 4 && !session && (
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
              <b>{businessType(draft.type).emoji} {draft.name}</b> · {draft.services.filter((s) => s.name.trim()).length} servicios · desde {money(Math.min(...draft.services.filter((s) => s.name.trim()).map((s) => s.price)))}
            </p>
            <p className="mt-1 text-sm text-slate-600">Tendrás 3 días gratis con todo incluido. Después eliges tu plan.</p>
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
          {step < 4 ? (
            <Button block onClick={next} loading={busy} disabled={step === 1 && slugState === 'checking'}>
              {step === 3 && session ? 'Crear mi app' : 'Siguiente'}
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
    <div className="min-h-dvh">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-3">
          <Link to="/"><CitoraLogo className="text-lg" /></Link>
          <Link to="/entrar" className="text-sm font-semibold text-slate-600">Entrar</Link>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 py-6">{children}</main>
    </div>
  )
}

function Success({ slug, name }: { slug: string; name: string }) {
  const url = publicUrl(slug)
  return (
    <Shell>
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">🎉</div>
        <h1 className="mt-4 text-2xl font-bold">¡Tu app está lista!</h1>
        <p className="mt-2 text-slate-600">Tienes 3 días gratis con todo incluido. Comparte tu enlace para empezar a recibir reservas.</p>
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
        <Link to="/panel" className="inline-flex items-center justify-center rounded-xl bg-brand px-5 py-3.5 font-semibold text-white">Ir a mi panel</Link>
      </div>
    </Shell>
  )
}
