import { Link } from 'react-router-dom'
import { MODULES, PLANS, hasModule, type ModuleKey } from '../../lib/plans'
import { usePanel } from './context'
import { t } from '../../lib/i18n'

/** true si el plan actual del dueño incluye el módulo */
export function useModule(module: ModuleKey): boolean {
  const { status } = usePanel()
  return hasModule(status.effective_plan, module)
}

/** Aviso cuando el plan actual no incluye un módulo */
export function Locked({ module }: { module: ModuleKey }) {
  const { link, status } = usePanel()
  // Con plan Solo, el equipo está en el plan Equipo: se le explica en vez de un candado sin más
  if (module === 'empleados' && status.effective_plan) {
    return (
      <div className="card mx-auto max-w-md text-center">
        <p className="text-4xl" aria-hidden>👥</p>
        <h1 className="mt-2 text-xl font-bold">{t('Tu equipo está en el plan Equipo')}</h1>
        <p className="mt-2 text-slate-600">
          {t('Con')}{' '}<b>{PLANS.ultra.name}</b> {t('añades a las personas que trabajan contigo: cada una con sus servicios, su horario y su propio enlace, y tus clientes eligen con quién reservar.')}
        </p>
        <p className="mt-2 text-sm text-slate-500">{t('Si ya tenías equipo, no se ha borrado nada: vuelve a aparecer al pasar a Equipo.')}</p>
        <Link to={link('plan')} className="mt-4 inline-flex items-center justify-center rounded-xl bg-brand px-5 py-3 font-semibold text-white">
          {t('Pasarme a Equipo')}
        </Link>
      </div>
    )
  }
  return (
    <div className="card mx-auto max-w-md text-center">
      <p className="text-4xl">🔒</p>
      <h1 className="mt-2 text-xl font-bold">{MODULES[module].name}</h1>
      <p className="mt-1 text-slate-600">{t('Paga tu mensualidad para volver a usarlo.')}</p>
      <Link to={link('plan')} className="mt-4 inline-flex items-center justify-center rounded-xl bg-brand px-5 py-3 font-semibold text-white">
        {t('Pagar mensualidad')}
      </Link>
    </div>
  )
}
