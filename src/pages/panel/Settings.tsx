import { Link } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { Alert, BusinessAvatar, Button, Field, Toggle, flash } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { currencyFields, currencyMode, currencyOptions, slugify, type CurrencyMode } from '../../lib/format'
import { imageExt, resizeImage } from '../../lib/image'
import { isPushSubscribed, pushProblemMessage, pushSupported, subscribeOwnerPush, unsubscribePush } from '../../lib/push'
import { isIos, isStandalone } from '../../lib/pwa'
import { supabase } from '../../lib/supabase'
import { BUSINESS_TYPES } from '../../lib/templates'
import { panelUrl, publicUrl } from '../../lib/url'
import { InstallButton } from '../../components/InstallButton'
import { usePanel } from './context'
import { WaBusinessSetting } from './WaBusiness'
import { Icon } from './Panel'
import { t as tx } from '../../lib/i18n'

export default function Settings() {
  const { business, reloadBusiness, slugChanged, link } = usePanel()
  const [form, setForm] = useState({
    name: business.name,
    slug: business.slug,
    business_type: business.business_type,
    whatsapp: business.whatsapp,
    address: business.address || '',
    description: business.description || '',
    currency: currencyMode(business),
    usd_rate: business.usd_rate ? String(business.usd_rate) : '',
  })
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))

  const save = async () => {
    if (form.name.trim().length < 2) return setError(tx('Escribe el nombre del negocio.'))
    const rate = Number(form.usd_rate)
    if (form.currency === 'AMBAS' && !(rate > 0)) return setError(tx('Escribe la tasa del dólar: cuántos CUP vale 1 USD.'))
    setBusy(true)
    setError(null)
    if (form.slug !== business.slug) {
      const { data: ok } = await supabase.rpc('check_slug_available', { p_slug: form.slug })
      if (!ok) {
        setBusy(false)
        return setError(tx('Ese enlace ya está en uso o no es válido.'))
      }
    }
    const { error } = await supabase.from('businesses').update({
      name: form.name.trim(),
      slug: form.slug,
      business_type: form.business_type,
      whatsapp: form.whatsapp.replace(/\D/g, ''),
      address: form.address.trim() || null,
      description: form.description.trim() || null,
      ...currencyFields(form.currency),
      ...(form.currency === 'AMBAS' ? { usd_rate: Math.round(rate * 100) / 100 } : {}),
    }).eq('id', business.id)
    setBusy(false)
    if (error) return setError(errorMessage(error))
    flash(tx('Guardado'))
    if (form.slug !== business.slug) slugChanged(form.slug)
    reloadBusiness()
  }

  const uploadLogo = async (file: File) => {
    setUploading(true)
    setError(null)
    try {
      const blob = await resizeImage(file, 320)
      const path = `${business.id}/logo-${Date.now()}.${imageExt(blob)}`
      const { error: upErr } = await supabase.storage.from('logos').upload(path, blob, { contentType: blob.type })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('logos').getPublicUrl(path)
      const { error } = await supabase.from('businesses').update({ logo_url: data.publicUrl }).eq('id', business.id)
      if (error) throw error
      flash(tx('Logo actualizado'))
      reloadBusiness()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setUploading(false)
    }
  }

  const removeLogo = async () => {
    await supabase.from('businesses').update({ logo_url: null }).eq('id', business.id)
    reloadBusiness()
  }

  return (
    <div className="space-y-5 pb-10">
      <h1 className="text-2xl font-extrabold">{tx('Ajustes')}</h1>

      <PushSection />
      <InstallButton appName={tx('tu panel')} label={tx('Instalar el panel en este móvil')} block />

      <section className="card space-y-4">
        <h2 className="font-bold">{tx('Logo')}</h2>
        <div className="flex items-center gap-4">
          <BusinessAvatar name={form.name} logo={business.logo_url} size={72} />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} loading={uploading}>
              {business.logo_url ? tx('Cambiar logo') : tx('Subir logo')}
            </Button>
            {business.logo_url && <Button variant="ghost" size="sm" onClick={removeLogo}>{tx('Quitar')}</Button>}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) uploadLogo(f)
              e.target.value = ''
            }}
          />
        </div>
        <p className="text-xs text-slate-500">{tx('Se reduce en tu móvil antes de subirse, para gastar pocos datos.')}</p>
      </section>

      <section className="card space-y-4">
        <h2 className="font-bold">{tx('Tu negocio')}</h2>
        <Field label={tx('Nombre')}><input className="input" value={form.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label={tx('Enlace')} hint={<>{tx('Clientes:')}{' '}{publicUrl(form.slug).replace(/^https?:\/\//, '')}<br />{tx('Tu panel:')}{' '}{panelUrl(form.slug).replace(/^https?:\/\//, '')}</>}>
          <input className="input" value={form.slug} maxLength={40} onChange={(e) => set({ slug: slugify(e.target.value) })} />
        </Field>
        {form.slug !== business.slug && (
          <Alert kind="warning">{tx('Si cambias el enlace, el anterior dejará de funcionar. Tendrás que compartir el nuevo.')}</Alert>
        )}
        <Field label={tx('Tipo de negocio')}>
          <select className="input" value={form.business_type} onChange={(e) => set({ business_type: e.target.value })}>
            {BUSINESS_TYPES.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
          </select>
        </Field>
        <Field label="WhatsApp" hint={tx('Con código de país, ej. {v}.', { v: business.market === 'int' ? '1 305 555 1234' : '53 5555 5555' })}>
          <input className="input" type="tel" inputMode="tel" value={form.whatsapp} onChange={(e) => set({ whatsapp: e.target.value })} />
        </Field>
        <Field label={tx('Moneda')} hint={tx('En la que pones los precios de tus servicios y descuentos.')}>
          {business.market === 'int' ? (
            <select className="input" value={form.currency} onChange={(e) => set({ currency: e.target.value as CurrencyMode })}>
              {currencyOptions(true).map((c) => <option key={c.key} value={c.key}>{c.name} · {c.hint}</option>)}
            </select>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {currencyOptions(false).map((c) => (
                <button key={c.key} type="button" onClick={() => set({ currency: c.key })} className={`rounded-xl py-2.5 text-sm font-semibold ${form.currency === c.key ? 'bg-brand text-white' : 'bg-white ring-1 ring-slate-300'}`}>
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </Field>
        {form.currency === 'AMBAS' && (
          <Field label={tx('Tasa del dólar')} hint={tx('Tus precios van en USD y tus clientes ven también su cambio en CUP. Las citas ya hechas mantienen la tasa con la que se reservaron.')}>
            <div className="flex items-center gap-2">
              <span className="shrink-0 font-semibold text-slate-600">{tx('1 USD =')}</span>
              <input className="input" type="number" min={1} step="any" inputMode="decimal" placeholder={tx('Ej. 300')} value={form.usd_rate} onChange={(e) => set({ usd_rate: e.target.value })} />
              <span className="shrink-0 font-semibold text-slate-600">CUP</span>
            </div>
          </Field>
        )}
        {currencyFields(form.currency).currency !== business.currency && (
          <Alert kind="warning">{tx('Los precios no se convierten solos: revisa tus servicios y descuentos después de guardar. Las citas ya hechas se verán en la nueva moneda.')}</Alert>
        )}
        <Field label={tx('Dirección')}><input className="input" value={form.address} maxLength={120} onChange={(e) => set({ address: e.target.value })} /></Field>
        <Field label={tx('Descripción corta')} hint={tx('Aparece debajo del nombre en tu web.')}>
          <input className="input" value={form.description} maxLength={140} onChange={(e) => set({ description: e.target.value })} placeholder={tx('Ej. Uñas con amor en el centro de Matanzas')} />
        </Field>
        <p className="text-sm text-slate-500">
          {tx('El color, los degradados, la portada y la letra están en')}{' '}<Link to={link('apariencia')} className="font-semibold text-brand">{tx('Apariencia')}</Link>{tx('. Las reglas de reserva y lo que leen tus clientas están en')}{' '}<Link to={link('politicas')} className="font-semibold text-brand">{tx('Políticas')}</Link>.
        </p>
      </section>

      {error && <Alert>{error}</Alert>}
      <Button block size="lg" onClick={save} loading={busy}>{tx('Guardar cambios')}</Button>

      <WaBusinessSetting />

      <section className="card">
        <h2 className="font-bold">{tx('Cuenta')}</h2>
        <p className="mt-1 text-sm text-slate-500">{tx('Código de tu negocio:')}{' '}<b>{business.code}</b> {tx('(úsalo al pagar).')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to="/restablecer" className="inline-flex items-center rounded-btn bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-300">{tx('Cambiar mi contraseña')}</Link>
          <Button variant="secondary" onClick={() => supabase.auth.signOut()}>{tx('Cerrar sesión')}</Button>
        </div>
      </section>
    </div>
  )
}

/** Lo más importante de Ajustes, arriba y grande: sin avisos, el dueño no se entera de las reservas */
function PushSection() {
  const { markStep, refreshProgress } = usePanel()
  const [on, setOn] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  // Por qué no se pudieron activar: se queda a la vista con lo que hay que tocar
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    if (pushSupported()) isPushSubscribed().then(setOn)
  }, [])

  // iPhone sin la app instalada: allí los avisos no existen hasta instalarla en la pantalla de inicio
  if (!pushSupported()) {
    if (!isIos() || isStandalone()) return null
    return (
      <section className="card bg-amber-50/70 ring-1 ring-amber-200">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600"><Icon name="bell" className="h-6 w-6" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="font-bold">{tx('Avisos en este móvil')}</h2>
            <p className="text-sm text-slate-600">
              {tx('En iPhone, los avisos solo funcionan con la app instalada. Toca Compartir → «Añadir a pantalla de inicio», abre Citora desde ese icono y actívalos aquí.')}
            </p>
          </div>
        </div>
        <div className="mt-4"><InstallButton appName={tx('tu panel')} label={tx('Cómo instalarla')} block /></div>
      </section>
    )
  }

  const toggle = async (v: boolean) => {
    setBusy(true)
    setProblem(null)
    const res = v ? await subscribeOwnerPush() : await unsubscribePush().then(() => true as const)
    setBusy(false)
    if (res !== true) return setProblem(pushProblemMessage(res))
    setOn(v)
    if (v) markStep('avisos')
    void refreshProgress()
    flash(v ? tx('Avisos activados en este móvil') : tx('Avisos desactivados en este móvil'))
  }

  return (
    <section className={`card ${on === false ? 'bg-amber-50/70 ring-1 ring-amber-200' : ''}`}>
      <div className="flex items-start gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${on ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
          <Icon name="bell" className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold">{tx('Avisos en este móvil')}</h2>
          <p className="text-sm text-slate-600">
            {on
              ? tx('Te avisaremos al momento cuando alguien reserve, cambie o cancele.')
              : tx('Ahora mismo no te enteras cuando un cliente reserva. Actívalos en cada móvil que uses.')}
          </p>
        </div>
        {on !== null && <Toggle checked={on} onChange={toggle} label={tx('Avisos en este móvil')} />}
      </div>
      {on === false && <Button block className="mt-4" onClick={() => toggle(true)} loading={busy}><Icon name="bell" className="h-4 w-4" /> {tx('Activar avisos')}</Button>}
      {busy && on !== false && <p className="mt-2 text-xs text-slate-400">{tx('Guardando…')}</p>}
      {problem && <div className="mt-3"><Alert kind="warning">{problem}</Alert></div>}
    </section>
  )
}
