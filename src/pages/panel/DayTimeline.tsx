import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, CopyButton, LinkButton, Modal, WhatsAppIcon } from '../../components/ui'
import { servicesText } from '../../lib/appointments'
import { serverNow } from '../../lib/clockSkew'
import { dayBounds, freeRanges, freeSlotsMessage, hourLabel, layoutDay, minuteOf, type DayBlock, type Slot } from '../../lib/dayPlan'
import { dateKey, fromMin, money, time12 } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import type { Appointment } from '../../lib/types'
import { publicUrl } from '../../lib/url'
import { shareLink } from '../../lib/whatsapp'
import { AppointmentRow } from './AppointmentList'
import { usePanel } from './context'
import { Icon } from './Panel'

/** Píxeles por minuto: una hora mide 96 px */
const PX = 1.6
/** Ancho de la columna de las horas, a la izquierda */
const GUTTER = 52

const STATUS_STYLE: Record<string, string> = {
  pendiente: 'border-amber-400 bg-amber-50 text-amber-900',
  confirmada: 'border-sky-400 bg-sky-50 text-sky-900',
  completada: 'border-emerald-400 bg-emerald-50 text-emerald-900',
  no_asistio: 'border-slate-300 bg-slate-50 text-slate-500',
}

/** Turnos de un día con su estado (libre u ocupado). Vacío si ese día no abre. */
export function useDaySlots(day: string, refresh: number): Slot[] | null {
  const { business, services } = usePanel()
  // Huecos donde cabe al menos el servicio más corto
  const shortest = Math.min(...services.filter((s) => s.active && !s.is_extra).map((s) => s.duration_min), 60) || 30
  const [slots, setSlots] = useState<Slot[] | null>(null)
  useEffect(() => {
    let alive = true
    setSlots(null)
    supabase
      .rpc('get_available_slots', { p_slug: business.slug, p_date: day, p_duration: shortest })
      .then(({ data }) => alive && setSlots((data as Slot[]) || []))
    return () => {
      alive = false
    }
  }, [business.slug, day, shortest, refresh])
  return slots
}

/** El día dibujado como una línea de tiempo: citas del tamaño de lo que duran, huecos libres y la hora actual */
export function DayTimeline({ day, isToday, list, slots, onOpen, onPick }: {
  day: string
  isToday: boolean
  list: Appointment[]
  slots: Slot[] | null
  onOpen: (a: Appointment) => void
  onPick: (time: string) => void
}) {
  const { business, link } = usePanel()
  const tz = business.timezone
  const [now, setNow] = useState(() => serverNow())
  const [showCancelled, setShowCancelled] = useState(false)

  // La raya de "ahora" baja sola cada minuto
  useEffect(() => {
    if (!isToday) return
    const id = window.setInterval(() => setNow(serverNow()), 60_000)
    return () => window.clearInterval(id)
  }, [isToday])

  const ofDay = useMemo(() => list.filter((a) => dateKey(a.starts_at, tz) === day), [list, day, tz])
  const blocks = useMemo(() => layoutDay(ofDay, tz), [ofDay, tz])
  const cancelled = ofDay.filter((a) => a.status === 'cancelada')

  if (!slots) return <TimelineSkeleton />

  const bounds = dayBounds(slots, blocks)
  if (!bounds) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-4 py-8 text-center">
        <p className="font-semibold text-slate-700">{isToday ? 'Hoy' : 'Este día'} no tienes horario abierto</p>
        <p className="mt-1 text-sm text-slate-500">
          Puedes añadir una cita igualmente o <Link to={link('horario')} className="font-semibold text-brand">cambiar tu horario</Link>.
        </p>
      </div>
    )
  }

  const free = freeRanges(slots, blocks)
  const height = (bounds.end - bounds.start) * PX
  const nowMin = minuteOf(new Date(now), tz)
  const showNow = isToday && nowMin >= bounds.start && nowMin <= bounds.end
  const hours: number[] = []
  for (let m = bounds.start; m <= bounds.end; m += 60) hours.push(m)

  return (
    <div>
      <div className="card relative overflow-hidden p-0">
        <div className="relative" style={{ height: height + 16 }}>
          <div className="absolute inset-x-0 top-2" style={{ height }}>
            {/* Lo que ya pasó, más apagado */}
            {isToday && nowMin > bounds.start && (
              <div className="absolute right-0 top-0 bg-slate-50" style={{ left: GUTTER, height: Math.min(nowMin - bounds.start, bounds.end - bounds.start) * PX }} />
            )}

            {hours.map((m) => (
              <div key={m} className="absolute inset-x-0 flex items-start" style={{ top: (m - bounds.start) * PX }}>
                <span className="-mt-2 shrink-0 pr-2 text-right text-[11px] font-semibold text-slate-400" style={{ width: GUTTER }}>
                  {m < bounds.end || m === 24 * 60 ? hourLabel(m % (24 * 60)) : ''}
                </span>
                <span className="mr-2 flex-1 border-t border-slate-100" />
              </div>
            ))}

            {free.map((r) => (
              <FreeBlock key={r.start} start={r.start} end={r.end} times={r.times} top={(r.start - bounds.start) * PX} onPick={onPick} />
            ))}

            {blocks.map((b) => (
              <Block key={b.a.id} b={b} top={(b.start - bounds.start) * PX} onOpen={onOpen} />
            ))}

            {showNow && (
              <div className="pointer-events-none absolute right-0 z-20 flex items-center" style={{ top: (nowMin - bounds.start) * PX - 1, left: GUTTER - 6 }}>
                <span className="h-2.5 w-2.5 rounded-full bg-red-500 shadow" />
                <span className="h-0.5 flex-1 bg-red-500" />
              </div>
            )}
          </div>
        </div>
      </div>

      {cancelled.length > 0 && (
        <div className="mt-2 text-center">
          <button onClick={() => setShowCancelled((v) => !v)} className="text-sm font-semibold text-slate-500">
            {showCancelled ? 'Ocultar' : 'Ver'} {cancelled.length === 1 ? '1 cancelada' : `${cancelled.length} canceladas`}
          </button>
          {showCancelled && (
            <div className="mt-2 space-y-2 text-left">
              {cancelled.map((a) => <AppointmentRow key={a.id} a={a} onClick={() => onOpen(a)} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Block({ b, top, onOpen }: { b: DayBlock; top: number; onOpen: (a: Appointment) => void }) {
  const { business, staff } = usePanel()
  const who = b.a.staff_id ? staff.find((s) => s.id === b.a.staff_id) : null
  const h = Math.max((b.end - b.start) * PX - 3, 30)
  const tall = h >= 54
  const wide = b.lanes === 1
  const style = STATUS_STYLE[b.a.status] || STATUS_STYLE.confirmada
  return (
    <button
      onClick={() => onOpen(b.a)}
      aria-label={`${time12(fromMin(b.start))} · ${b.a.customer_name}`}
      className={`ui-fade absolute z-10 flex overflow-hidden rounded-xl border-l-4 px-2.5 text-left shadow-sm transition hover:z-30 hover:shadow-md active:scale-[0.99] ${tall ? 'flex-col justify-center py-1.5' : 'items-center gap-1.5'} ${style}`}
      style={{
        top: top + 1,
        height: h,
        left: `calc(${GUTTER}px + (100% - ${GUTTER + 8}px) * ${b.lane / b.lanes})`,
        width: `calc((100% - ${GUTTER + 8}px) / ${b.lanes} - 4px)`,
      }}
    >
      <span className="flex w-full min-w-0 items-center gap-1.5">
        <span className={`min-w-0 flex-1 truncate text-sm font-bold ${b.a.status === 'no_asistio' ? 'line-through' : ''}`}>{b.a.customer_name}</span>
        {who && <Avatar name={who.name} photo={who.photo_url} />}
        {wide && <span className="shrink-0 text-xs font-semibold opacity-75">{money(b.a.total, business.currency)}</span>}
      </span>
      <span className={`block min-w-0 truncate text-xs opacity-80 ${tall ? 'w-full' : 'hidden'}`}>
        {time12(fromMin(b.start))} – {time12(fromMin(b.end % (24 * 60)))} · {servicesText(b.a)}
      </span>
      {b.a.status === 'pendiente' && tall && <span className="mt-0.5 text-[11px] font-bold uppercase tracking-wide">Por confirmar</span>}
    </button>
  )
}

function Avatar({ name, photo }: { name: string; photo: string | null }) {
  if (photo) return <img src={photo} alt={name} title={name} className="h-5 w-5 shrink-0 rounded-full object-cover ring-2 ring-white" />
  return (
    <span title={name} className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/70 text-[10px] font-bold ring-1 ring-slate-200">
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}

function FreeBlock({ start, end, times, top, onPick }: { start: number; end: number; times: string[]; top: number; onPick: (t: string) => void }) {
  const h = (end - start) * PX - 3
  // Hueco largo: las horas bajan a otra línea en vez de cortarse por el lado
  const tall = h >= 90
  return (
    <div
      className={`absolute flex overflow-hidden rounded-xl border-2 border-dashed border-slate-200 px-2.5 ${tall ? 'flex-col justify-center gap-2 py-2' : 'items-center gap-2'}`}
      style={{ top: top + 1, height: h, left: GUTTER, right: 8 }}
    >
      <button onClick={() => onPick(times[0])} className="flex shrink-0 items-center gap-1.5 text-sm font-bold text-emerald-700" aria-label={`Añadir cita a las ${time12(times[0])}`}>
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100"><Icon name="plus" className="h-3.5 w-3.5" /></span>
        Libre
      </button>
      <span className={`flex min-w-0 gap-1.5 ${tall ? 'flex-wrap' : 'no-scrollbar flex-1 overflow-x-auto'}`}>
        {times.map((t) => (
          <button key={t} onClick={() => onPick(t)} className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:ring-brand">
            {time12(t)}
          </button>
        ))}
      </span>
    </div>
  )
}

function TimelineSkeleton() {
  return (
    <div className="card space-y-3 p-4" aria-busy="true" aria-label="Cargando">
      {[70, 40, 90, 55].map((w, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="h-3 w-9 animate-pulse rounded bg-slate-100" />
          <span className="h-12 animate-pulse rounded-xl bg-slate-100" style={{ width: `${w}%` }} />
        </div>
      ))}
    </div>
  )
}

/** Ventana con el mensaje de los huecos libres, para el estado de WhatsApp o Instagram */
export function PublishFreeSlots({ when, slots, onClose }: { when: 'hoy' | 'mañana'; slots: Slot[]; onClose: () => void }) {
  const { business } = usePanel()
  const all = slots.filter((s) => s.available).map((s) => s.slot)
  const [picked, setPicked] = useState<string[]>(all)
  const times = all.filter((t) => picked.includes(t))
  const text = freeSlotsMessage(when, business.name, times, publicUrl(business.slug))
  const toggle = (t: string) => setPicked((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]))

  return (
    <Modal
      open
      onClose={onClose}
      title="Publicar mis huecos"
      footer={
        <div className="flex flex-wrap gap-2">
          <LinkButton href={shareLink(text)} variant="whatsapp" newTab className="flex-1">
            <WhatsAppIcon className="h-4 w-4" /> Enviar por WhatsApp
          </LinkButton>
          <CopyButton text={text} label="Copiar texto" />
        </div>
      }
    >
      {all.length === 0 ? (
        <p className="text-slate-600">{when === 'hoy' ? 'Hoy' : 'Mañana'} ya no te quedan huecos libres. ¡Día lleno! 🎉</p>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-semibold text-slate-600">Horas que quieres anunciar</p>
            <div className="flex flex-wrap gap-2">
              {all.map((t) => (
                <button
                  key={t}
                  onClick={() => toggle(t)}
                  className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${picked.includes(t) ? 'bg-brand text-white shadow' : 'bg-white text-slate-500 ring-1 ring-slate-300'}`}
                >
                  {time12(t)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-slate-600">Así queda el mensaje</p>
            <p className="whitespace-pre-line rounded-2xl rounded-tl-sm bg-emerald-50 p-3.5 text-sm text-emerald-900 ring-1 ring-emerald-200">{text}</p>
          </div>
          <p className="text-xs text-slate-500">
            Cópialo y pégalo en tu estado de WhatsApp o en Instagram, o mándalo a tus clientes por WhatsApp.
          </p>
        </div>
      )}
      {all.length === 0 && <Button block variant="secondary" className="mt-4" onClick={onClose}>Cerrar</Button>}
    </Modal>
  )
}
