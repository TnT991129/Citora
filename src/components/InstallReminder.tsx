import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { isPushSubscribed, pushSupported } from '../lib/push'
import { useInstall } from '../lib/pwa'
import { InstallButton } from './InstallButton'
import { t } from '../lib/i18n'

/**
 * Aviso para instalar la app en la pantalla de inicio (y, si pushLink se pasa, para activar
 * también los avisos push). Se oculta solo cuando ya está todo hecho, sin que haya que cerrarlo.
 */
export function InstallReminder({ appName, pushLink }: { appName: string; pushLink?: string }) {
  const { mode } = useInstall()
  const [subscribed, setSubscribed] = useState<boolean | null>(null)

  useEffect(() => {
    if (pushLink && pushSupported()) isPushSubscribed().then(setSubscribed)
  }, [pushLink])

  const needsInstall = mode !== null
  const needsPush = Boolean(pushLink) && subscribed === false
  if (!needsInstall && !needsPush) return null

  return (
    <div className="card space-y-2 ring-2 ring-brand/20">
      <p className="font-bold">📱 {t('Ten {name} siempre a mano', { name: appName })}</p>
      {needsInstall && (
        <p className="text-sm text-slate-600">{t('Instálala en la pantalla de inicio de tu teléfono para abrirla como cualquier otra app, sin buscarla en el navegador.')}</p>
      )}
      {needsPush && (
        <p className="text-sm text-slate-600">
          Además, activa <b>"Avisos en este dispositivo"</b> en{' '}
          <Link to={pushLink!} className="font-semibold text-brand">Más → Ajustes</Link>
          {needsInstall ? ' (con los dos pasos)' : ''} — sin eso no te va a llegar ningún aviso cuando un cliente reserve.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {needsInstall && <InstallButton appName={appName} label={t('Instalar ahora')} variant="primary" />}
        {needsPush && (
          <Link to={pushLink!} className="inline-flex items-center rounded-btn bg-white px-4 py-2.5 text-sm font-semibold text-brand ring-1 ring-brand/30">
            Ir a Ajustes
          </Link>
        )}
      </div>
    </div>
  )
}
