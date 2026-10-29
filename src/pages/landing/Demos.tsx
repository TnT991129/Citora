// Pantallas de ejemplo de la portada, hechas con código (sin imágenes que descargar): el móvil que
// se reserva solo, las tres pantallas de "Cómo funciona" y los dibujos del mosaico de funciones.
import { useEffect, useState, type ReactNode } from 'react'
import { prefersReducedMotion, useInView } from './motion'

const ICONS: Record<string, string> = {
  check: 'M5 12l5 5 9-10',
  bell: 'M6 8a6 6 0 0112 0c0 7 3 8 3 8H3s3-1 3-8M10.3 20a2 2 0 003.4 0',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  up: 'M7 17L17 7M9 7h8v8',
  moon: 'M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z',
  users: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8',
  image: 'M4 5h16v14H4zM4 15l4-4 5 5M14 13l2-2 4 4M15 9h.01',
  ticket: 'M3 8a2 2 0 002-2h14a2 2 0 002 2v2a2 2 0 000 4v2a2 2 0 00-2 2H5a2 2 0 00-2-2v-2a2 2 0 000-4zM14 6v12',
  card: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  star: 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z',
  whatsapp: 'M3 21l1.7-4.6A8.5 8.5 0 1112 20.5a8.4 8.4 0 01-4.3-1.2zM9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.5-2-1-1 1c-1.2-.4-2.6-1.8-3-3l1-1-1-2z',
  instagram: 'M7 3h10a4 4 0 014 4v10a4 4 0 01-4 4H7a4 4 0 01-4-4V7a4 4 0 014-4zM12 16a4 4 0 100-8 4 4 0 000 8zM17.5 6.5h.01',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  wifi: 'M2 9a15 15 0 0120 0M5 12.5a10 10 0 0114 0M8.5 16a5 5 0 017 0M12 19.5h.01',
  phone: 'M7 2h10a1 1 0 011 1v18a1 1 0 01-1 1H7a1 1 0 01-1-1V3a1 1 0 011-1zM11 18h2',
  x: 'M6 6l12 12M18 6L6 18',
}

export function Ico({ name, className = 'h-5 w-5', fill = false }: { name: string; className?: string; fill?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICONS[name]} />
    </svg>
  )
}

/** Marco de móvil */
export function Phone({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative w-[258px] rounded-[2.7rem] bg-[#0b0b12] p-[9px] shadow-[0_50px_100px_-30px_rgba(0,0,0,0.7)] ring-1 ring-white/10 sm:w-[278px] ${className}`}>
      <div className="relative h-[530px] overflow-hidden rounded-[2.15rem] bg-white text-slate-900 sm:h-[560px]">
        <div className="absolute left-1/2 top-2.5 z-20 h-[22px] w-[90px] -translate-x-1/2 rounded-full bg-[#0b0b12]" />
        {children}
      </div>
    </div>
  )
}

function MiniHeader({ name = 'Nails Studio', sub = 'Reserva tu cita', color = 'bg-pink-500' }: { name?: string; sub?: string; color?: string }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 pb-3 pt-10">
      <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${color} text-sm font-extrabold text-white`}>{name.charAt(0)}</span>
      <span className="leading-tight">
        <span className="block text-sm font-bold">{name}</span>
        <span className="block text-[11px] text-slate-500">{sub}</span>
      </span>
    </div>
  )
}

const DEMO_SERVICES = [
  ['Manicura', '1.500 CUP', '1 h'],
  ['Pedicura', '1.800 CUP', '1 h'],
  ['Uñas acrílicas', '3.500 CUP', '2 h'],
]
const DEMO_TIMES = ['9:00 a.m.', '10:30 a.m.', '1:00 p.m.', '3:00 p.m.', '4:30 p.m.', '6:00 p.m.']
// Cuánto dura cada momento de la demostración (ms): lista, servicio elegido, hora, confirmando, reservada
const STEP_MS = [1300, 1200, 1500, 900, 2800]

/** Móvil de la portada: un cliente reserva solo, en bucle (se para cuando no se ve) */
export function HeroPhone() {
  const { ref, inView } = useInView<HTMLDivElement>()
  const reduced = prefersReducedMotion()
  const [step, setStep] = useState(reduced ? 2 : 0)

  useEffect(() => {
    if (!inView || reduced) return
    const t = setTimeout(() => setStep((s) => (s + 1) % STEP_MS.length), STEP_MS[step])
    return () => clearTimeout(t)
  }, [step, inView, reduced])

  const done = step === 4
  return (
    <div ref={ref} className="relative mx-auto flex justify-center">
      <Phone>
        <MiniHeader />
        {!done ? (
          <div className="space-y-2.5 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-pink-500">{step < 2 ? 'Paso 1 · Servicio' : 'Paso 2 · Día y hora'}</p>
            {step < 2 ? (
              DEMO_SERVICES.map(([n, p, d], i) => {
                const on = step === 1 && i === 0
                return (
                  <div key={n} className={`flex items-center gap-3 rounded-2xl border px-3 py-3 transition duration-300 ${on ? 'lp-press border-pink-400 bg-pink-50 shadow-md shadow-pink-500/10' : 'border-slate-200 bg-white'}`}>
                    <span className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition ${on ? 'border-pink-500 bg-pink-500 text-white' : 'border-slate-300'}`}>
                      {on && <Ico name="check" className="h-3.5 w-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block text-sm font-semibold">{n}</span>
                      <span className="block text-[11px] text-slate-500">{d}</span>
                    </span>
                    <span className={`text-sm font-bold ${on ? 'text-pink-600' : ''}`}>{p}</span>
                  </div>
                )
              })
            ) : (
              <>
                <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-slate-400">
                  {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d, i) => (
                    <span key={i} className={`rounded-lg py-1.5 ${i === 3 ? 'bg-pink-500 text-white shadow' : i === 6 ? 'line-through opacity-50' : 'bg-slate-100 text-slate-600'}`}>
                      {d}
                      <span className="block text-[11px]">{12 + i}</span>
                    </span>
                  ))}
                </div>
                <p className="pt-1 text-xs font-semibold text-slate-500">Jueves 15 · horas libres</p>
                <div className="grid grid-cols-2 gap-2">
                  {DEMO_TIMES.map((t, i) => {
                    const on = step >= 2 && t === '3:00 p.m.'
                    return (
                      <span key={t} className={`rounded-xl py-2.5 text-center text-xs font-semibold transition duration-300 ${on ? 'lp-press bg-pink-500 text-white shadow-md shadow-pink-500/30' : i === 1 ? 'bg-slate-100 text-slate-300 line-through' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}>
                        {t}
                      </span>
                    )
                  })}
                </div>
              </>
            )}
            <div className={`absolute inset-x-4 bottom-5 rounded-2xl py-3.5 text-center text-sm font-bold text-white shadow-lg shadow-pink-500/30 transition ${step === 3 ? 'lp-press bg-pink-600' : 'bg-pink-500'}`}>
              {step === 3 ? 'Confirmando…' : step < 2 ? 'Continuar · 1.500 CUP' : 'Confirmar reserva'}
            </div>
          </div>
        ) : (
          <div className="lp-pop flex h-[calc(100%-73px)] flex-col items-center justify-center px-6 text-center">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <Ico name="check" className="h-10 w-10" />
            </span>
            <p className="mt-5 text-xl font-extrabold">¡Cita reservada!</p>
            <p className="mt-1 text-sm text-slate-500">Manicura · Jueves 15 · 3:00 p.m.</p>
            <div className="mt-6 w-full space-y-2 rounded-2xl bg-slate-50 p-3 text-left text-xs text-slate-600">
              <p className="flex items-center gap-2"><Ico name="bell" className="h-4 w-4 text-pink-500" /> Te recordamos la cita el día antes</p>
              <p className="flex items-center gap-2"><Ico name="link" className="h-4 w-4 text-pink-500" /> Cámbiala o cancélala con tu enlace</p>
            </div>
          </div>
        )}
      </Phone>

      {/* Lo que pasa a la vez en el móvil del dueño */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -left-4 top-24 sm:-left-28">
          {done && (
            <div key={`n${step}`} className="lp-pop w-56 rounded-2xl bg-white/95 p-3 text-left text-slate-900 shadow-2xl ring-1 ring-black/5 backdrop-blur">
              <p className="flex items-center gap-2 text-[11px] font-semibold text-slate-500">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-br from-rose-400 to-orange-400 text-white"><Ico name="bell" className="h-3 w-3" /></span>
                Citora · ahora
              </p>
              <p className="mt-1.5 text-sm font-bold">Nueva cita: Carla M.</p>
              <p className="text-xs text-slate-500">Manicura · Jue 15 · 3:00 p.m.</p>
            </div>
          )}
        </div>
        <div className="lp-float absolute -right-3 top-12 hidden sm:-right-24 sm:block" style={{ ['--d' as string]: '-2s', ['--r' as string]: '3deg' }}>
          <div className="rounded-2xl bg-white/95 px-4 py-3 text-slate-900 shadow-2xl ring-1 ring-black/5">
            <p className="text-[11px] font-semibold text-slate-500">Ingresos de hoy</p>
            <p className="flex items-center gap-1 text-lg font-extrabold">12.400 CUP <Ico name="up" className="h-4 w-4 text-emerald-500" /></p>
          </div>
        </div>
        <div className="lp-float absolute -right-2 bottom-24 sm:-right-20" style={{ ['--d' as string]: '-4s', ['--r' as string]: '-3deg' }}>
          <div className="flex items-center gap-2 rounded-full bg-white/95 px-3.5 py-2 text-xs font-bold text-slate-900 shadow-2xl ring-1 ring-black/5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white"><Ico name="check" className="h-3 w-3" /></span>
            Recordatorio enviado
          </div>
        </div>
        <div className="lp-float absolute -left-3 bottom-10 hidden sm:-left-24 sm:block" style={{ ['--d' as string]: '-1s', ['--r' as string]: '2deg' }}>
          <div className="rounded-2xl bg-white/95 px-3.5 py-2.5 text-slate-900 shadow-2xl ring-1 ring-black/5">
            <p className="flex gap-0.5 text-amber-400">{[0, 1, 2, 3, 4].map((i) => <Ico key={i} name="star" className="h-3.5 w-3.5" fill />)}</p>
            <p className="mt-1 text-xs font-semibold">"¡Me encantó, vuelvo seguro!"</p>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------------- Cómo funciona: las tres pantallas ---------------- */

export function ScreenCreate() {
  return (
    <div className="h-full bg-slate-50 px-4 pt-10">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-rose-500">Crea tu app</p>
      <p className="mt-1 text-lg font-extrabold leading-tight">¿Qué tipo de negocio tienes?</p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-semibold">
        {['Barbería', 'Uñas', 'Peluquería', 'Spa', 'Cejas', 'Tatuajes'].map((t, i) => (
          <span key={t} className={`rounded-xl px-3 py-2.5 ${i === 0 ? 'bg-rose-500 text-white shadow-md shadow-rose-500/30' : 'bg-white ring-1 ring-slate-200'}`}>{t}</span>
        ))}
      </div>
      <div className="mt-4 space-y-2">
        <div className="rounded-xl bg-white px-3 py-2.5 text-xs ring-1 ring-slate-200"><span className="block text-[10px] text-slate-400">Nombre</span><b>Barbería Leo</b></div>
        <div className="rounded-xl bg-white px-3 py-2.5 text-xs ring-1 ring-slate-200"><span className="block text-[10px] text-slate-400">Tu enlace</span><b>…/barberia-leo</b></div>
        <div className="flex gap-2 pt-1">
          {['bg-rose-500', 'bg-sky-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500'].map((c, i) => (
            <span key={c} className={`h-7 w-7 rounded-full ${c} ${i === 1 ? 'ring-2 ring-slate-900 ring-offset-2' : ''}`} />
          ))}
        </div>
      </div>
      <div className="absolute inset-x-4 bottom-5 rounded-2xl bg-gradient-to-r from-rose-400 to-orange-400 py-3 text-center text-sm font-bold text-white">Crear mi app</div>
    </div>
  )
}

export function ScreenShare() {
  return (
    <div className="flex h-full flex-col bg-[#efeae2] pt-10">
      <div className="flex items-center gap-2 bg-[#075e54] px-3 py-2.5 text-white">
        <span className="h-7 w-7 rounded-full bg-white/30" />
        <span className="text-xs font-semibold">Mis estados</span>
      </div>
      <div className="flex-1 space-y-2 p-3">
        <div className="ml-auto max-w-[85%] rounded-xl rounded-tr-sm bg-[#d9fdd3] p-2 text-xs shadow-sm">
          <div className="overflow-hidden rounded-lg bg-white">
            <div className="flex h-16 items-center justify-center bg-gradient-to-br from-sky-500 to-indigo-500 text-xl font-extrabold text-white">B</div>
            <p className="px-2 pt-1.5 font-bold">Barbería Leo</p>
            <p className="px-2 pb-2 text-[10px] text-slate-500">Reserva tu cita en segundos</p>
          </div>
          <p className="mt-1.5">¡Ya pueden reservar solos! 💈 Toca aquí para reservar</p>
        </div>
        <div className="flex justify-center gap-3 pt-3">
          {[['whatsapp', 'bg-[#25d366]'], ['instagram', 'bg-gradient-to-br from-fuchsia-500 to-orange-400'], ['link', 'bg-slate-800']].map(([i, c]) => (
            <span key={i} className={`flex h-11 w-11 items-center justify-center rounded-full ${c} text-white shadow-lg`}><Ico name={i} /></span>
          ))}
        </div>
        <p className="text-center text-[11px] font-semibold text-slate-600">Compártelo donde ya están tus clientes</p>
      </div>
    </div>
  )
}

const AGENDA = [
  ['9:00', 'Carlos R.', 'Corte', 'confirmada'],
  ['10:00', 'Miguel A.', 'Corte y barba', 'confirmada'],
  ['11:30', 'Yoan P.', 'Barba', 'nueva'],
  ['1:00', 'Raúl D.', 'Corte', 'confirmada'],
  ['3:00', 'Ernesto L.', 'Corte', 'nueva'],
]
export function ScreenAgenda() {
  return (
    <div className="h-full bg-slate-50 px-4 pt-10">
      <div className="flex items-baseline justify-between">
        <p className="text-lg font-extrabold">Hoy</p>
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">5 citas · 3.900 CUP</span>
      </div>
      <div className="mt-3 space-y-2">
        {AGENDA.map(([h, n, s, st]) => (
          <div key={h} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2.5 ring-1 ring-slate-200">
            <span className="w-10 text-xs font-bold text-slate-500">{h}</span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-sm font-semibold">{n}</span>
              <span className="block text-[11px] text-slate-500">{s}</span>
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${st === 'nueva' ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-700'}`}>{st === 'nueva' ? 'Nueva' : '✓'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------------- Antes y después ---------------- */

const CHAOS = [
  ['¿Tienes hueco mañana?', '9:12 p.m.'],
  ['¿Y a las 3?', '9:40 p.m.'],
  ['Holaaa?? 🙏', '10:05 p.m.'],
  ['Bueno, mejor busco en otro lado', '11:20 p.m.'],
]
export function ChatChaos() {
  return (
    <div className="space-y-2">
      {CHAOS.map(([t, h], i) => (
        <div key={t} className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-3.5 py-2 text-sm text-slate-800 shadow-sm ring-1 ring-slate-200" style={{ marginLeft: `${(i % 2) * 18}px` }}>
          {t}
          <span className="ml-2 text-[10px] text-slate-400">{h}</span>
        </div>
      ))}
      <p className="flex items-center gap-2 pt-1 text-xs font-semibold text-rose-600">
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] text-white">27</span>
        mensajes sin contestar
      </p>
    </div>
  )
}

export function AgendaClean() {
  return (
    <div className="space-y-2">
      {AGENDA.slice(0, 4).map(([h, n, s]) => (
        <div key={h} className="flex items-center gap-3 rounded-2xl bg-white px-3.5 py-2.5 shadow-sm ring-1 ring-slate-200">
          <span className="w-10 text-xs font-bold text-slate-500">{h}</span>
          <span className="min-w-0 flex-1 text-sm"><b>{n}</b> <span className="text-slate-500">· {s}</span></span>
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white"><Ico name="check" className="h-3 w-3" /></span>
        </div>
      ))}
      <p className="flex items-center gap-2 pt-1 text-xs font-semibold text-emerald-700">
        <Ico name="moon" className="h-4 w-4" /> 3 citas se reservaron mientras dormías
      </p>
    </div>
  )
}

/* ---------------- Dibujos del mosaico de funciones ---------------- */

export function BarsArt() {
  const bars = [35, 55, 40, 70, 60, 90, 75]
  return (
    <div className="flex h-24 items-end gap-1.5">
      {bars.map((h, i) => (
        <span key={i} className="lp-bar flex-1 rounded-t-md bg-gradient-to-t from-rose-400 to-orange-300" style={{ height: `${h}%`, ['--i' as string]: i }} />
      ))}
    </div>
  )
}

export function StarsArt() {
  return (
    <div className="flex gap-1 text-amber-400">
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className="lp-star" style={{ ['--i' as string]: i }}><Ico name="star" className="h-7 w-7" fill /></span>
      ))}
    </div>
  )
}

export function NightArt() {
  return (
    <div className="relative">
      <p className="text-5xl font-extrabold tracking-tight text-white sm:text-6xl">3:17<span className="text-2xl text-white/50"> a.m.</span></p>
      <div className="mt-4 inline-flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/15 backdrop-blur">
        <span className="lp-ring flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-rose-400 to-orange-400 text-white"><Ico name="bell" /></span>
        <span className="text-left leading-tight">
          <span className="block text-sm font-bold text-white">Nueva reserva</span>
          <span className="block text-xs text-white/60">Mientras tú dormías</span>
        </span>
      </div>
    </div>
  )
}
