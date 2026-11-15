import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { InstallReminder } from '../../components/InstallReminder'
import { Alert, Button, Modal, WhatsAppIcon } from '../../components/ui'
import { buildMessage, fetchAppointments, isActive, servicesText } from '../../lib/appointments'
import { errorMessage } from '../../lib/errors'
import { addDays, dateKey, money, timeOf, todayKey, dayTitle } from '../../lib/format'
import { hasModule } from '../../lib/plans'
import { supabase } from '../../lib/supabase'
import type { Appointment } from '../../lib/types'
import { waLink } from '../../lib/whatsapp'
import { AppointmentModal } from './AppointmentModal'
import { usePanel } from './context'
import { DayTimeline, PublishFreeSlots, useDaySlots } from './DayTimeline'
import { FirstSteps, useFirstStepsVisible } from './FirstSteps'
import { Icon } from './Panel'
import { NewAppointment } from './NewAppointment'
import { RateCard } from './RateCard'
import { demoDay, demoSlots } from './tutorial'
import { serverNow } from '../../lib/clockSkew'

export default function Today() {
  const { business, status, services, link, tutorial } = usePanel()
  const tz = business.timezone
  const today = todayKey(tz)
  const tomorrow = addDays(today, 1)
  const [params, setParams] = useSearchParams()
  const [real, setReal] = useState<Appointment[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Appointment | null>(null)
  const [adding, setAdding] = useState<{ date: string; time: string } | null>(null)
  const [tab, setTab] = useState<'hoy' | 'mañana'>('hoy')
  const [publishing, setPublishing] = useState(false)
  const [remind, setRemind] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)
  const day = tab === 'hoy' ? today : tomorrow
  const realSlots = useDaySlots(day, refresh)
  const stepsVisible = useFirstStepsVisible()

  // Tutorial: un día de ejemplo que nunca se guarda
  const demo = tutorial.active
  const [demoList, setDemoList] = useState<Appointment[]>([])
  useEffect(() => {
    if (demo) {
      setTab('hoy')
      setDemoList(demoDay(today, tz, services, business.id))
    }
  }, [demo, today, tz, services, business.id])

  const load = useCallback(async () => {
    try {
      setReal(await fetchAppointments(business, today, addDays(today, 30)))
      setRefresh((n) => n + 1)
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [business, today])

  useEffect(() => {
    load()
  }, [load])

  // "Nueva cita" del menú lateral del ordenador: ?nueva=1
  useEffect(() => {
    if (params.get('nueva') !== '1') return
    params.delete('nueva')
    setParams(params, { replace: true })
    if (!demo) setAdding({ date: today, time: '' })
  }, [params, setParams, today, demo])

  const list = demo ? demoList : real
  const slots = useMemo(() => (demo ? demoSlots() : realSlots), [demo, realSlots])

  if (error && !demo) return <Alert>{error}</Alert>
  if (!list) return <TodaySkeleton />

  const todays = list.filter((a) => dateKey(a.starts_at, tz) === today)
  const tomorrows = list.filter((a) => dateKey(a.starts_at, tz) === tomorrow && isActive(a))
  const pending = list.filter((a) => a.status === 'pendiente')
  const activeToday = todays.filter(isActive)
  const expected = activeToday.reduce((s, a) => s + Number(a.total), 0)
  const now = serverNow()
  const next = activeToday.find((a) => new Date(a.ends_at).getTime() > now)
  const canWhatsApp = hasModule(status.effective_plan, 'whatsapp')
  const dayCount = (tab === 'hoy' ? activeToday : tomorrows).length
  const freeCount = slots?.filter((s) => s.available).length ?? 0
  const changed = () => { setOpen(null); setAdding(null); load() }

  const confirm = async (a: Appointment) => {
    if (demo) {
      setDemoList((l) => l.map((x) => (x.id === a.id ? { ...x, status: 'confirmada' } : x)))
      return
    }
    setConfirming(a.id)
    const { error } = await supabase.from('appointments').update({ status: 'confirmada' }).eq('id', a.id)
    setConfirming(null)
    if (error) setError(errorMessage(error))
    else load()
  }

  const openAppt = (a: Appointment) => !demo && setOpen(a)
  const newAppt = (time = '') => !demo && setAdding({ date: day, time })

  return (
    <div className="space-y-5">
      {!stepsVisible && !demo && <InstallReminder appName={business.name} pushLink={link('ajustes')} />}

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0" data-tour="resumen">
          <p className="text-sm font-medium text-slate-500">{greeting(tz)}</p>
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">{dayTitle(today)}</h1>
          <p className="mt-1 text-[15px] text-slate-500">
            <b className="text-slate-900">{activeToday.length === 1 ? '1 cita' : `${activeToday.length} citas`}</b>
            {pending.length > 0 && <> · <b className="text-amber-700">{pending.length} por confirmar</b></>}
            {expected > 0 && <> · {money(expected, business.currency)} previstos</>}
          </p>
        </div>
        <Button onClick={() => newAppt()} className="hidden shrink-0 lg:inline-flex" data-tour="fab">
          <Icon name="plus" className="h-4 w-4" /> Nueva cita
        </Button>
      </div>

      {!demo && <FirstSteps />}

      <RateCard />

      {next && (
        <button
          onClick={() => openAppt(next)}
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

      {pending.length > 0 && (
        <section>
          <h2 className="mb-2.5 font-extrabold tracking-tight">Por confirmar</h2>
          <div className="space-y-2">
            {pending.map((a, i) => (
              <div key={a.id} className="card flex items-center gap-3 p-3 sm:p-3.5">
                <button onClick={() => openAppt(a)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <span aria-hidden className="h-10 w-1 shrink-0 rounded-full bg-amber-400" />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{a.customer_name}</span>
                    <span className="block truncate text-sm text-slate-500">
                      {dateKey(a.starts_at, tz) === today ? 'Hoy' : dayTitle(dateKey(a.starts_at, tz))}, {timeOf(a.starts_at, tz, true)} · {servicesText(a)}
                    </span>
                  </span>
                </button>
                <Button size="sm" onClick={() => confirm(a)} loading={confirming === a.id} data-tour={i === 0 ? 'confirm' : undefined}>
                  Confirmar
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <div className="inline-flex rounded-full bg-slate-100 p-1" role="tablist" aria-label="Día">
            {(['hoy', 'mañana'] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => !demo && setTab(t)}
                className={`rounded-full px-4 py-1.5 text-sm font-bold capitalize transition ${tab === t ? 'bg-white text-slate-900 shadow' : 'text-slate-500'}`}
              >
                {t}
              </button>
            ))}
          </div>
          <Button size="sm" variant="ghost" onClick={() => !demo && setPublishing(true)} disabled={!slots} className="shrink-0 text-brand">
            <Icon name="sparkles" className="h-4 w-4" /> Publicar huecos
          </Button>
        </div>
        <p className="mb-2.5 text-sm text-slate-500">
          {dayCount === 1 ? '1 cita' : `${dayCount} citas`}
          {slots && slots.length > 0 && <> · <b className="text-emerald-700">{freeCount === 1 ? '1 hueco libre' : `${freeCount} huecos libres`}</b></>}
          {slots && freeCount > 0 && ' · toca uno para añadir una cita'}
        </p>
        <div data-tour="dia">
          <DayTimeline
            day={day}
            isToday={tab === 'hoy'}
            list={list}
            slots={slots}
            onOpen={openAppt}
            onPick={(time) => newAppt(time)}
          />
        </div>
      </section>

      {canWhatsApp && tab === 'hoy' && tomorrows.length > 0 && !demo && (
        remind ? <TomorrowReminders list={tomorrows} onClose={() => setRemind(false)} /> : (
          <button onClick={() => setRemind(true)} className="card flex w-full items-center gap-3 text-left transition hover:bg-slate-50">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#25D366]/15 text-[#128C7E]"><WhatsAppIcon className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Mañana tienes {tomorrows.length === 1 ? '1 cita' : `${tomorrows.length} citas`}</span>
              <span className="block truncate text-sm text-slate-500">Recuérdaselas por WhatsApp, una detrás de otra</span>
            </span>
            <span className="shrink-0 rounded-lg bg-[#25D366] px-3 py-1.5 text-sm font-semibold text-white">Avisar</span>
          </button>
        )
      )}

      {/* Botón + del móvil (en el ordenador está "Nueva cita" arriba y en el menú lateral) */}
      <button
        onClick={() => newAppt()}
        data-tour="fab"
        className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] right-4 z-20 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand bg-btn-grad text-white shadow-lg shadow-brand/40 transition active:scale-95 md:bottom-6 lg:hidden"
        aria-label="Nueva cita"
      >
        <Icon name="plus" className="h-6 w-6" />
      </button>

      {open && <AppointmentModal appointment={open} onClose={() => setOpen(null)} onChanged={changed} />}
      {adding && <NewAppointment defaultDate={adding.date} defaultTime={adding.time} onClose={() => setAdding(null)} onCreated={changed} />}
      {publishing && slots && <PublishFreeSlots when={tab} slots={slots} onClose={() => setPublishing(false)} />}
      {demo && tutorial.step?.sheet === 'nueva' && <DemoNewSheet />}
    </div>
  )
}

/** La hoja de "Nueva cita" del tutorial: igual que la de verdad, pero de ejemplo (no guarda nada) */
function DemoNewSheet() {
  const { services } = usePanel()
  const s = services.find((x) => x.active && !x.is_extra)
  const field = (label: string, value: string) => (
    <div>
      <p className="label">{label}</p>
      <div className="input bg-slate-50 text-slate-700">{value}</div>
    </div>
  )
  return (
    <Modal
      open
      onClose={() => {}}
      title="Nueva cita"
      footer={<Button block size="lg" data-tour="guardar">Guardar cita</Button>}
    >
      <div className="space-y-4">
        {field('Quién viene', 'Juana Gómez · 53 5555 0000')}
        {field('Qué se va a hacer', s ? s.name : 'Tu servicio')}
        {field('Qué día y a qué hora', 'Hoy, 1:00 p. m.')}
        <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">Es una cita de ejemplo: no se guarda.</p>
      </div>
    </Modal>
  )
}

/**
 * Recordatorios de mañana. Con "Avisar a todos" se van enviando uno detrás de otro: al volver de
 * WhatsApp ya está listo el siguiente, a un toque. Cada envío queda apuntado (como en Recordatorios).
 */
function TomorrowReminders({ list, onClose }: { list: Appointment[]; onClose: () => void }) {
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
      <div className="flex items-start justify-between gap-3">
        <h2 className="flex items-center gap-2 font-extrabold tracking-tight"><Icon name="bell" className="h-5 w-5 text-brand" /> Recordatorios para mañana</h2>
        <button onClick={onClose} className="-mr-1 -mt-1 rounded-full p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Cerrar"><Icon name="x" className="h-4 w-4" /></button>
      </div>
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

/** Silueta de la pantalla mientras cargan las citas (parece más rápido que una ruedita) */
function TodaySkeleton() {
  const bar = 'animate-pulse rounded-xl bg-slate-200'
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Cargando">
      <div className="space-y-2">
        <div className={`h-4 w-28 ${bar}`} />
        <div className={`h-8 w-56 ${bar}`} />
        <div className={`h-4 w-64 ${bar}`} />
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
