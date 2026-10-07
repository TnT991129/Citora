import { Link } from 'react-router-dom'
import { MODULES, PLAN_NAMES, PLAN_ORDER, PLAN_MODULES, hasModule, type ModuleKey } from '../../lib/plans'
import { usePanel } from './context'

/** true si el plan actual del dueño incluye el módulo */
export function useModule(module: ModuleKey): boolean {
  const { status } = usePanel()
  return hasModule(status.effective_plan, module)
}

/** Aviso cuando el plan actual no incluye un módulo */
export function Locked({ module }: { module: ModuleKey }) {
  const needed = PLAN_ORDER.find((p) => PLAN_MODULES[p].includes(module))!
  return (
    <div className="card mx-auto max-w-md text-center">
      <p className="text-4xl">🔒</p>
      <h1 className="mt-2 text-xl font-bold">{MODULES[module].name}</h1>
      <p className="mt-1 text-slate-600">Está incluido desde el plan <b>{PLAN_NAMES[needed]}</b>.</p>
      <Link to="/panel/plan" className="mt-4 inline-flex items-center justify-center rounded-xl bg-brand px-5 py-3 font-semibold text-white">
        Ver planes
      </Link>
    </div>
  )
}
