// "Más" en modo sencillo: solo las herramientas activas; el resto se activa con un toque (no se quita
// nada, solo se esconde). Debajo, la cuenta (Mensualidad, Ajustes y avisos) y la ayuda.
import { useEffect, useState } from 'react'
import { InstallButton } from '../../components/InstallButton'
import { Button, flash } from '../../components/ui'
import { daysLeft } from '../../lib/format'
import { activeTools, TOOLS } from '../../lib/onboarding'
import { isPushSubscribed, pushSupported } from '../../lib/push'
import { supabase } from '../../lib/supabase'
import { publicUrl } from '../../lib/url'
import { APP_VERSION } from '../../lib/version'
import { waLink } from '../../lib/whatsapp'
import { usePanel } from './context'
import { Icon } from './Panel'
import { Chip, Row, RowList, SectionTitle } from './rows'

/** true / false si este móvil tiene los avisos; null mientras se mira (o si no se puede saber) */
export function usePushOnThisDevice(): boolean | null {
  const [on, setOn] = useState<boolean | null>(null)
  useEffect(() => {
    if (!pushSupported()) return
    let alive = true
    // Sin service worker, ready no termina nunca: a los 3 segundos se deja de esperar
    const timer = window.setTimeout(() => alive && setOn(null), 3000)
    isPushSubscribed().then((v) => {
      window.clearTimeout(timer)
      if (alive) setOn(v)
    }, () => {})
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [])
  return on
}

export default function More() {
  const { business, status, link, onboarding, updateOnboarding, showTour, showNews, tutorial } = usePanel()
  const tools = activeTools(onboarding)
  const on = TOOLS.filter((t) => tools.includes(t.id))
  const off = TOOLS.filter((t) => !tools.includes(t.id))
  const push = usePushOnThisDevice()
  const [support, setSupport] = useState<string | null>(null)

  useEffect(() => {
    supabase.rpc('get_payment_info').then(({ data }) => setSupport((data as { admin_whatsapp?: string } | null)?.admin_whatsapp || null))
  }, [])

  const activate = (id: string, label: string) => {
    updateOnboarding({ tools: [...tools, id] })
    flash(`${label} activado. Ya está en tus herramientas.`)
  }

  const planSub = business.comped
    ? 'Cortesía · sin mensualidad'
    : status.status === 'prueba'
    ? `Prueba gratis · ${daysLeft(status.trial_ends_at) <= 0 ? 'último día' : `quedan ${daysLeft(status.trial_ends_at)} días`}`
    : status.paid_until ? `Pagado hasta dentro de ${Math.max(daysLeft(status.paid_until), 0)} días` : 'Hasta cuándo está pagado y cómo pagar'

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold tracking-tight">Más</h1>

      {on.length > 0 && (
        <div>
          <SectionTitle>Tus herramientas</SectionTitle>
          <RowList>
            {on.map((t) => <Row key={t.id} icon={t.icon} title={t.label} sub={t.desc} to={link(t.id)} />)}
          </RowList>
        </div>
      )}

      {off.length > 0 && (
        <div>
          <SectionTitle right={<span className="text-xs text-slate-400">Actívalas cuando las necesites</span>}>Más herramientas</SectionTitle>
          <RowList>
            {off.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><Icon name={t.icon} className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{t.label}</span>
                  <span className="block text-sm text-slate-500">{t.desc}</span>
                </span>
                <Button size="sm" variant="secondary" onClick={() => activate(t.id, t.label)}>Activar</Button>
              </div>
            ))}
          </RowList>
        </div>
      )}

      <div>
        <SectionTitle>Tu cuenta</SectionTitle>
        <RowList>
          <Row icon="card" title="Mensualidad" sub={planSub} to={link('plan')} />
          <Row
            icon="gear"
            title="Ajustes y avisos"
            sub={push === true ? 'Avisos activados en este móvil' : push === false ? 'Avisos sin activar en este móvil' : 'Avisos, datos del negocio y tu cuenta'}
            to={link('ajustes')}
            tour="avisos"
            right={push === false ? <Chip>Actívalos</Chip> : undefined}
          />
        </RowList>
      </div>

      <div>
        <SectionTitle>Ayuda</SectionTitle>
        <RowList>
          <Row icon="sparkles" title="Tutorial paso a paso" sub="Te enseñamos a usar tu panel en 2 minutos" onClick={tutorial.active ? undefined : showTour} />
          {support && (
            <Row
              icon="whatsapp"
              title="Hablar con una persona"
              sub="Te ayudamos por WhatsApp"
              tint="bg-[#25D366]/15 text-[#128C7E]"
              href={waLink(support, `Hola, soy de ${business.name} (código ${business.code}) y necesito ayuda con Citora.`)}
            />
          )}
          <Row icon="globe" title="Ver mi página de reservas" sub="Así la ven tus clientes" href={publicUrl(business.slug)} />
        </RowList>
      </div>

      <InstallButton appName="tu panel" label="Instalar el panel en este móvil" block />
      <button onClick={showNews} className="mx-auto flex items-center gap-1.5 text-sm font-semibold text-brand">
        <Icon name="sparkles" className="h-4 w-4" /> Novedades de la versión {APP_VERSION}
      </button>
      <p className="-mt-3 text-center text-xs text-slate-400">Citora v{APP_VERSION}</p>
    </div>
  )
}
