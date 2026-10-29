import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { InstallReminder } from '../../components/InstallReminder'
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
import { Icon } from './Panel'
import { NewAppointment } from './NewAppointment'
import { RateCard } from './RateCard'

export default function Today() {
  const { business, status, link } = usePanel()
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
  // Las de hoy ya salen arriba en "Citas de hoy": aquí solo las de otros días (antes salían repetidas)
  const pendingLater = pending.filter((a) => dateKey(a.starts_at, tz) !== today)
  const upcomingCount = list.filter((a) => isActive(a)).length
  const income = todays.filter((a) => a.status === 'completada').reduce((s, a) => s + Number(a.total), 0)
  const expected = todays.filter(isActive).reduce((s, a) => s + Number(a.total), 0)
  const now = Date.now()
  const next = todays.find((a) => isActive(a) && new Date(a.ends_at).getTime() > now)
  const url = publicUrl(business.slug)
  const canWhatsApp = hasModule(status.effective_plan, 'whatsapp')

  return (
    <div className="space-y-5">
      <InstallReminder appName={business.name} pushLink={link('ajustes')} />

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{greeting(tz)}</p>
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">{dayTitle(today)}</h1>
        </div>
        <Button onClick={() => setAdding(true)} className="shrink-0" aria-label="Nueva cita">
          <Icon name="plus" className="h-4 w-4" /> <span className="sm:hidden">Cita</span><span className="hidden sm:inline">Nueva cita</span>
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
        <Stat icon="calendar" label="Citas hoy" value={String(todays.filter(isActive).length)} />
        <Stat icon="clock" label="Por confirmar" value={String(pending.length)} highlight={pending.length > 0} />
        <Stat icon="cash" label="Cobrado hoy" value={money(income, business.currency)} sub={expected > income ? `de ${money(expected, business.currency)}` : undefined} />
      </div>

      <RateCard />

      {next && (
        <button
          onClick={() => setOpen(next)}
          className="relative flex w-full items-center gap-4 overflow-hidden rounded-2xl bg-brand bg-btn-grad p-4 text-left text-white shadow-lg shadow-brand/25 transition active:scale-[0.99] sm:p-5"
        >
          <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/10" />
          <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-white/20 leading-none">
            <Icon name="clock" className="h-6 w-6" />
          </span>
          <span className="relative min-w-0 flex-1">
            <span className="block text-xs font-bold uppercase tracking-[0.14em] text-white/75">Próxima cita · {untilText(next.starts_at, now)}</span>
            <span className="mt-0.5 block truncate text-lg font-extrabold sm:text-xl">{timeOf(next.starts_at, tz, true)} · {next.customer_name}</span>
          </span>
          <Icon name="chevron" className="relative h-5 w-5 shrink-0 text-white/80" />
        </button>
      )}

      <section>
        <h2 className="mb-2.5 flex items-center justify-between font-extrabold tracking-tight">
          Citas de hoy
          {todays.length > 0 && <span className="text-sm font-semibold text-slate-500">{todays.filter(isActive).length} activas</span>}
        </h2>
        <div className="space-y-2">
          {todays.length === 0 && <Empty title="No tienes citas hoy">Comparte tu enlace para recibir reservas.</Empty>}
          {todays.map((a) => <AppointmentRow key={a.id} a={a} onClick={() => setOpen(a)} />)}
        </div>
      </section>

      {pendingLater.length > 0 && (
        <section>
          <h2 className="mb-2.5 font-extrabold tracking-tight">Por confirmar en los próximos días</h2>
          <div className="space-y-2">
            {pendingLater.map((a) => (
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
          <h2 className="flex items-center gap-2 font-extrabold tracking-tight"><Icon name="bell" className="h-5 w-5 text-brand" /> Recordatorios para mañana</h2>
          <p className="text-sm text-slate-500">Un toque y se abre WhatsApp con el mensaje escrito.</p>
          <ul className="mt-3 divide-y divide-slate-100">
            {tomorrows.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 py-2.5">
                <span className="min-w-0 truncate"><b>{timeOf(a.starts_at, tz, true)}</b> · {a.customer_name}</span>
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
        <h2 className="flex items-center gap-2 font-extrabold tracking-tight"><Icon name="globe" className="h-5 w-5 text-brand" /> Tu enlace de reservas</h2>
        <p className="mt-2 break-all rounded-xl bg-slate-50 px-3 py-2 font-mono text-sm font-semibold text-brand">{url.replace(/^https?:\/\//, '')}</p>
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
        <Link to={link('agenda')} className="font-semibold text-brand">Ver toda la agenda →</Link>
      </p>

      {open && <AppointmentModal appointment={open} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); load() }} />}
      {adding && <NewAppointment defaultDate={today} onClose={() => setAdding(false)} onCreated={() => { setAdding(false); load() }} />}
    </div>
  )
}

function Stat({ icon, label, value, sub, highlight }: { icon: string; label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`card p-3 sm:p-4 ${highlight ? 'ring-2 ring-amber-300' : ''}`}>
      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${highlight ? 'bg-amber-100 text-amber-700' : 'bg-brand/10 text-brand'}`}>
        <Icon name={icon} className="h-[18px] w-[18px]" />
      </span>
      <p className="mt-2 truncate text-lg font-extrabold tracking-tight sm:text-2xl">{value}</p>
      <p className="truncate text-xs font-medium text-slate-500">{label}</p>
      {sub && <p className="truncate text-[11px] text-slate-400">{sub}</p>}
    </div>
  )
}

/** "Buenos días", "Buenas tardes" o "Buenas noches" según la hora del negocio */
function greeting(tz: string): string {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(new Date()))
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
}

/** "en 45 min", "en 2 h", "ahora" */
function untilText(iso: string, now: number): string {
  const min = Math.round((new Date(iso).getTime() - now) / 60000)
  if (min <= 0) return 'ahora'
  if (min < 60) return `en ${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `en ${h} h ${m} min` : `en ${h} h`
}
