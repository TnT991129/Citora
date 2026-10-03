import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Button, CopyButton, Empty, LinkButton, PageLoader, WhatsAppIcon } from '../../components/ui'
import { buildMessage, fetchAppointments, isActive } from '../../lib/appointments'
import { errorMessage } from '../../lib/errors'
import { addDays, dateKey, money, timeOf, todayKey, dayTitle } from '../../lib/format'
import { hasModule } from '../../lib/plans'
import type { Appointment } from '../../lib/types'
import { publicUrl } from '../../lib/url'
import { shareLink, waLink } from '../../lib/whatsapp'
import { AppointmentRow } from './AppointmentList'
import { AppointmentModal } from './AppointmentModal'
import { usePanel } from './context'
import { NewAppointment } from './NewAppointment'

export default function Today() {
  const { business, status } = usePanel()
  const tz = business.timezone
  const today = todayKey(tz)
  const tomorrow = addDays(today, 1)
  const [list, setList] = useState<Appointment[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Appointment | null>(null)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    try {
      setList(await fetchAppointments(business, today, addDays(today, 30)))
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [business, today])

  useEffect(() => {
    load()
  }, [load])

  if (error) return <Alert>{error}</Alert>
  if (!list) return <PageLoader />

  const todays = list.filter((a) => dateKey(a.starts_at, tz) === today)
  const tomorrows = list.filter((a) => dateKey(a.starts_at, tz) === tomorrow && isActive(a))
  const pending = list.filter((a) => a.status === 'pendiente')
  const upcomingCount = list.filter((a) => isActive(a)).length
  const income = todays.filter((a) => a.status === 'completada').reduce((s, a) => s + Number(a.total), 0)
  const expected = todays.filter(isActive).reduce((s, a) => s + Number(a.total), 0)
  const now = Date.now()
  const next = todays.find((a) => isActive(a) && new Date(a.ends_at).getTime() > now)
  const url = publicUrl(business.slug)
  const canWhatsApp = hasModule(status.effective_plan, 'whatsapp')

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">Hoy</p>
          <h1 className="text-2xl font-extrabold">{dayTitle(today)}</h1>
        </div>
        <Button size="sm" onClick={() => setAdding(true)}>+ Cita</Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Citas hoy" value={String(todays.filter(isActive).length)} />
        <Stat label="Por confirmar" value={String(pending.length)} highlight={pending.length > 0} />
        <Stat label="Cobrado hoy" value={money(income, business.currency)} sub={expected > income ? `de ${money(expected, business.currency)}` : undefined} />
      </div>

      {next && (
        <div className="rounded-2xl bg-brand p-4 text-white shadow-lg shadow-brand/20">
          <p className="text-sm text-white/80">Próxima cita</p>
          <p className="mt-1 text-xl font-bold">{timeOf(next.starts_at, tz)} · {next.customer_name}</p>
          <button onClick={() => setOpen(next)} className="mt-2 text-sm font-semibold underline">Ver detalle</button>
        </div>
      )}

      <section>
        <h2 className="mb-2 font-bold">Citas de hoy</h2>
        <div className="space-y-2">
          {todays.length === 0 && <Empty title="No tienes citas hoy">Comparte tu enlace para recibir reservas.</Empty>}
          {todays.map((a) => <AppointmentRow key={a.id} a={a} onClick={() => setOpen(a)} />)}
        </div>
      </section>

      {pending.length > 0 && (
        <section>
          <h2 className="mb-2 font-bold">Pendientes de confirmar</h2>
          <div className="space-y-2">
            {pending.map((a) => (
              <div key={a.id}>
                <p className="mb-1 text-xs font-semibold text-slate-500">{dayTitle(dateKey(a.starts_at, tz))}</p>
                <AppointmentRow a={a} onClick={() => setOpen(a)} />
              </div>
            ))}
          </div>
        </section>
      )}

      {canWhatsApp && tomorrows.length > 0 && (
        <section className="card">
          <h2 className="font-bold">Recordatorios para mañana</h2>
          <p className="text-sm text-slate-500">Un toque y se abre WhatsApp con el mensaje escrito.</p>
          <ul className="mt-3 divide-y divide-slate-100">
            {tomorrows.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 py-2.5">
                <span className="min-w-0 truncate"><b>{timeOf(a.starts_at, tz)}</b> · {a.customer_name}</span>
                {a.customer_phone.length >= 8 ? (
                  <LinkButton href={waLink(a.customer_phone, buildMessage('recordatorio', a, business))} variant="whatsapp" size="sm" newTab>
                    <WhatsAppIcon className="h-4 w-4" /> Recordar
                  </LinkButton>
                ) : (
                  <span className="text-xs text-slate-400">Sin teléfono</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2 className="font-bold">Tu enlace de reservas</h2>
        <p className="mt-1 break-all font-semibold text-brand">{url.replace(/^https?:\/\//, '')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <CopyButton text={url} label="Copiar enlace" />
          <LinkButton href={shareLink(`¡Reserva tu cita en ${business.name} desde aquí! ${url}`)} variant="whatsapp" size="sm" newTab>
            <WhatsAppIcon className="h-4 w-4" /> Compartir
          </LinkButton>
          <LinkButton href={url} variant="secondary" size="sm" newTab>Ver mi app</LinkButton>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Ponlo en tu biografía de Instagram y en tu estado de WhatsApp. Próximos 30 días: {upcomingCount} citas.
        </p>
      </section>

      <p className="text-center text-sm text-slate-500">
        <Link to="/panel/agenda" className="font-semibold text-brand">Ver toda la agenda →</Link>
      </p>

      {open && <AppointmentModal appointment={open} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); load() }} />}
      {adding && <NewAppointment defaultDate={today} onClose={() => setAdding(false)} onCreated={() => { setAdding(false); load() }} />}
    </div>
  )
}

function Stat({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl bg-white p-3 shadow-sm ring-1 ${highlight ? 'ring-amber-300' : 'ring-slate-200'}`}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 truncate text-lg font-extrabold">{value}</p>
      {sub && <p className="truncate text-[11px] text-slate-400">{sub}</p>}
    </div>
  )
}
