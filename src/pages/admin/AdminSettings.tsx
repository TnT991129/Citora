// Pestaña "Ajustes": cobro, precio y prueba, contacto, negocios nuevos, avisos, encuestas y lo
// técnico. En el ordenador, cada grupo con su explicación a la izquierda y sus campos a la derecha.
import { useEffect, useState } from 'react'
import { Alert, Button, Field, PageLoader, Toggle, flash } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { isPushSubscribed, pushSupported, subscribeAdminPush, unsubscribePush } from '../../lib/push'
import { supabase } from '../../lib/supabase'
import { Icon } from '../panel/Panel'
import { ADMIN_TZ } from './adminData'
import { PageTitle, SettingsGroup } from './adminUi'
import { TimezoneSelect } from './OwnerModals'
import Surveys from './Surveys'

interface Settings {
  card_number: string
  card_holder: string
  card_phone: string
  admin_whatsapp: string
  price_basico: number
  price_plus: number
  price_ultra: number
  trial_days: number
  push_function_url: string | null
  push_shared_secret: string | null
  moderate_function_url: string | null
  default_timezone: string
}

/** Campo numérico con su unidad a la derecha ("1500 CUP", "15 días") */
function SuffixInput({ value, suffix, onChange, min, max }: { value: number; suffix: string; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <div className="flex items-center rounded-xl border border-slate-300 bg-white pr-3.5 shadow-sm shadow-slate-900/[0.03] transition focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15">
      <input className="w-full min-w-0 rounded-xl bg-transparent px-3.5 py-2.5 text-base outline-none" type="number" inputMode="numeric" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="shrink-0 text-slate-400">{suffix}</span>
    </div>
  )
}

export default function AdminSettings() {
  const [s, setS] = useState<Settings | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('platform_settings').select('*').eq('id', 1).single().then(({ data, error }) => (error ? setError(errorMessage(error)) : setS(data as Settings)))
  }, [])

  if (error && !s) return <Alert>{error}</Alert>
  if (!s) return <PageLoader />

  const save = async () => {
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('platform_settings').update({ ...s, updated_at: new Date().toISOString() }).eq('id', 1)
    setBusy(false)
    if (error) setError(errorMessage(error))
    else flash('Ajustes guardados')
  }

  const saveButton = (block?: boolean) => (
    <Button onClick={save} loading={busy} block={block} size={block ? 'lg' : 'md'} className="!bg-slate-900 !bg-none !shadow-none">Guardar cambios</Button>
  )

  return (
    <div>
      <PageTitle title="Ajustes" right={<div className="hidden lg:block">{saveButton()}</div>} />
      {error && <div className="mt-4"><Alert>{error}</Alert></div>}

      <div className="mt-6 divide-y divide-slate-200">
        <SettingsGroup title="Dónde te pagan" desc="Lo ven los dueños al pagar su mensualidad.">
          <div className="card space-y-4">
            <Field label="Número de tarjeta">
              <input className="input font-mono tracking-wide" value={s.card_number} onChange={(e) => setS({ ...s, card_number: e.target.value })} placeholder="9200 0000 0000 0000" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Titular (opcional)">
                <input className="input" value={s.card_holder} onChange={(e) => setS({ ...s, card_holder: e.target.value })} />
              </Field>
              <Field label="Teléfono para confirmar (opcional)">
                <input className="input" value={s.card_phone} onChange={(e) => setS({ ...s, card_phone: e.target.value })} placeholder="+53 5xxxxxxx" />
              </Field>
            </div>
            <p className="text-xs text-slate-500">Algunas apps (ej. Transfermóvil en Android) piden un teléfono además de la tarjeta para confirmar que el destino es correcto.</p>
          </div>
        </SettingsGroup>

        <SettingsGroup title="Precio y prueba" desc="Un solo plan con todo incluido. Lo ven los dueños al pagar y en la portada.">
          <div className="card grid gap-4 sm:grid-cols-2">
            <Field label="Precio al mes">
              <SuffixInput value={s.price_basico} suffix="CUP" min={0} onChange={(v) => setS({ ...s, price_basico: v, price_plus: v, price_ultra: v })} />
            </Field>
            <Field label="Prueba gratis" hint="Para los negocios nuevos.">
              <SuffixInput value={s.trial_days} suffix="días" min={0} max={60} onChange={(v) => setS({ ...s, trial_days: v })} />
            </Field>
          </div>
        </SettingsGroup>

        <SettingsGroup title="Contacto" desc="Aquí te mandan las capturas de los pagos y te escriben los dueños.">
          <div className="card">
            <Field label="Tu WhatsApp" hint="Con código de país, solo números.">
              <input className="input" inputMode="tel" value={s.admin_whatsapp} onChange={(e) => setS({ ...s, admin_whatsapp: e.target.value.replace(/[^\d]/g, '') })} placeholder="5355555555" />
            </Field>
          </div>
        </SettingsGroup>

        <SettingsGroup title="Negocios nuevos" desc="La hora con la que empiezan al crear su app. La de cada negocio se cambia en su ficha.">
          <div className="card">
            <Field label="Zona horaria">
              <TimezoneSelect value={s.default_timezone || ADMIN_TZ} onChange={(tz) => setS({ ...s, default_timezone: tz })} />
            </Field>
          </div>
        </SettingsGroup>

        <SettingsGroup title="Avisos en este dispositivo" desc="Te llega una notificación cuando un negocio nuevo se registra.">
          <AdminPushSection />
        </SettingsGroup>

        <SettingsGroup title="Encuestas" desc="Preguntas cortas que ven los dueños en su panel. Se guardan solas, aparte del botón de arriba.">
          <Surveys />
        </SettingsGroup>

        <SettingsGroup title="Técnico" desc="Las funciones de avisos y de revisar fotos. Rara vez hace falta tocarlo.">
          <details className="group card">
            <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-slate-700 [&::-webkit-details-marker]:hidden">
              <Icon name="chevron" className="h-4 w-4 text-slate-400 transition group-open:rotate-90" />
              Avisos push y moderación de fotos
              <span className={`chip ml-auto whitespace-nowrap font-semibold ${s.push_function_url ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                {s.push_function_url ? 'Configurado' : 'Sin configurar'}
              </span>
            </summary>
            <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
              <p className="text-sm text-slate-500">
                Se rellenan después de desplegar <code className="rounded bg-slate-100 px-1">supabase/functions/notify-push</code> y <code className="rounded bg-slate-100 px-1">moderate-photo</code>. Mientras estén vacías, la app funciona igual, sin avisos y con las fotos aprobadas solas.
              </p>
              <Field label="Dirección de la función de avisos" hint="La URL que te da 'supabase functions deploy notify-push'.">
                <input className="input" value={s.push_function_url || ''} onChange={(e) => setS({ ...s, push_function_url: e.target.value.trim() || null })} placeholder="https://xxxx.supabase.co/functions/v1/notify-push" />
              </Field>
              <Field label="Clave secreta" hint="La misma frase que pusiste en PUSH_SHARED_SECRET al desplegar. También la usa la moderación.">
                <input className="input font-mono" value={s.push_shared_secret || ''} onChange={(e) => setS({ ...s, push_shared_secret: e.target.value.trim() || null })} />
              </Field>
              <Field label="Dirección de la moderación de fotos" hint="La URL que te da 'supabase functions deploy moderate-photo'.">
                <input className="input" value={s.moderate_function_url || ''} onChange={(e) => setS({ ...s, moderate_function_url: e.target.value.trim() || null })} placeholder="https://xxxx.supabase.co/functions/v1/moderate-photo" />
              </Field>
            </div>
          </details>
        </SettingsGroup>
      </div>

      <div className="pt-2 lg:hidden">{saveButton(true)}</div>
    </div>
  )
}

function AdminPushSection() {
  const [on, setOn] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (pushSupported()) isPushSubscribed().then(setOn)
  }, [])

  if (!pushSupported()) {
    return <div className="card text-sm text-slate-500">Este navegador no permite avisos. Prueba desde el móvil con la app instalada.</div>
  }

  const toggle = async (v: boolean) => {
    setBusy(true)
    const ok = v ? await subscribeAdminPush() : await unsubscribePush().then(() => true)
    setBusy(false)
    if (!ok) return flash('No se pudo activar. Revisa los permisos de notificaciones del navegador.')
    setOn(v)
    flash(v ? 'Avisos activados en este dispositivo' : 'Avisos desactivados en este dispositivo')
  }

  return (
    <div className="card flex items-center gap-3">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${on ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}><Icon name="bell" className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">Avisos de negocios nuevos</span>
        <span className="block text-sm text-slate-500">{busy ? 'Guardando…' : on ? 'Activados en este dispositivo' : 'Desactivados en este dispositivo'}</span>
      </span>
      {on !== null && <Toggle checked={on} onChange={toggle} label="Avisos de negocios nuevos" />}
    </div>
  )
}
