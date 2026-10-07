import { servicesText } from '../../lib/appointments'
import { money, timeOf } from '../../lib/format'
import type { Appointment } from '../../lib/types'
import { StatusBadge } from '../../components/ui'
import { usePanel } from './context'

export function AppointmentRow({ a, onClick }: { a: Appointment; onClick: () => void }) {
  const { business, staff } = usePanel()
  const who = a.staff_id ? staff.find((s) => s.id === a.staff_id)?.name : null
  const faded = a.status === 'cancelada' || a.status === 'no_asistio'
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm ring-1 ring-slate-200 transition hover:ring-brand ${faded ? 'opacity-60' : ''}`}>
      <div className="w-14 shrink-0 text-center">
        <p className="text-lg font-extrabold leading-tight text-brand">{timeOf(a.starts_at, business.timezone)}</p>
        <p className="text-[11px] text-slate-400">{timeOf(a.ends_at, business.timezone)}</p>
      </div>
      <div className="min-w-0 flex-1 border-l border-slate-100 pl-3">
        <p className={`truncate font-semibold ${a.status === 'cancelada' ? 'line-through' : ''}`}>{a.customer_name}</p>
        <p className="truncate text-sm text-slate-500">{servicesText(a)}{who && <span className="font-medium text-slate-600"> · con {who}</span>}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <StatusBadge status={a.status} />
        <span className="text-xs font-semibold text-slate-600">{money(a.total, business.currency)}</span>
      </div>
    </button>
  )
}
