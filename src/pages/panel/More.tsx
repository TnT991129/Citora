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
import { t as tx } from '../../lib/i18n'
import { IS_INT } from '../../lib/market'

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
  const [community, setCommunity] = useState<string | null>(null)

  useEffect(() => {
    supabase.rpc('get_payment_info').then(({ data }) => {
      const info = data as { admin_whatsapp?: string; community_url?: string } | null
      setSupport(info?.admin_whatsapp || null)
      setCommunity(info?.community_url || null)
    })
  }, [])

  const activate = (id: string, label: string) => {
    updateOnboarding({ tools: [...tools, id] })
    flash(tx('{label} activado. Ya está en tus herramientas.', { label: label }))
  }

  const planSub = business.comped
    ? tx('Cortesía · sin mensualidad')
    : status.status === 'prueba'
    ? tx('Prueba gratis · {v}', { v: daysLeft(status.trial_ends_at) <= 0 ? tx('último día') : tx('quedan {daysLeft} días', { daysLeft: daysLeft(status.trial_ends_at) }) })
    : status.paid_until ? tx('Pagado hasta dentro de {max} días', { max: Math.max(daysLeft(status.paid_until), 0) }) : tx('Hasta cuándo está pagado y cómo pagar')

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold tracking-tight">{tx('Más')}</h1>

      {on.length > 0 && (
        <div>
          <SectionTitle>{tx('Tus herramientas')}</SectionTitle>
          <RowList>
            {on.map((t) => <Row key={t.id} icon={t.icon} title={t.label} sub={t.desc} to={link(t.id)} />)}
          </RowList>
        </div>
      )}

      {off.length > 0 && (
        <div>
          <SectionTitle right={<span className="text-xs text-slate-400">{tx('Actívalas cuando las necesites')}</span>}>{tx('Más herramientas')}</SectionTitle>
          <RowList>
            {off.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><Icon name={t.icon} className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{t.label}</span>
                  <span className="block text-sm text-slate-500">{t.desc}</span>
                </span>
                <Button size="sm" variant="secondary" onClick={() => activate(t.id, t.label)}>{tx('Activar')}</Button>
              </div>
            ))}
          </RowList>
        </div>
      )}

      <div>
        <SectionTitle>{tx('Tu cuenta')}</SectionTitle>
        <RowList>
          <Row icon="card" title={tx('Mensualidad')} sub={planSub} to={link('plan')} />
          <Row
            icon="gear"
            title={tx('Ajustes y avisos')}
            sub={push === true ? tx('Avisos activados en este móvil') : push === false ? tx('Avisos sin activar en este móvil') : tx('Avisos, datos del negocio y tu cuenta')}
            to={link('ajustes')}
            tour="avisos"
            right={push === false ? <Chip>{tx('Actívalos')}</Chip> : undefined}
          />
        </RowList>
      </div>

      <div>
        <SectionTitle>{tx('Ayuda')}</SectionTitle>
        <RowList>
          <Row icon="sparkles" title={tx('Tutorial paso a paso')} sub={tx('Te enseñamos a usar tu panel en 2 minutos')} onClick={tutorial.active ? undefined : showTour} />
          {support && (
            <Row
              icon="whatsapp"
              title={tx('Hablar con una persona')}
              sub={tx('Te ayudamos por WhatsApp')}
              tint="bg-[#25D366]/15 text-[#128C7E]"
              href={waLink(support, tx('Hola, soy de {name} (código {code}) y necesito ayuda con Citora.', { name: business.name, code: business.code }))}
            />
          )}
          {community && (
            <Row
              icon="whatsapp"
              title={tx('Grupo de Citora en WhatsApp')}
              sub={tx('Novedades, consejos y dudas con otros negocios')}
              tint="bg-[#25D366]/15 text-[#128C7E]"
              href={community}
            />
          )}
          <Row icon="globe" title={tx('Ver mi página de reservas')} sub={tx('Así la ven tus clientes')} href={publicUrl(business.slug)} />
        </RowList>
      </div>

      <InstallButton appName={tx('tu panel')} label={tx('Instalar el panel en este móvil')} block />
      {!IS_INT && (
        <button onClick={showNews} className="mx-auto flex items-center gap-1.5 text-sm font-semibold text-brand">
          <Icon name="sparkles" className="h-4 w-4" /> {tx('Novedades de la versión')}{' '}{APP_VERSION}
        </button>
      )}
      <p className="-mt-3 text-center text-xs text-slate-400">{tx('Citora v')}{APP_VERSION}</p>
    </div>
  )
}
