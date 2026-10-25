import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ThemeToggle } from '../components/ThemeToggle'
import { CitoraLogo } from '../components/ui'
import { setBrandColor } from '../lib/brand'
import { money } from '../lib/format'
import { DEFAULT_PRICE, INCLUDED, MODULES } from '../lib/plans'
import { Icon } from './panel/Panel'
import { supabase } from '../lib/supabase'
import { BUSINESS_TYPES } from '../lib/templates'
import type { Prices } from '../lib/types'

const NAV = [
  { href: '#como-funciona', label: 'Cómo funciona' },
  { href: '#beneficios', label: 'Beneficios' },
  { href: '#para-quien', label: 'Para quién' },
  { href: '#planes', label: 'Precio' },
  { href: '#preguntas', label: 'Preguntas' },
]

export default function Landing() {
  const [prices, setPrices] = useState<Prices>({ basico: DEFAULT_PRICE, plus: DEFAULT_PRICE, ultra: DEFAULT_PRICE, trial_days: 3 })
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    setBrandColor(null)
    document.title = 'Citora · La app de reservas de tu negocio'
    supabase.rpc('get_public_prices').then(({ data }) => data && setPrices(data as Prices))
  }, [])

  const trial = prices.trial_days ?? 3

  return (
    <div className="min-h-dvh bg-white text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <CitoraLogo className="text-xl" />
          <nav className="hidden items-center gap-1 lg:flex">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900">
                {n.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <div className="hidden sm:block"><ThemeToggle /></div>
            <Link to="/entrar" className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 sm:block">Entrar</Link>
            <Link to="/crear" className="rounded-xl bg-gradient-to-br from-rose-400 to-orange-400 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-105">
              Crear mi app
            </Link>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Abrir menú"
              className="rounded-lg p-2 text-slate-700 hover:bg-slate-100 lg:hidden"
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
              </svg>
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav className="border-t border-slate-100 bg-white px-4 py-3 lg:hidden">
            <div className="flex flex-col gap-1">
              {NAV.map((n) => (
                <a key={n.href} href={n.href} onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                  {n.label}
                </a>
              ))}
              <Link to="/entrar" onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 sm:hidden">
                Entrar a mi panel
              </Link>
              <div className="px-3 pt-1 sm:hidden"><ThemeToggle /></div>
            </div>
          </nav>
        )}
      </header>

      {/* Portada */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-citora-50 via-white to-white" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 -z-10 h-80 w-80 rounded-full bg-citora-200/50 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -left-20 top-40 -z-10 h-64 w-64 rounded-full bg-citora-100 blur-3xl" />
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-12 md:grid-cols-2 md:pt-20">
          <div>
            <span className="chip bg-citora-100 text-citora-800">🎁 {trial} días gratis · sin tarjeta</span>
            <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight text-slate-900 md:text-5xl">
              Deja de perder clientes por no contestar a tiempo
            </h1>
            <p className="mt-4 text-lg text-slate-600">
              Citora es la app de reservas de tu negocio: tus clientes reservan solos, a cualquier hora, desde el móvil.
              Tú recibes un aviso, llevas tu agenda ordenada y nunca más se te cruzan dos citas.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link to="/crear" className="rounded-2xl bg-gradient-to-br from-rose-400 to-orange-400 px-6 py-4 text-center text-base font-bold text-white shadow-lg shadow-citora-400/30 hover:brightness-105">
                Crear mi app gratis
              </Link>
              <a href="#como-funciona" className="rounded-2xl border border-slate-300 px-6 py-4 text-center text-base font-semibold text-slate-800 hover:bg-slate-50">
                Ver cómo funciona
              </a>
            </div>
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500">
              <span className="flex items-center gap-1.5"><Check /> Sin tarjeta de crédito</span>
              <span className="flex items-center gap-1.5"><Check /> Cancela cuando quieras</span>
              <span className="flex items-center gap-1.5"><Check /> Listo en minutos</span>
            </div>
          </div>
          <PhoneMock />
        </div>
      </section>

      {/* El problema */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight">¿Te suena familiar?</h2>
          <p className="mt-2 text-slate-600">Así pierde dinero un negocio que lleva sus citas a mano, por mensajes o por memoria.</p>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {[
            ['📵', 'El teléfono no para', 'Cada cliente te escribe a preguntar si tienes hueco libre, y mientras respondes uno, se te escapan otros dos.'],
            ['🤯', 'Citas que se cruzan', 'Apuntaste a dos clientes a la misma hora sin darte cuenta, y ahora alguien se va a quedar esperando.'],
            ['👻', 'Clientes que no llegan', 'Reservan y no avisan que no vienen. Pierdes esa hora y no te enteras hasta que ya es tarde.'],
            ['❓', 'No sabes cuánto ganaste', 'A fin de mes tienes que sumar a mano, o ni siquiera lo sabes con certeza.'],
          ].map(([e, t, d]) => (
            <div key={t} className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <span className="text-3xl">{e}</span>
              <div>
                <h3 className="font-bold text-slate-900">{t}</h3>
                <p className="mt-1 text-sm text-slate-600">{d}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-8 text-center text-lg font-semibold text-citora-700">Con Citora, nada de eso vuelve a pasar. →</p>
      </section>

      {/* Cómo funciona */}
      <section id="como-funciona" className="scroll-mt-16 bg-slate-50 py-14">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-extrabold tracking-tight">Así de fácil</h2>
          <p className="mt-2 text-center text-slate-600">De cero a recibiendo reservas, el mismo día.</p>
          <div className="mt-10 grid gap-8 md:grid-cols-3 md:gap-4">
            {[
              ['1', 'Crea tu app', 'Elige tu tipo de negocio, pon tu nombre, tus servicios, precios y horarios. Sin saber de tecnología.'],
              ['2', 'Comparte tu enlace', 'Ponlo en tu Instagram, WhatsApp o estado. Tus clientes reservan solos desde ahí, a cualquier hora.'],
              ['3', 'Gestiona tu agenda', 'Ves tus citas del día, confirmas con un toque y avisas por WhatsApp sin escribir nada.'],
            ].map(([n, t, d], i) => (
              <div key={n} className="relative">
                {i < 2 && <div className="absolute left-5 top-11 hidden h-0.5 w-full bg-citora-200 md:block" aria-hidden="true" />}
                <div className="card relative">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-citora-600 text-lg font-bold text-white">{n}</div>
                  <h3 className="mt-3 text-lg font-bold">{t}</h3>
                  <p className="mt-1 text-slate-600">{d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Beneficios */}
      <section id="beneficios" className="scroll-mt-16 mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-center text-3xl font-extrabold tracking-tight">Todo lo que necesita tu negocio</h2>
        <p className="mt-2 text-center text-slate-600">Un solo plan, todo incluido — nada de módulos escondidos ni cobros sorpresa.</p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ['calendar', 'Reservas 24/7', 'Tus clientes reservan a cualquier hora, hasta de madrugada, sin que tengas que estar pendiente.'],
            ['clock', 'Menos ausencias', 'Recordatorios automáticos por el día anterior para que tus clientes no se olviden de venir.'],
            ['users', 'Ficha de cada cliente', 'Cuántas veces vino, cuánto ha gastado y notas tuyas sobre cada uno, siempre a mano.'],
            ['chart', 'Tus números claros', 'Cuánto cobraste, cuánto gastaste y qué servicio se vende más, sin sumar nada a mano.'],
            ['star', 'Opiniones de verdad', 'Tus clientes dejan su opinión después de la cita; tú respondes y construyes confianza.'],
            ['image', 'Muestra tus trabajos', 'Una galería de fotos en tu web para que el cliente vea lo que haces antes de reservar.'],
            ['card', 'Cupones de descuento', 'Crea promociones y compártelas con tus clientes para que vuelvan más seguido.'],
            ['grid', 'Varios profesionales', 'Si trabajas con más gente, cada quien tiene su propia agenda dentro de la misma app.'],
            ['gear', 'A tu manera', 'Tu logo, tus colores, tus políticas de cancelación: tu negocio, no una plantilla genérica.'],
          ].map(([icon, t, d]) => (
            <div key={t} className="card">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-citora-100 text-citora-700">
                <Icon name={icon} className="h-6 w-6" />
              </div>
              <h3 className="mt-3 font-bold">{t}</h3>
              <p className="mt-1 text-sm text-slate-600">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Para quién */}
      <section id="para-quien" className="scroll-mt-16 bg-slate-50 py-14">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-extrabold tracking-tight">Para negocios que trabajan con citas</h2>
          <p className="mt-2 text-center text-slate-600">Si tus clientes necesitan un turno para atenderse, Citora es para ti.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {BUSINESS_TYPES.filter((t) => t.key !== 'otro').map((t) => (
              <span key={t.key} className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:ring-citora-300">
                {t.emoji} {t.name}
              </span>
            ))}
            <span className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200">✨ y muchos más</span>
          </div>
        </div>
      </section>

      {/* Precio: un solo plan con todo incluido */}
      <section id="planes" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-14">
        <h2 className="text-center text-3xl font-extrabold tracking-tight">Un solo precio, todo incluido</h2>
        <p className="mt-2 text-center text-slate-600">Prueba todo gratis durante {trial} días. Si te gusta, sigues por una mensualidad.</p>
        <div className="card relative mx-auto mt-8 max-w-md overflow-hidden ring-2 ring-citora-600">
          <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-citora-100" />
          <div className="relative flex items-center justify-between">
            <h3 className="text-xl font-extrabold">Plan Citora</h3>
            <span className="chip bg-citora-600 text-white">Todo incluido</span>
          </div>
          <p className="relative mt-2">
            <span className="text-4xl font-extrabold">{money(prices.basico, 'CUP')}</span>
            <span className="text-slate-500"> /mes</span>
          </p>
          <ul className="relative mt-4 grid gap-1.5 text-sm sm:grid-cols-2">
            {INCLUDED.map((m) => (
              <li key={m} className="flex items-start gap-2">
                <span className="mt-0.5 text-citora-600"><Check /></span>
                <span>{MODULES[m].name}</span>
              </li>
            ))}
            <li className="flex items-start gap-2"><span className="mt-0.5 text-citora-600"><Check /></span><span>App instalable en el móvil</span></li>
            <li className="flex items-start gap-2"><span className="mt-0.5 text-citora-600"><Check /></span><span>Tu enlace, tus colores y tu logo</span></li>
          </ul>
          <Link to="/crear" className="relative mt-6 block rounded-2xl bg-gradient-to-br from-rose-400 to-orange-400 py-3.5 text-center font-bold text-white hover:brightness-105">
            Probar {trial} días gratis
          </Link>
        </div>
        <p className="mt-4 text-center text-sm text-slate-500">Sin permanencia. Pago por transferencia (Transfermóvil o EnZona).</p>
      </section>

      {/* Preguntas frecuentes */}
      <section id="preguntas" className="scroll-mt-16 bg-slate-50 py-14">
        <div className="mx-auto max-w-3xl px-4">
          <h2 className="text-center text-3xl font-extrabold tracking-tight">Preguntas frecuentes</h2>
          <div className="mt-8 space-y-3">
            {[
              ['¿Necesito saber de tecnología para usarla?', 'No. La app te lleva de la mano al crear tu negocio, y una vez dentro tienes un recorrido guiado y ayudas en pantalla en cada parte del panel.'],
              ['¿Mis clientes tienen que instalar algo?', 'No. Reservan directo desde un enlace, en el navegador de su teléfono. Si quieren, pueden agregarlo a su pantalla de inicio como si fuera una app, pero no es obligatorio.'],
              ['¿Cómo pago la mensualidad?', 'Por transferencia (Transfermóvil o EnZona). Subes la captura del comprobante desde tu panel y se revisa y activa enseguida.'],
              ['¿Puedo cancelar cuando quiera?', 'Sí. No hay permanencia ni letra pequeña: pagas mes a mes y lo dejas cuando quieras.'],
              ['¿Qué pasa si no tengo buena conexión?', 'Citora funciona bien con datos móviles normales. Solo necesitas conexión al reservar, cambiar algo o revisar tu panel.'],
              ['¿Mis datos están seguros?', 'Sí. Cada negocio solo ve su propia información, protegida a nivel de base de datos, y nunca se comparte con otros negocios de la plataforma.'],
            ].map(([q, a]) => (
              <details key={q} className="card group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold text-slate-900">
                  {q}
                  <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-slate-400 transition group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </summary>
                <p className="mt-2 text-sm text-slate-600">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16">
        <div className="relative mx-auto max-w-3xl overflow-hidden rounded-3xl bg-gradient-to-br from-rose-400 to-orange-400 px-6 py-10 text-center text-white">
          <div aria-hidden="true" className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-12 -right-12 h-48 w-48 rounded-full bg-white/10" />
          <h2 className="relative text-3xl font-extrabold">Empieza hoy, gratis</h2>
          <p className="relative mt-2 text-white/90">En 5 minutos tienes tu app lista para compartir con tus clientes.</p>
          <Link to="/crear" className="relative mt-6 inline-block rounded-2xl bg-white px-6 py-4 font-bold text-citora-700 hover:bg-citora-50">
            Crear mi app gratis
          </Link>
        </div>
      </section>

      <footer className="border-t border-slate-100 py-10">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
            <CitoraLogo className="text-base text-slate-700" />
            <nav className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-sm text-slate-600">
              {NAV.map((n) => (
                <a key={n.href} href={n.href} className="hover:text-slate-900">{n.label}</a>
              ))}
            </nav>
          </div>
          <div className="mt-6 flex flex-col items-center gap-1 border-t border-slate-100 pt-6 text-center text-sm text-slate-500 sm:flex-row sm:justify-between">
            <p>© {new Date().getFullYear()} Citora</p>
            <p className="space-x-2 text-xs">
              <Link to="/terminos" className="underline hover:text-slate-700">Términos</Link>
              <span>·</span>
              <Link to="/privacidad" className="underline hover:text-slate-700">Privacidad</Link>
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}

function Check() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

function PhoneMock() {
  return (
    <div className="relative mx-auto w-full max-w-[290px]" aria-hidden="true">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 scale-110 rounded-[3rem] bg-gradient-to-br from-citora-300/40 to-citora-500/40 blur-2xl" />
      <div className="rounded-[2.5rem] border-[10px] border-slate-900 bg-slate-50 shadow-2xl">
        <div className="space-y-3 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-pink-600 text-lg font-bold text-white">L</div>
            <div>
              <p className="font-bold">Nails Studio</p>
              <p className="text-xs text-slate-500">Reserva tu cita</p>
            </div>
          </div>
          {[['Manicura', '1.500 CUP'], ['Pedicura', '1.800 CUP'], ['Acrílicas', '3.500 CUP']].map(([n, p]) => (
            <div key={n} className="flex items-center justify-between rounded-xl bg-white px-3 py-2.5 text-sm shadow-sm ring-1 ring-slate-200">
              <span className="font-medium">{n}</span>
              <span className="text-slate-500">{p}</span>
            </div>
          ))}
          <div className="grid grid-cols-3 gap-1.5 pt-1">
            {['10:00', '13:00', '15:00'].map((t, i) => (
              <div key={t} className={`rounded-lg py-2 text-center text-xs font-semibold ${i === 1 ? 'bg-pink-600 text-white' : 'bg-white ring-1 ring-slate-200'}`}>{t}</div>
            ))}
          </div>
          <div className="rounded-xl bg-pink-600 py-3 text-center text-sm font-bold text-white">Reservar</div>
        </div>
      </div>
    </div>
  )
}
