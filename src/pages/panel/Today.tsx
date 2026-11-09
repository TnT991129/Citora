import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { InstallReminder } from '../../components/InstallReminder'
import { Alert, Button, CopyButton, LinkButton, WhatsAppIcon } from '../../components/ui'
import { buildMessage, fetchAppointments, isActive } from '../../lib/appointments'
import { errorMessage } from '../../lib/errors'
import { addDays, dateKey, money, timeOf, todayKey, dayTitle } from '../../lib/format'
import { hasModule } from '../../lib/plans'
import { supabase } from '../../lib/supabase'
import type { Appointment } from '../../lib/types'
import { publicUrl } from '../../lib/url'
import { shareLink, waLink } from '../../lib/whatsapp'
import { AppointmentRow } from './AppointmentList'
import { AppointmentModal } from './AppointmentModal'
import { usePanel } from './context'
import { DayTimeline, PublishFreeSlots, useDaySlots } from './DayTimeline'
import { Icon } from './Panel'
import { NewAppointment } from './NewAppointment'
import { RateCard } from './RateCard'
import { serverNow } from '../../lib/clockSkew'

export default function Today() {
  const { business, status, link } = usePanel()
  const tz = business.timezone
  const today = todayKey(tz)
  const tomorrow = addDays(today, 1)
  const [list, setList] = useState<Appointment[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Appointment | null>(null)
  const [adding, setAdding] = useState<{ date: string; time: string } | null>(null)
  const [tab, setTab] = useState<'hoy' | 'mañana'>('hoy')
  const [publishing, setPublishing] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const day = tab === 'hoy' ? today : tomorrow
  const slots = useDaySlots(day, refresh)

  const load = useCallback(async () => {
    try {
      setList(await fetchAppointments(business, today, addDays(today, 30)))
      setRefresh((n) => n + 1)
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [business, today])

  useEffect(() => {
    load()
  }, [load])

  if (error) return <Alert>{error}</Alert>
  if (!list) return <TodaySkeleton />

  const todays = list.filter((a) => dateKey(a.starts_at, tz) === today)
  const tomorrows = list.filter((a) => dateKey(a.starts_at, tz) === tomorrow && isActive(a))
  const pending = list.filter((a) => a.status === 'pendiente')
  // Las de hoy ya salen arriba en la línea de tiempo: aquí solo las de otros días
  const pendingLater = pending.filter((a) => dateKey(a.starts_at, tz) !== today)
  const upcomingCount = list.filter((a) => isActive(a)).length
  const income = todays.filter((a) => a.status === 'completada').reduce((s, a) => s + Number(a.total), 0)
  const expected = todays.filter(isActive).reduce((s, a) => s + Number(a.total), 0)
  const now = serverNow()
  const next = todays.find((a) => isActive(a) && new Date(a.ends_at).getTime() > now)
  const url = publicUrl(business.slug)
  const canWhatsApp = hasModule(status.effective_plan, 'whatsapp')
  const dayCount = (tab === 'hoy' ? todays.filter(isActive) : tomorrows).length
  const freeCount = slots?.filter((s) => s.available).length ?? 0
  const changed = () => { setOpen(null); setAdding(null); load() }

  return (
    <div className="space-y-5">
      <InstallReminder appName={business.name} pushLink={link('ajustes')} />

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{greeting(tz)}</p>
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">{dayTitle(today)}</h1>
        </div>
        <Button onClick={() => setAdding({ date: day, time: '' })} className="shrink-0" aria-label="Nueva cita">
          <Icon name="plus" className="h-4 w-4" /> <span className="sm:hidden">Cita</span><span className="hidden sm:inline">Nueva cita</span>
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
        <Stat icon="calendar" label="Citas hoy" value={String(todays.filter(isActive).length)} />
        <Stat icon="clock" label="Por confirmar" value={String(pending.length)} highlight={pending.length > 0} />
        <Stat
          icon="cash"
          label="Cobrado hoy"
          value={money(income, business.currency)}
          sub={expected > income ? `de ${money(expected, business.currency)}` : undefined}
          progress={expected > 0 ? income / expected : undefined}
        />
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
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <div className="inline-flex rounded-full bg-slate-100 p-1" role="tablist" aria-label="Día">
            {(['hoy', 'mañana'] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`rounded-full px-4 py-1.5 text-sm font-bold capitalize transition ${tab === t ? 'bg-white text-slate-900 shadow' : 'text-slate-500'}`}
              >
                {t}
              </button>
            ))}
          </div>
          <Button size="sm" variant="secondary" onClick={() => setPublishing(true)} disabled={!slots} className="shrink-0">
            <Icon name="sparkles" className="h-4 w-4 text-brand" /> Publicar mis huecos
          </Button>
        </div>
        <p className="mb-2.5 text-sm text-slate-500">
          {dayCount === 1 ? '1 cita' : `${dayCount} citas`}
          {slots && slots.length > 0 && <> · <b className="text-emerald-700">{freeCount === 1 ? '1 hueco libre' : `${freeCount} huecos libres`}</b></>}
          {slots && freeCount > 0 && ' · toca uno para añadir una cita'}
        </p>
        <DayTimeline
          day={day}
          isToday={tab === 'hoy'}
          list={list}
          slots={slots}
          onOpen={setOpen}
          onPick={(time) => setAdding({ date: day, time })}
        />
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

      {canWhatsApp && tomorrows.length > 0 && <TomorrowReminders list={tomorrows} />}

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

      {open && <AppointmentModal appointment={open} onClose={() => setOpen(null)} onChanged={changed} />}
      {adding && <NewAppointment defaultDate={adding.date} defaultTime={adding.time} onClose={() => setAdding(null)} onCreated={changed} />}
      {publishing && slots && <PublishFreeSlots when={tab} slots={slots} onClose={() => setPublishing(false)} />}
    </div>
  )
}

/**
 * Recordatorios de mañana. Con "Avisar a todos" se van enviando uno detrás de otro: al volver de
 * WhatsApp ya está listo el siguiente, a un toque. Cada envío queda apuntado (como en Recordatorios).
 */
function TomorrowReminders({ list }: { list: Appointment[] }) {
  const { business } = usePanel()
  const tz = business.timezone
  const withPhone = list.filter((a) => a.customer_phone.length >= 8 && (a.status === 'pendiente' || a.status === 'confirmada'))
  const [sent, setSent] = useState<Set<string>>(() => new Set(withPhone.filter((a) => a.reminded_at).map((a) => a.id)))
  const [skipped, setSkipped] = useState<Set<string>>(new Set())
  const [chain, setChain] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const markSent = async (a: Appointment) => {
    setSent((s) => new Set(s).add(a.id))
    const { error } = await supabase.from('appointments').update({ reminded_at: new Date().toISOString() }).eq('id', a.id)
    if (error) setError(errorMessage(error))
  }

  const toSend = withPhone.filter((a) => !sent.has(a.id))
  const next = toSend.find((a) => !skipped.has(a.id))
  const done = withPhone.length - toSend.length

  return (
    <section className="card">
      <h2 className="flex items-center gap-2 font-extrabold tracking-tight"><Icon name="bell" className="h-5 w-5 text-brand" /> Recordatorios para mañana</h2>
      <p className="text-sm text-slate-500">
        {withPhone.length === 0 ? 'Ninguna cita de mañana tiene teléfono.' : toSend.length === 0 ? '¡Todos avisados! ✅' : `${done} de ${withPhone.length} avisados`}
      </p>

      {withPhone.length > 0 && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-[#25D366] transition-all duration-500" style={{ width: `${(done / withPhone.length) * 100}%` }} />
        </div>
      )}

      {!chain && toSend.length > 1 && (
        <Button block variant="whatsapp" onClick={() => { setSkipped(new Set()); setChain(true) }} className="mt-3">
          <WhatsAppIcon className="h-4 w-4" /> Avisar a todos ({toSend.length})
        </Button>
      )}

      {error && <div className="mt-3"><Alert>{error}</Alert></div>}

      {chain && next && (
        <div className="ui-fade mt-4 rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-emerald-700">
            Siguiente · {withPhone.indexOf(next) + 1} de {withPhone.length}
          </p>
          <p className="mt-1 truncate text-lg font-extrabold text-emerald-900">{timeOf(next.starts_at, tz, true)} · {next.customer_name}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a
              href={waLink(next.customer_phone, buildMessage('recordatorio', next, business))}
              target="_blank"
              rel="noreferrer"
              onClick={() => markSent(next)}
              className="inline-flex basis-full items-center justify-center gap-2 rounded-btn bg-[#25D366] px-4 py-3 font-semibold text-white shadow-sm active:scale-[0.98]"
            >
              <WhatsAppIcon className="h-4 w-4" /> Enviar a {next.customer_name.split(' ')[0]}
            </a>
            <Button size="sm" variant="secondary" className="flex-1" onClick={() => setSkipped((s) => new Set(s).add(next.id))}>Saltar este</Button>
            <Button size="sm" variant="ghost" className="flex-1" onClick={() => setChain(false)}>Parar</Button>
          </div>
        </div>
      )}
      {chain && !next && toSend.length > 0 && (
        <p className="mt-4 text-sm text-slate-500">Saltaste {toSend.length === 1 ? 'una' : toSend.length}. Puedes enviarlas abajo.</p>
      )}

      <ul className="mt-3 divide-y divide-slate-100">
        {list.map((a) => {
          const isSent = sent.has(a.id)
          return (
            <li key={a.id} className={`flex items-center justify-between gap-2 py-2.5 ${isSent ? 'opacity-60' : ''}`}>
              <span className="min-w-0 truncate">
                {isSent && <span className="mr-1 text-emerald-600">✓</span>}
                <b>{timeOf(a.starts_at, tz, true)}</b> · {a.customer_name}
              </span>
              {a.customer_phone.length >= 8 ? (
                <a
                  href={waLink(a.customer_phone, buildMessage('recordatorio', a, business))}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => markSent(a)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-btn bg-[#25D366] px-3 py-1.5 text-sm font-semibold text-white"
                >
                  <WhatsAppIcon className="h-4 w-4" /> {isSent ? 'Otra vez' : 'Recordar'}
                </a>
              ) : (
                <span className="text-xs text-slate-400">Sin teléfono</span>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function Stat({ icon, label, value, sub, highlight, progress }: { icon: string; label: string; value: string; sub?: string; highlight?: boolean; progress?: number }) {
  return (
    <div className={`card p-3 sm:p-4 ${highlight ? 'ring-2 ring-amber-300' : ''}`}>
      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${highlight ? 'bg-amber-100 text-amber-700' : 'bg-brand/10 text-brand'}`}>
        <Icon name={icon} className="h-[18px] w-[18px]" />
      </span>
      <p className={`mt-2 truncate font-extrabold tracking-tight sm:text-2xl ${value.length > 7 ? 'text-[15px]' : 'text-lg'}`} title={value}>{value}</p>
      <p className="truncate text-xs font-medium text-slate-500">{label}</p>
      {sub && <p className="truncate text-[11px] text-slate-400">{sub}</p>}
      {progress !== undefined && (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100" title={`${Math.round(progress * 100)} % cobrado`}>
          <div className="h-full rounded-full bg-emerald-500 transition-all duration-700" style={{ width: `${Math.min(100, Math.round(progress * 100))}%` }} />
        </div>
      )}
    </div>
  )
}

/** Silueta de la pantalla mientras cargan las citas (parece más rápido que una ruedita) */
function TodaySkeleton() {
  const bar = 'animate-pulse rounded-xl bg-slate-200'
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Cargando">
      <div className="space-y-2">
        <div className={`h-4 w-28 ${bar}`} />
        <div className={`h-8 w-56 ${bar}`} />
      </div>
      <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
        {[0, 1, 2].map((i) => <div key={i} className={`h-[104px] ${bar}`} />)}
      </div>
      <div className={`h-20 ${bar}`} />
      <div className={`h-9 w-48 rounded-full ${bar}`} />
      <div className="card space-y-3 p-4">
        {[70, 40, 90, 55].map((w, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className={`h-3 w-9 ${bar}`} />
            <span className={`h-12 ${bar}`} style={{ width: `${w}%` }} />
          </div>
        ))}
      </div>
    </div>
  )
}

/** "Buenos días", "Buenas tardes" o "Buenas noches" según la hora del negocio */
function greeting(tz: string): string {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(new Date(serverNow())))
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
