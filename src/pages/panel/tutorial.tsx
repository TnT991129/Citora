// Tutorial guiado del panel: resalta en la pantalla real lo que explica, oscurece el resto y, en los
// pasos prácticos, pide tocar el botón de verdad (lo demás no se puede tocar). Mientras dura, Hoy
// enseña citas de ejemplo (demoDay): no se confirma, guarda ni envía nada de verdad.
//   target: qué se resalta (data-tour="...")   tap: hay que tocarlo para seguir
//   route: en qué pantalla tiene que estar     sheet: Hoy abre la hoja de ejemplo de "Nueva cita"
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { zonedToIso } from '../../lib/format'
import type { Slot } from '../../lib/dayPlan'
import type { Appointment, Service } from '../../lib/types'

export interface TourStep {
  kind?: 'intro' | 'final'
  route?: '' | 'negocio' | 'mas'
  target?: string
  tap?: boolean
  sheet?: 'nueva'
  emoji?: string
  title?: string
  text?: ReactNode
  doit?: ReactNode
}

/** Los pasos. En el móvil se habla del botón "+" y de "abajo"; en el ordenador, de "Nueva cita" y "a la izquierda". */
export function tourSteps(mobile: boolean, demoName: string): TourStep[] {
  const plus = mobile ? <>el botón <b>+</b></> : <><b>Nueva cita</b></>
  const where = mobile ? 'abajo' : 'a la izquierda'
  return [
    { kind: 'intro' },
    {
      route: '', target: 'resumen', emoji: '🏠', title: 'Esta es tu pantalla de Hoy',
      text: <>Cada vez que abras Citora empiezas aquí. Arriba ves <b>cuántas citas tienes hoy</b> y <b>cuánto dinero</b> vas a cobrar si vienen todos.</>,
    },
    {
      route: '', target: 'dia', emoji: '🕘', title: 'Tu día, hora por hora',
      text: <>Cada tarjeta de color es <b>un cliente</b>, del tamaño de lo que dura su cita. Los recuadros con <b>Libre</b> son huecos: nadie ha reservado a esa hora.</>,
    },
    {
      route: '', target: 'confirm', tap: true, emoji: '✅', title: 'Confirma las citas nuevas',
      text: <>Cuando alguien reserva desde tu enlace, la cita llega <b>"Por confirmar"</b>, en naranja. Confirmar es decirle al cliente: <i>"Sí, te espero"</i>.</>,
      doit: <>Toca <b>Confirmar</b> en la cita de {demoName}</>,
    },
    {
      route: '', target: 'fab', tap: true, emoji: '📞', title: '¿Te pidieron cita por WhatsApp o por teléfono?',
      text: <>Apúntala tú. Así ese hueco deja de estar libre y <b>nadie más puede reservarlo</b> a la misma hora.</>,
      doit: <>Toca {plus}</>,
    },
    {
      route: '', sheet: 'nueva', target: 'guardar', emoji: '✍️', title: 'Rellenas tres cosas y guardas',
      text: <><b>Quién</b> viene, <b>qué</b> se va a hacer y <b>qué día y a qué hora</b>. Al guardar, la cita aparece en tu día como cualquier otra.</>,
    },
    {
      route: '', target: 'nav-negocio', tap: true, emoji: '🔗', title: 'Ahora, lo más importante',
      text: <>Para que te lleguen reservas, tus clientes tienen que <b>conocer tu enlace</b>. Lo encuentras en "Mi negocio".</>,
      doit: <>Toca <b>Mi negocio</b>, {where}</>,
    },
    {
      route: 'negocio', target: 'compartir', tap: true, emoji: '📣', title: 'Este es tu enlace',
      text: <>Es como tu tienda en internet: quien lo abre ve tus servicios y <b>reserva solo</b>, sin tener que escribirte. Ponlo en tu estado de WhatsApp y en tu Instagram.</>,
      doit: <>Toca el botón verde <b>Compartir</b></>,
    },
    {
      route: 'negocio', target: 'nav-mas', tap: true, emoji: '🔔', title: 'Un último paso: los avisos',
      text: <>Para que tu móvil <b>suene cuando alguien reserve</b>, hay que activar los avisos. Están en "Más".</>,
      doit: <>Toca <b>Más</b>, {where}</>,
    },
    {
      route: 'mas', target: 'avisos', emoji: '🔔', title: 'Actívalos en "Ajustes y avisos"',
      text: <>Hazlo en <b>cada móvil</b> que uses. Sin los avisos, las reservas te llegan igual, pero <b>no te enteras</b> hasta que abres Citora.</>,
    },
    { kind: 'final' },
  ]
}

export const isMobileScreen = () => typeof window !== 'undefined' && window.innerWidth < 1024

/** El primer elemento visible con ese data-tour (en el móvil y en el ordenador puede haber dos) */
function findTarget(target: string): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`))
  return all.find((el) => {
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }) || null
}

interface Box { x: number; y: number; w: number; h: number }

export function GuidedTour({ steps, index, onNext, onPrev, onExit, onFinish }: {
  steps: TourStep[]
  index: number
  onNext: () => void
  onPrev: () => void
  onExit: () => void
  onFinish: () => void
}) {
  const step = steps[index]
  const total = steps.length - 2
  const [box, setBox] = useState<Box | null>(null)
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))

  // Sin animaciones de la página mientras dura (si no, el resaltado no coincide con el botón)
  useEffect(() => {
    document.body.classList.add('touring')
    return () => document.body.classList.remove('touring')
  }, [])

  // Mide lo que se resalta (y lo vuelve a medir si la pantalla se mueve o cambia de tamaño)
  useEffect(() => {
    setBox(null)
    if (step.kind || !step.target) return
    let scrolled = false
    const tick = () => {
      setVp((v) => (v.w === window.innerWidth && v.h === window.innerHeight ? v : { w: window.innerWidth, h: window.innerHeight }))
      const el = findTarget(step.target!)
      if (!el) return setBox(null)
      if (!scrolled) {
        scrolled = true
        // Lo que es más alto que media pantalla (el día entero) se enseña desde arriba
        const tall = el.getBoundingClientRect().height > window.innerHeight * 0.5
        el.scrollIntoView({ block: tall ? 'start' : 'center', inline: 'nearest' })
        // (sin quedar debajo de la barra de arriba)
        if (tall) window.scrollBy(0, -80)
      }
      const r = el.getBoundingClientRect()
      const pad = 6
      const top = Math.max(r.top, 0)
      const bottom = Math.min(r.bottom, window.innerHeight)
      const next = { x: r.left - pad, y: top - pad, w: r.width + pad * 2, h: Math.max(bottom - top, 0) + pad * 2 }
      setBox((b) => (b && Math.abs(b.x - next.x) < 1 && Math.abs(b.y - next.y) < 1 && Math.abs(b.w - next.w) < 1 && Math.abs(b.h - next.h) < 1 ? b : next))
    }
    tick()
    const id = window.setInterval(tick, 200)
    window.addEventListener('resize', tick)
    window.addEventListener('scroll', tick, true)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('resize', tick)
      window.removeEventListener('scroll', tick, true)
    }
  }, [step])

  // En los pasos prácticos: al tocar lo resaltado (su propia acción va antes), se pasa al siguiente
  useEffect(() => {
    if (!step.tap || !step.target) return
    const onClick = (e: MouseEvent) => {
      const t = e.target instanceof Element ? e.target.closest(`[data-tour="${step.target}"]`) : null
      if (t) window.setTimeout(onNext, 0)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [step, onNext])

  const doIt = () => findTarget(step.target || '')?.click()

  if (step.kind) {
    return createPortal(
      <div className="ui-fade fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 p-4">
        {step.kind === 'intro' ? <Intro onStart={onNext} onExit={onExit} /> : <Final onFinish={onFinish} />}
      </div>,
      document.body,
    )
  }

  const mobile = vp.w < 640
  const W = mobile ? vp.w - 24 : Math.min(380, vp.w - 24)
  const left = box ? Math.min(Math.max(box.x + box.w / 2 - W / 2, 12), vp.w - W - 12) : (vp.w - W) / 2
  const NEED = 260
  let pos: { top?: number; bottom?: number }
  let arrow: 'top' | 'bottom' | null = null
  if (box && vp.h - (box.y + box.h) >= NEED && vp.h - (box.y + box.h) >= box.y) {
    pos = { top: box.y + box.h + 14 }
    arrow = 'top'
  } else if (box && box.y >= NEED) {
    pos = { bottom: vp.h - box.y + 14 }
    arrow = 'bottom'
  } else {
    pos = { bottom: 12 }
  }
  const ax = box ? Math.min(Math.max(box.x + box.w / 2 - left, 24), W - 24) : 0

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[80]">
      {box ? (
        <>
          <div
            className="pointer-events-none absolute rounded-2xl ring-2 ring-white transition-all duration-300"
            style={{ left: box.x, top: box.y, width: box.w, height: box.h, boxShadow: '0 0 0 9999px rgb(15 23 42 / .62)' }}
          />
          {step.tap ? (
            <>
              <div className="pointer-events-none absolute animate-ping rounded-2xl ring-4 ring-white/70" style={{ left: box.x, top: box.y, width: box.w, height: box.h, animationDuration: '1.6s' }} />
              {/* Cuatro piezas alrededor del hueco: el resto no se puede tocar, lo resaltado sí */}
              {[
                [0, 0, vp.w, box.y],
                [0, box.y + box.h, vp.w, vp.h - box.y - box.h],
                [0, box.y, box.x, box.h],
                [box.x + box.w, box.y, vp.w - box.x - box.w, box.h],
              ].map(([l, t, w, h], i) => (w > 0 && h > 0 ? <div key={i} className="pointer-events-auto absolute" style={{ left: l, top: t, width: w, height: h }} /> : null))}
            </>
          ) : (
            <div className="pointer-events-auto absolute inset-0" />
          )}
        </>
      ) : (
        <div className="pointer-events-auto absolute inset-0 bg-slate-900/60" />
      )}

      <div
        key={index}
        className="ui-sheet pointer-events-auto absolute rounded-2xl bg-white p-4 shadow-2xl ring-1 ring-black/5"
        style={{ left, width: W, ...pos }}
        role="dialog"
        aria-label={step.title}
      >
        {arrow && <span className="absolute h-3.5 w-3.5 rotate-45 bg-white" style={{ left: ax - 7, [arrow]: -7 }} />}
        <div className="relative flex items-center gap-3">
          <span className="shrink-0 text-xs font-bold text-slate-400">Paso {index} de {total}</span>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
            <span className="block h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${(index / total) * 100}%` }} />
          </span>
          <button onClick={onExit} className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-slate-400 hover:bg-slate-100 hover:text-slate-600">Salir</button>
        </div>
        <div className="relative mt-3 flex gap-3">
          <span className="text-[28px] leading-none" aria-hidden>{step.emoji}</span>
          <div className="min-w-0">
            <p className="text-[17px] font-extrabold leading-snug text-slate-900">{step.title}</p>
            <p className="mt-1 text-[15px] leading-relaxed text-slate-600">{step.text}</p>
          </div>
        </div>
        {step.tap && (
          <div className="relative mt-3 flex items-center gap-2.5 rounded-xl bg-brand/10 px-3 py-2.5 text-[15px] text-brand">
            <span className="text-xl leading-none" aria-hidden>👆</span>
            <span className="flex-1">{step.doit}</span>
          </div>
        )}
        <div className="relative mt-3 flex min-h-[40px] items-center justify-between gap-3">
          {index > 1 ? (
            <button onClick={onPrev} className="rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-500 hover:bg-slate-100">← Atrás</button>
          ) : <span />}
          {step.tap ? (
            <button onClick={doIt} className="rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-400 underline-offset-2 hover:underline">Hazlo por mí</button>
          ) : (
            <button onClick={onNext} className="rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white shadow-sm shadow-brand/30">Siguiente →</button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Num({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/10 text-sm font-bold text-brand">{n}</span>
      <span className="pt-0.5 text-[15px] text-slate-700">{children}</span>
    </li>
  )
}

function Check({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12l5 5 9-10" /></svg>
      </span>
      <span className="text-[15px] text-slate-700">{children}</span>
    </li>
  )
}

function Intro({ onStart, onExit }: { onStart: () => void; onExit: () => void }) {
  return (
    <div className="ui-sheet w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl" role="dialog" aria-label="Tutorial">
      <p className="text-4xl" aria-hidden>👋</p>
      <h2 className="mt-3 text-[22px] font-extrabold leading-tight tracking-tight">Te enseñamos a usar tu panel</h2>
      <p className="mt-1.5 text-[15px] leading-relaxed text-slate-600">Te llevamos de la mano, pantalla por pantalla. Vas a aprender a:</p>
      <ol className="mt-4 space-y-2.5">
        <Num n={1}>Ver tus citas del día</Num>
        <Num n={2}>Confirmar una cita nueva</Num>
        <Num n={3}>Apuntar una cita que te pidieron por WhatsApp</Num>
        <Num n={4}>Compartir tu enlace para que te reserven</Num>
      </ol>
      <p className="mt-5 rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-500">
        Usamos <b>citas de ejemplo</b>: no se envía nada a nadie. Son unos 2 minutos y puedes salir cuando quieras.
      </p>
      <div className="mt-5 space-y-1.5">
        <button onClick={onStart} className="w-full rounded-btn bg-brand bg-btn-grad px-5 py-3.5 font-semibold text-white shadow-md shadow-brand/25">Empezar</button>
        <button onClick={onExit} className="w-full rounded-xl py-2.5 text-[15px] font-semibold text-slate-500 hover:bg-slate-50">Ahora no</button>
      </div>
    </div>
  )
}

function Final({ onFinish }: { onFinish: () => void }) {
  const mobile = isMobileScreen()
  return (
    <div className="ui-sheet w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl" role="dialog" aria-label="Tutorial terminado">
      <p className="text-4xl" aria-hidden>🎉</p>
      <h2 className="mt-3 text-[22px] font-extrabold leading-tight tracking-tight">¡Ya sabes lo básico!</h2>
      <p className="mt-1.5 text-[15px] text-slate-600">Esto es lo que aprendiste:</p>
      <ul className="mt-4 space-y-3">
        <Check>En <b>Hoy</b> ves tus citas del día.</Check>
        <Check><b>Confirmar</b> es decirle al cliente que lo esperas.</Check>
        <Check>Con {mobile ? <>el botón <b>+</b></> : <b>Nueva cita</b>} apuntas las citas que te piden por WhatsApp.</Check>
        <Check>Tu <b>enlace</b> está en <b>Mi negocio</b>: compártelo para recibir reservas.</Check>
      </ul>
      <p className="mt-5 rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-500">
        ¿Se te olvidó algo? Repite el tutorial cuando quieras en <b>Más → Tutorial paso a paso</b>.
      </p>
      <button onClick={onFinish} className="mt-5 w-full rounded-btn bg-brand bg-btn-grad px-5 py-3.5 font-semibold text-white shadow-md shadow-brand/25">Empezar a usar Citora</button>
    </div>
  )
}

// ---------------------------------------------------------------------
// Día de ejemplo para el tutorial (nunca se guarda)
// ---------------------------------------------------------------------
export const DEMO_PENDING_NAME = 'Mailén'

const DEMO = [
  { id: 'demo-1', name: 'Laura Pérez', at: '09:00', min: 60, status: 'confirmada' },
  { id: 'demo-2', name: 'Claudia Díaz', at: '10:30', min: 90, status: 'confirmada' },
  { id: 'demo-3', name: `${DEMO_PENDING_NAME} Rodríguez`, at: '15:00', min: 60, status: 'pendiente' },
  { id: 'demo-4', name: 'Rosa Martínez', at: '16:30', min: 45, status: 'confirmada' },
] as const

export function demoDay(day: string, tz: string, services: Service[], businessId: string): Appointment[] {
  const main = services.filter((s) => s.active && !s.is_extra)
  return DEMO.map((d, i) => {
    const s = main[i % Math.max(main.length, 1)]
    const starts = zonedToIso(day, d.at, tz)
    return {
      id: d.id,
      business_id: businessId,
      token: d.id,
      starts_at: starts,
      ends_at: new Date(new Date(starts).getTime() + d.min * 60000).toISOString(),
      customer_name: d.name,
      customer_phone: '',
      customer_note: null,
      total: s ? Number(s.price) : 1500,
      usd_rate: null,
      status: d.status,
      source: 'web',
      cancelled_by: null,
      reschedule_count: 0,
      internal_note: null,
      created_at: starts,
      discount_code: null,
      discount: 0,
      reminded_at: null,
      staff_id: null,
      appointment_services: [{ name: s?.name || 'Servicio', price: s ? Number(s.price) : 1500, duration_min: d.min }],
    } as Appointment
  })
}

/** Huecos de 9:00 a 18:00 cada 30 minutos, libres si no hay una cita de ejemplo */
export function demoSlots(): Slot[] {
  const busy = DEMO.map((d) => {
    const [h, m] = d.at.split(':').map(Number)
    return [h * 60 + m, h * 60 + m + d.min]
  })
  const out: Slot[] = []
  for (let t = 9 * 60; t < 18 * 60; t += 30) {
    const slot = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
    out.push({ slot, available: !busy.some(([a, b]) => t < b && t + 30 > a) } as Slot)
  }
  return out
}
