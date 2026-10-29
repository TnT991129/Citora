import { servicesText } from '../../lib/appointments'
import { money, timeOf } from '../../lib/format'
import type { Appointment } from '../../lib/types'
import { StatusBadge } from '../../components/ui'
import { usePanel } from './context'

export function AppointmentRow({ a, onClick }: { a: Appointment; onClick: () => void }) {
  const { business, staff } = usePanel()
  const who = a.staff_id ? staff.find((s) => s.id === a.staff_id)?.name : null
  const faded = a.status === 'cancelada' || a.status === 'no_asistio'
  // Franja de color a la izquierda según el estado: se ve de un vistazo qué falta por confirmar
  const bar = { pendiente: 'bg-amber-400', confirmada: 'bg-sky-400', completada: 'bg-emerald-400', no_asistio: 'bg-slate-300', cancelada: 'bg-red-300' }[a.status]
  return (
    <button onClick={onClick} className={`card relative flex w-full items-center gap-3 overflow-hidden p-3 text-left transition hover:-translate-y-px hover:border-brand/40 sm:p-3.5 ${faded ? 'opacity-60' : ''}`}>
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${bar}`} />
      <div className="w-20 shrink-0 text-center">
        <p className="whitespace-nowrap text-base font-extrabold leading-tight text-brand">{timeOf(a.starts_at, business.timezone, true)}</p>
        <p className="whitespace-nowrap text-[11px] text-slate-400">{timeOf(a.ends_at, business.timezone, true)}</p>
      </div>
      <div className="min-w-0 flex-1 border-l border-slate-100 pl-3">
        <p className={`truncate font-semibold ${a.status === 'cancelada' ? 'line-through' : ''}`}>{a.customer_name}</p>
        <p className="truncate text-sm text-slate-500">{servicesText(a)}</p>
        {who && <p className="truncate text-xs font-medium text-slate-500">con {who}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <StatusBadge status={a.status} />
        <span className="text-xs font-semibold text-slate-600">{money(a.total, business.currency)}</span>
      </div>
    </button>
  )
}
