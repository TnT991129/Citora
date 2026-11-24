import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ThemeToggle } from '../components/ThemeToggle'
import { CitoraLogo } from '../components/ui'
import { track } from '../lib/analytics'
import { setBrandColor } from '../lib/brand'
import { money } from '../lib/format'
import { DEFAULT_PRICE, DEFAULT_TEAM_PRICE, PLANS } from '../lib/plans'
import { supabase } from '../lib/supabase'
import { IS_INT } from '../lib/market'
import { BUSINESS_TYPES } from '../lib/templates'
import type { Prices } from '../lib/types'
import { AgendaClean, BarsArt, ChatChaos, HeroPhone, Ico, NightArt, Phone, ScreenAgenda, ScreenCreate, ScreenShare, StarsArt } from './landing/Demos'
import { spotlight, useCountUp, useInView, useReveal, useScrollProgress } from './landing/motion'
import './landing/landing.css'
import { t as tx } from '../lib/i18n'
import { LangSwitch } from '../components/LangSwitch'

const NAV = [
  { href: '#como-funciona', label: tx('Cómo funciona') },
  { href: '#funciones', label: tx('Funciones') },
  { href: '#calculadora', label: tx('Calculadora') },
  { href: '#precio', label: tx('Precio') },
  { href: '#preguntas', label: tx('Preguntas') },
]

// Lo que hace el dueño mientras Citora le llena la agenda (va cambiando en el titular)
const WHILE = [tx('mientras atiendes'), tx('mientras duermes'), tx('mientras cortas el pelo'), tx('mientras haces uñas'), tx('mientras descansas')]

const STEPS = [
  { title: tx('Crea tu app en 5 minutos'), text: tx('Eliges tu tipo de negocio y te damos los servicios, precios y horarios ya puestos. Solo ajustas lo tuyo: nombre, colores y logo. Sin saber nada de tecnología.'), screen: ScreenCreate },
  { title: tx('Comparte tu enlace'), text: tx('Ponlo en tu estado de WhatsApp, en tu Instagram o mándalo por mensaje. Tus clientes reservan desde ahí, sin instalar nada y sin crearse una cuenta.'), screen: ScreenShare },
  { title: tx('Las reservas llegan solas'), text: tx('Te avisa el móvil con cada cita nueva. Ves tu día de un vistazo, confirmas con un toque y Citora le recuerda la cita al cliente para que no falte.'), screen: ScreenAgenda },
]

const FAQ = [
  [tx('¿Necesito saber de tecnología?'), tx('No. Al crear tu app te damos servicios, precios y horarios de ejemplo para tu tipo de negocio, y en el panel tienes un recorrido guiado y ayudas en cada pantalla.')],
  [tx('¿Mis clientes tienen que instalar algo?'), tx('No. Reservan desde un enlace, en el navegador de su teléfono, sin cuenta ni contraseña. Si quieren, la añaden a su pantalla de inicio como una app.')],
  [tx('¿Y si mis clientes prefieren escribirme por WhatsApp?'), tx('Pueden seguir haciéndolo: tu web tiene un botón directo a tu WhatsApp. La diferencia es que la mayoría ya no te escribirá para preguntar si tienes hueco: lo verán ellos mismos.')],
  [tx('¿Qué diferencia hay entre Solo y Equipo?'), tx('Los dos traen todo: reservas, recordatorios, clientes, cobros, cupones, galería y opiniones. Equipo añade a las personas que trabajan contigo: cada una con sus servicios, su horario y su propio enlace para ver su agenda, y tus clientes eligen con quién reservar.')],
  [tx('¿Qué pasa cuando acaba la prueba gratis?'), tx('Eliges el plan que te va mejor, pagas el mes y sigues igual, con todo lo que ya tenías. Si no pagas, tu web deja de aceptar reservas, y a los 5 días tu app se borra.')],
  [tx('¿Cómo pago la mensualidad?'), IS_INT ? tx('Con PayPal o con tarjeta, desde tu panel. Tu app se activa al momento.') : tx('Por transferencia (Transfermóvil o EnZona). Subes la captura del comprobante desde tu panel y se activa enseguida.')],
  [tx('¿Puedo cancelar cuando quiera?'), tx('Sí. No hay permanencia ni letra pequeña: pagas mes a mes y lo dejas cuando quieras. Si ya pagaste alguna vez, tus datos se quedan guardados por si vuelves.')],
  [tx('¿Funciona con mala conexión?'), tx('Sí. Está hecha para gastar pocos datos y funciona bien con datos móviles normales.')],
  [tx('¿Mis datos están seguros?'), tx('Sí. Cada negocio solo ve su propia información, protegida a nivel de base de datos, y nunca se comparte con otros negocios.')],
]

export default function Landing() {
  const [prices, setPrices] = useState<Prices>({ basico: DEFAULT_PRICE, plus: DEFAULT_PRICE, ultra: DEFAULT_TEAM_PRICE, trial_days: 5 })
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [showSticky, setShowSticky] = useState(false)
  const revealRef = useReveal<HTMLDivElement>()
  const progressRef = useScrollProgress<HTMLDivElement>()

  useEffect(() => {
    setBrandColor(null)
    document.title = tx('Citora · La app de reservas de tu negocio')
    track('visita', { page: 'portada' })
    supabase.rpc('get_public_prices').then(({ data }) => data && setPrices(data as Prices))
  }, [])

  // Cabecera transparente sobre la portada y botón fijo abajo en el móvil al pasarla
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY
      setScrolled(y > 24)
      const nearEnd = y + window.innerHeight > document.documentElement.scrollHeight - 700
      setShowSticky(y > window.innerHeight * 0.85 && !nearEnd)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const trial = prices.trial_days ?? 5
  // Versión internacional (/int/): precios en USD (ver market.ts)
  const price = IS_INT ? prices.int_basico ?? 12.5 : prices.basico
  const freeLine = tx('{trial} días gratis · Sin tarjeta · Lista en 5 minutos', { trial: trial })

  return (
    <div
      ref={(el) => {
        revealRef.current = el
        progressRef.current = el
      }}
      className="lp min-h-dvh bg-white text-slate-900"
    >
      <Header scrolled={scrolled} menuOpen={menuOpen} setMenuOpen={setMenuOpen} />

      <Hero trial={trial} />

      <Marquee />

      <Statement />

      <BeforeAfter />

      <HowItWorks />

      <Features />

      <Calculator price={price} trial={trial} />

      <Pricing price={price} teamPrice={IS_INT ? prices.int_ultra ?? 23.5 : prices.ultra || DEFAULT_TEAM_PRICE} trial={trial} />

      <Faq />

      <FinalCta freeLine={freeLine} />

      <Footer />

      {/* Móvil: el botón de crear siempre a mano */}
      <div className="lp-sticky fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur safe-bottom md:hidden" data-show={showSticky ? '' : undefined}>
        <Link to="/crear" className="lp-cta flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 font-bold text-white">
          {tx('Crear mi app gratis')}{' '}<Ico name="arrow" className="h-5 w-5" />
        </Link>
        <p className="mt-1.5 text-center text-[11px] text-slate-500">{trial} {tx('días gratis · Sin tarjeta')}</p>
      </div>
    </div>
  )
}

/* ================================================================== */

function Header({ scrolled, menuOpen, setMenuOpen }: { scrolled: boolean; menuOpen: boolean; setMenuOpen: (f: (v: boolean) => boolean) => void }) {
  const light = !scrolled && !menuOpen
  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${light ? 'bg-transparent' : 'border-b border-slate-200 bg-white/90 backdrop-blur-lg'}`}>
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link to="/" className={light ? 'text-white' : 'text-slate-900'}><CitoraLogo className="text-xl" /></Link>
        <nav className="hidden items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${light ? 'text-white/75 hover:bg-white/10 hover:text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
              {n.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <div className={`hidden items-center gap-1 sm:flex ${light ? 'text-white' : ''}`}><LangSwitch onImage={light} /><ThemeToggle onImage={light} /></div>
          <Link to="/entrar" className={`hidden rounded-xl px-3 py-2 text-sm font-semibold sm:block ${light ? 'text-white/85 hover:bg-white/10' : 'text-slate-700 hover:bg-slate-100'}`}>{tx('Entrar')}</Link>
          <Link to="/crear" className="lp-cta rounded-xl px-4 py-2 text-sm font-bold text-white">{tx('Crear mi app')}</Link>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? tx('Cerrar menú') : tx('Abrir menú')}
            aria-expanded={menuOpen}
            className={`rounded-lg p-2 lg:hidden ${light ? 'text-white hover:bg-white/10' : 'text-slate-700 hover:bg-slate-100'}`}
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>
      {menuOpen && (
        <nav className="border-t border-slate-100 bg-white px-4 py-3 lg:hidden">
          <div className="flex flex-col gap-1">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} onClick={() => setMenuOpen(() => false)} className="rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                {n.label}
              </a>
            ))}
            <Link to="/entrar" className="rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100">{tx('Entrar a mi panel')}</Link>
            <div className="flex items-center gap-1 px-3 pt-1"><LangSwitch /><ThemeToggle /></div>
          </div>
        </nav>
      )}
    </header>
  )
}

/* ---- 1. Portada oscura con el móvil que se reserva solo ---- */
function Hero({ trial }: { trial: number }) {
  const [w, setW] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setW((i) => (i + 1) % WHILE.length), 2600)
    return () => clearInterval(t)
  }, [])

  return (
    <section data-progress="exit" className="relative overflow-hidden bg-[#07070d] pb-20 pt-28 text-white sm:pt-32 lg:pb-28">
      {/* Profundidad: rejilla al fondo, luces en medio, contenido delante */}
      <div className="lp-par pointer-events-none absolute inset-0" style={{ ['--speed' as string]: 160 }} aria-hidden>
        <div className="lp-grid absolute inset-0" />
      </div>
      <div className="lp-par pointer-events-none absolute inset-0" style={{ ['--speed' as string]: 260 }} aria-hidden>
        <div className="lp-glow left-[-10%] top-[-10%] h-[28rem] w-[28rem] bg-rose-500/40" />
        <div className="lp-glow right-[-12%] top-[20%] h-[26rem] w-[26rem] bg-orange-500/30" style={{ animationDelay: '-6s' }} />
        <div className="lp-glow bottom-[-20%] left-[30%] h-[22rem] w-[22rem] bg-violet-600/30" style={{ animationDelay: '-12s' }} />
      </div>

      <div className="lp-hero-fade relative mx-auto grid max-w-6xl items-center gap-14 px-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="text-center lg:text-left">
          <p className="lp-fade-in inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white/85 ring-1 ring-white/15 backdrop-blur" style={{ ['--i' as string]: -3 }}>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            {IS_INT ? tx('Reservas online para tu negocio') : tx('Reservas online para negocios en Cuba')}
          </p>
          <h1 className="mt-6 text-[2.6rem] font-extrabold leading-[1.02] tracking-[-0.035em] sm:text-6xl lg:text-7xl">
            <span className="lp-line"><span style={{ ['--i' as string]: 0 }}>{tx('Tu agenda')}</span></span>
            <span className="lp-line"><span style={{ ['--i' as string]: 1 }}>{tx('se llena sola')}</span></span>
            <span className="lp-line text-[0.62em] font-bold tracking-[-0.02em] sm:text-[0.55em]">
              <span style={{ ['--i' as string]: 2 }}>
                <span key={w} className="lp-word">{WHILE[w]}</span>
              </span>
            </span>
          </h1>
          <p className="lp-fade-in mx-auto mt-6 max-w-xl text-lg text-white/70 lg:mx-0" style={{ ['--i' as string]: 0 }}>
            {tx('Crea la app de reservas de tu negocio. Tus clientes eligen servicio, día y hora desde un enlace, y a ti te llega el aviso al móvil.')}{' '}
            <span className="text-white">{tx('Sin llamadas, sin mensajes, sin citas cruzadas.')}</span>
          </p>
          <div className="lp-fade-in mt-8 flex flex-col items-center gap-3 sm:flex-row lg:justify-start" style={{ ['--i' as string]: 1 }}>
            <Link to="/crear" className="lp-cta inline-flex w-full items-center justify-center gap-2 rounded-2xl px-7 py-4 text-lg font-bold text-white sm:w-auto">
              {tx('Crear mi app gratis')}{' '}<Ico name="arrow" />
            </Link>
            <a href="#como-funciona" className="inline-flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 font-semibold text-white/85 ring-1 ring-white/20 transition hover:bg-white/10 sm:w-auto">
              {tx('Ver cómo funciona')}
            </a>
          </div>
          <ul className="lp-fade-in mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-white/60 lg:justify-start" style={{ ['--i' as string]: 2 }}>
            {[tx('{trial} días gratis', { trial: trial }), tx('Sin tarjeta'), tx('Lista en 5 minutos'), IS_INT ? tx('Pagas en USD') : tx('Pagas en CUP')].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <Ico name="check" className="h-4 w-4 text-emerald-400" /> {t}
              </li>
            ))}
          </ul>
        </div>

        <div className="lp-par" style={{ ['--speed' as string]: -60 }}>
          <div className="lp-fade-in" style={{ ['--i' as string]: 1 }}>
            <HeroPhone />
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---- 2. Cinta infinita de tipos de negocio ---- */
function Marquee() {
  const names = BUSINESS_TYPES.filter((t) => t.key !== 'otro').map((t) => t.name)
  const row = [...names, tx('Consultas'), tx('Clases'), tx('Fotografía')]
  return (
    <section className="lp-marquee-wrap lp-fade-edges overflow-hidden border-y border-slate-100 bg-white py-6" aria-label={tx('Tipos de negocio')}>
      <div className="lp-marquee">
        {[0, 1].map((k) => (
          <div key={k} className="flex shrink-0 items-center" aria-hidden={k === 1}>
            {row.map((n) => (
              <span key={n} className="flex items-center whitespace-nowrap px-5 text-2xl font-extrabold tracking-tight text-slate-300 sm:text-3xl">
                {n}
                <span className="ml-10 text-lg text-rose-400">✦</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}

/* ---- 3. La frase que se ilumina palabra a palabra ---- */
function Statement() {
  const text = tx('Cada mensaje que contestas tarde es un cliente que reserva en otro sitio.')
  const accent = tx('Con Citora, tu negocio atiende solo, a cualquier hora.')
  const words = [...text.split(' ').map((t) => ({ t, a: false })), ...accent.split(' ').map((t) => ({ t, a: true }))]
  return (
    <section data-progress className="bg-white px-4 py-28 sm:py-36">
      <p className="lp-lit mx-auto max-w-4xl text-center text-3xl font-extrabold leading-[1.15] tracking-[-0.03em] sm:text-5xl">
        {words.map((w, i) => (
          <span key={i} className={w.a ? 'lp-gradient-text' : ''} style={{ ['--w' as string]: (i / words.length).toFixed(3) }}>
            {w.t}{' '}
          </span>
        ))}
      </p>
    </section>
  )
}

/* ---- 4. Antes y después ---- */
function BeforeAfter() {
  return (
    <section className="lp-lazy bg-slate-50 px-4 py-20 sm:py-28">
      <div className="mx-auto max-w-5xl">
        <SectionHead eyebrow={tx('El cambio')} title={tx('Del caos de mensajes a una agenda que se llena sola')} />
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          <div data-reveal="left" className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <p className="inline-flex items-center gap-2 rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-700">
              <Ico name="x" className="h-3.5 w-3.5" /> {tx('Sin Citora')}
            </p>
            <p className="mt-4 text-xl font-extrabold">{tx('Contestas mensajes todo el día')}</p>
            <p className="mt-1 text-sm text-slate-500">{tx('Y aun así se te escapan clientes, se te cruzan citas y otros no vienen.')}</p>
            <div className="mt-6 rounded-2xl bg-[#efeae2] p-4"><ChatChaos /></div>
          </div>
          <div data-reveal="right" className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-xl shadow-rose-500/5 sm:p-8">
            <p className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
              <Ico name="check" className="h-3.5 w-3.5" /> {tx('Con Citora')}
            </p>
            <p className="mt-4 text-xl font-extrabold">{tx('Tus clientes reservan solos')}</p>
            <p className="mt-1 text-sm text-slate-500">{tx('Solo ven las horas libres, reciben su recordatorio y tú no escribes nada.')}</p>
            <div className="mt-6 rounded-2xl bg-slate-50 p-4"><AgendaClean /></div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---- 5. Cómo funciona: móvil fijo que cambia mientras bajas ---- */
function HowItWorks() {
  const [active, setActive] = useState(0)
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-step]'))
    if (!('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.step))
      },
      { rootMargin: '-45% 0px -45% 0px' },
    )
    els.forEach((e) => io.observe(e))
    return () => io.disconnect()
  }, [])

  return (
    <section id="como-funciona" className="scroll-mt-16 bg-white px-4 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHead eyebrow={tx('Cómo funciona')} title={tx('De cero a recibir reservas, hoy mismo')} />
        <div className="mt-14 grid gap-12 lg:grid-cols-2 lg:gap-20">
          {/* Ordenador: el móvil se queda fijo y cambia de pantalla */}
          <div className="hidden lg:block">
            <div className="sticky top-24 flex justify-center">
              <Phone>
                {STEPS.map((s, i) => (
                  <div key={s.title} className="lp-screen" data-active={active === i ? '' : undefined}>
                    <s.screen />
                  </div>
                ))}
              </Phone>
            </div>
          </div>
          <ol className="space-y-10 lg:space-y-0">
            {STEPS.map((s, i) => (
              <li key={s.title} data-step={i} className="lg:flex lg:min-h-[78vh] lg:items-center">
                <div data-reveal className={`transition duration-500 lg:opacity-30 ${active === i ? 'lg:!opacity-100' : ''}`}>
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-400 to-orange-400 text-xl font-extrabold text-white shadow-lg shadow-rose-500/30">{i + 1}</span>
                  <h3 className="mt-5 text-3xl font-extrabold tracking-tight sm:text-4xl">{s.title}</h3>
                  <p className="mt-3 max-w-md text-lg text-slate-600">{s.text}</p>
                  {/* Móvil: la pantalla de cada paso, debajo de su texto */}
                  <div className="mt-8 flex justify-center lg:hidden">
                    <Phone className="scale-90"><s.screen /></Phone>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}

/* ---- 6. Funciones en mosaico ---- */
function Features() {
  const small: [string, string, string, string?][] = [
    ['users', tx('Tu equipo'), tx('Cada profesional con su agenda, sus servicios y su propio enlace. El cliente elige con quién.'), tx('Plan Equipo')],
    ['card', tx('Ficha de clientes'), tx('Cuántas veces vino, cuánto gastó y tus notas privadas sobre cada uno.')],
    ['ticket', tx('Cupones y bonos'), tx('Promociones y paquetes de sesiones para que vuelvan más seguido.')],
    ['image', tx('Galería de trabajos'), tx('Tus mejores fotos en tu web, para que te elijan antes de reservar.')],
  ]
  return (
    <section id="funciones" className="lp-lazy scroll-mt-16 bg-slate-50 px-4 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHead eyebrow={tx('Todo incluido')} title={tx('Todo lo que tu negocio necesita, en un solo lugar')} />
        <div className="mt-12 grid auto-rows-[minmax(0,auto)] gap-4 md:grid-cols-6">
          <div data-reveal="zoom" onPointerMove={spotlight} className="lp-spot relative overflow-hidden rounded-[28px] bg-[#0b0b14] p-7 text-white md:col-span-4 md:row-span-2 sm:p-9">
            <div className="lp-glow -right-20 -top-20 h-72 w-72 bg-rose-500/40" aria-hidden />
            <p className="relative text-xs font-bold uppercase tracking-[0.18em] text-rose-300">{tx('Reservas 24/7')}</p>
            <h3 className="relative mt-2 max-w-md text-3xl font-extrabold tracking-tight sm:text-4xl">{tx('Tu negocio abierto incluso cuando duermes')}</h3>
            <p className="relative mt-3 max-w-md text-white/65">{tx('Tus clientes reservan a cualquier hora y solo ven las horas que de verdad tienes libres. Nunca más dos citas a la vez.')}</p>
            <div className="relative mt-8"><NightArt /></div>
          </div>
          <FeatureCard className="md:col-span-2" i={1} eyebrow={tx('Menos ausencias')} title={tx('Recordatorios automáticos')} text={tx('El día antes, tus clientes reciben el aviso de su cita.')}>
            <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
              <span className="lp-ring flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-600"><Ico name="bell" /></span>
              <span className="text-sm leading-tight"><b className="block">{tx('Recuerda tu cita mañana')}</b><span className="text-slate-500">{tx('3:00 p.m. en Nails Studio')}</span></span>
            </div>
          </FeatureCard>
          <FeatureCard className="md:col-span-2" i={2} eyebrow={tx('Tus números')} title={tx('Sabes cuánto ganas')} text={tx('Ingresos, gastos y tus servicios estrella, sin sumar a mano.')}>
            <BarsArt />
          </FeatureCard>
          <FeatureCard className="md:col-span-3" i={0} eyebrow={tx('Opiniones')} title={tx('Clientes que hablan bien de ti')} text={tx('Después de la cita dejan su opinión; tú respondes y ganas confianza.')}>
            <StarsArt />
          </FeatureCard>
          <FeatureCard className="md:col-span-3" i={1} eyebrow={tx('Tu marca')} title={tx('Tu app, no una plantilla')} text={tx('Tu logo, tus colores, tu portada y tu enlace. Se instala en el móvil de tus clientes con tu nombre.')}>
            <div className="flex gap-2">
              {['from-rose-400 to-orange-400', 'from-sky-400 to-indigo-500', 'from-emerald-400 to-teal-500', 'from-violet-500 to-fuchsia-500', 'from-amber-300 to-orange-500'].map((g) => (
                <span key={g} className={`h-10 w-10 rounded-2xl bg-gradient-to-br ${g} shadow-md`} />
              ))}
            </div>
          </FeatureCard>
          {small.map(([icon, t, d, tag], i) => (
            <div key={t} data-reveal style={{ ['--i' as string]: i }} onPointerMove={spotlight} className="lp-spot rounded-[24px] border border-slate-200 bg-white p-6 transition hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-900/5 md:col-span-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-100 text-rose-600"><Ico name={icon} /></span>
              <h3 className="mt-4 flex flex-wrap items-center gap-2 font-extrabold">
                {t}
                {tag && <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-bold text-white">{tag}</span>}
              </h3>
              <p className="mt-1 text-sm text-slate-600">{d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function FeatureCard({ className, i, eyebrow, title, text, children }: { className: string; i: number; eyebrow: string; title: string; text: string; children: ReactNode }) {
  return (
    <div data-reveal style={{ ['--i' as string]: i }} onPointerMove={spotlight} className={`lp-spot flex flex-col justify-between gap-6 rounded-[28px] border border-slate-200 bg-white p-7 transition hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-900/5 ${className}`}>
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-rose-500">{eyebrow}</p>
        <h3 className="mt-2 text-xl font-extrabold tracking-tight">{title}</h3>
        <p className="mt-1 text-sm text-slate-600">{text}</p>
      </div>
      {children}
    </div>
  )
}

/** Moneda de la mensualidad en esta versión: CUP (Cuba) o USD (internacional) */
const PAY = IS_INT ? 'USD' : 'CUP'

/* ---- 7. Calculadora: cuánto dinero se escapa sin reservas online ---- */
function Calculator({ price, trial }: { price: number; trial: number }) {
  const [lost, setLost] = useState(4)
  const [avg, setAvg] = useState(IS_INT ? 30 : 1200)
  const { ref, inView } = useInView<HTMLDivElement>('-20% 0px')
  // La cifra sube desde 0 la primera vez que se ve; después solo sigue a los controles
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    if (inView) setSeen(true)
  }, [inView])
  const monthly = Math.round(lost * avg * 4.3)
  const shownLoss = useCountUp(seen ? monthly : 0, seen)
  const paysWith = Math.max(1, Math.ceil(price / Math.max(1, avg)))

  return (
    <section id="calculadora" className="scroll-mt-16 bg-white px-4 py-20 sm:py-28">
      <div className="mx-auto max-w-5xl">
        <SectionHead eyebrow={tx('Haz la cuenta')} title={tx('¿Cuánto dinero se te escapa cada mes?')} sub={tx('Clientes que escribieron y no contestaste a tiempo, que no encontraron hueco o que reservaron en otro sitio.')} />
        <div ref={ref} data-reveal="clip" className="mt-12 grid overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-xl shadow-slate-900/5 md:grid-cols-2">
          <div className="space-y-8 p-7 sm:p-10">
            <label className="block">
              <span className="flex items-baseline justify-between gap-3 font-semibold">
                {tx('Clientes que pierdes por semana')}{' '}<b className="text-2xl text-rose-500">{lost}</b>
              </span>
              <input type="range" min={1} max={20} value={lost} onChange={(e) => setLost(Number(e.target.value))} className="mt-3 w-full" aria-label={tx('Clientes que pierdes por semana')} />
            </label>
            <label className="block">
              <span className="flex items-baseline justify-between gap-3 font-semibold">
                {tx('Precio medio de tu servicio')}{' '}<b className="text-2xl text-rose-500">{money(avg, PAY)}</b>
              </span>
              <input type="range" min={IS_INT ? 5 : 200} max={IS_INT ? 200 : 6000} step={IS_INT ? 5 : 100} value={avg} onChange={(e) => setAvg(Number(e.target.value))} className="mt-3 w-full" aria-label={tx('Precio medio de tu servicio')} />
            </label>
          </div>
          <div className="relative flex flex-col justify-center overflow-hidden bg-[#0b0b14] p-7 text-white sm:p-10">
            <div className="lp-glow -bottom-24 -right-16 h-64 w-64 bg-rose-500/40" aria-hidden />
            <p className="relative text-sm font-semibold text-white/60">{tx('Pierdes cada mes, más o menos')}</p>
            <p className="relative mt-1 text-5xl font-extrabold tracking-tight sm:text-6xl"><span className="lp-gradient-text">{money(shownLoss, PAY)}</span></p>
            <p className="relative mt-5 text-white/75">
              {tx('Citora cuesta')}{' '}<b className="text-white">{money(price, PAY)} {tx('al mes')}</b>{tx(': se paga sola con')}{' '}
              <b className="text-white">{paysWith === 1 ? tx('una sola cita') : tx('{paysWith} citas', { paysWith: paysWith })}</b> {tx('que antes se te escapaban.')}
            </p>
            <Link to="/crear" className="lp-cta relative mt-7 inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3.5 font-bold text-white">
              {tx('Dejar de perder clientes')}{' '}<Ico name="arrow" className="h-5 w-5" />
            </Link>
            <p className="relative mt-2 text-center text-xs text-white/45">{tx('Pruébala')}{' '}{trial} {tx('días gratis')}</p>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---- 8. Precio ---- */
function Pricing({ price, teamPrice, trial }: { price: number; teamPrice: number; trial: number }) {
  const plans = [
    {
      key: 'basico', name: PLANS.basico.name, who: tx('Si atiendes tú solo'), price, highlight: false,
      items: [tx('Reservas online las 24 horas'), tx('Tu agenda con aviso de cada cita'), tx('Recordatorios por WhatsApp'), tx('Ficha de clientes y opiniones'), tx('Cobros, gastos y estadísticas'), tx('Tu web con tu logo, colores y enlace')],
    },
    {
      key: 'ultra', name: PLANS.ultra.name, who: tx('Para salones con varias personas'), price: teamPrice, highlight: true,
      items: [tx('Todo lo de Solo'), tx('Tu equipo: cada persona con sus servicios y su horario'), tx('Tus clientes eligen con quién reservar'), tx('Cada persona con su enlace: su agenda y sus números'), tx('Repartes los servicios del salón entre tu equipo'), tx('Tú lo ves todo desde tu panel')],
    },
  ]
  const both = [tx('Cupones y bonos'), tx('Galería de trabajos'), tx('Lista de espera'), tx('Servicios extra'), tx('Copia de tus datos en Excel'), tx('App instalable en el móvil')]
  return (
    <section id="precio" className="lp-lazy scroll-mt-16 bg-slate-50 px-4 py-20 sm:py-28">
      <div className="mx-auto max-w-5xl">
        <SectionHead eyebrow={tx('Precio')} title={tx('Dos planes. Todo incluido.')} sub={tx('Sin módulos escondidos ni cobros sorpresa. Pruébalo {trial} días gratis con todo, equipo incluido.', { trial: trial })} />
        <div className="mx-auto mt-12 grid max-w-4xl gap-5 md:grid-cols-2">
          {plans.map((p, i) => (
            <div key={p.key} data-reveal="zoom" style={{ ['--i' as string]: i }} className={`${p.highlight ? 'lp-border shadow-2xl shadow-rose-500/20' : 'rounded-3xl ring-1 ring-slate-200'}`}>
              <div className={`flex h-full flex-col rounded-[inherit] p-7 sm:p-9 ${p.highlight ? 'bg-[#0b0b14] text-white' : 'bg-white text-slate-900'}`}>
                <p className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-bold ${p.highlight ? 'bg-white/10 text-rose-200 ring-1 ring-white/15' : 'bg-slate-100 text-slate-600'}`}>{p.who}</p>
                <p className="mt-4 text-lg font-extrabold">{p.name}</p>
                <p className="mt-1 text-5xl font-extrabold tracking-tight">{money(p.price, PAY)}</p>
                <p className={p.highlight ? 'text-white/60' : 'text-slate-500'}>{tx('al mes · unos')}{' '}<b className={p.highlight ? 'text-white' : 'text-slate-900'}>{money(IS_INT ? Math.round((p.price / 30) * 100) / 100 : Math.round(p.price / 30), PAY)} {tx('al día')}</b></p>
                <ul className="mt-6 grid flex-1 content-start gap-2.5 text-sm">
                  {p.items.map((name) => (
                    <li key={name} className={`flex items-start gap-2 ${p.highlight ? 'text-white/85' : 'text-slate-700'}`}>
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-orange-400 text-white"><Ico name="check" className="h-2.5 w-2.5" /></span>
                      {name}
                    </li>
                  ))}
                </ul>
                <Link to="/crear" className={`mt-8 flex items-center justify-center gap-2 rounded-2xl py-4 text-lg font-bold ${p.highlight ? 'lp-cta text-white' : 'bg-slate-900 text-white hover:bg-slate-800'}`}>
                  {tx('Empezar')}{' '}{trial} {tx('días gratis')}{' '}<Ico name="arrow" className="h-5 w-5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
        <div data-reveal className="mx-auto mt-6 max-w-4xl rounded-3xl bg-white p-5 text-center ring-1 ring-slate-200 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{tx('Y en los dos planes también')}</p>
          <ul className="mt-3 flex flex-wrap justify-center gap-2">
            {both.map((t) => (
              <li key={t} className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700">{t}</li>
            ))}
          </ul>
        </div>
        <p className="mt-4 text-center text-sm text-slate-500">{tx('Sin tarjeta · Sin permanencia · Al acabar la prueba eliges el plan que te va mejor')}</p>
        <div className="mt-10 grid gap-4 text-sm sm:grid-cols-3">
          {[
            IS_INT ? ['phone', tx('Pagas con PayPal o con tarjeta'), tx('Tu app se activa al momento.')] : ['phone', tx('Pagas por Transfermóvil o EnZona'), tx('Subes la captura desde tu panel y listo.')],
            ['shield', tx('Sin riesgo'), tx('{trial} días gratis y sin permanencia: lo dejas cuando quieras.', { trial: trial })],
            ['wifi', IS_INT ? tx('Pensada para negocios pequeños') : tx('Pensada para Cuba'), tx('Gasta pocos datos y funciona con conexión normal.')],
          ].map(([icon, t, d], i) => (
            <div key={t} data-reveal style={{ ['--i' as string]: i }} className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-rose-500 shadow-sm ring-1 ring-slate-200"><Ico name={icon} /></span>
              <span><b className="block text-slate-900">{t}</b><span className="text-slate-600">{d}</span></span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ---- 9. Preguntas ---- */
function Faq() {
  return (
    <section id="preguntas" className="lp-lazy scroll-mt-16 bg-white px-4 py-20 sm:py-28">
      <div className="mx-auto max-w-3xl">
        <SectionHead eyebrow={tx('Preguntas')} title={tx('Lo que todos preguntan antes de empezar')} />
        <div className="mt-10 divide-y divide-slate-200 border-y border-slate-200">
          {FAQ.map(([q, a], i) => (
            <details key={q} data-reveal style={{ ['--i' as string]: i }} className="group py-1">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-lg font-bold">
                {q}
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition duration-300 group-open:rotate-45 group-open:bg-rose-100 group-open:text-rose-600">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
                </span>
              </summary>
              <p className="pb-5 pr-12 text-slate-600">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ---- 10. Llamada final ---- */
function FinalCta({ freeLine }: { freeLine: string }) {
  return (
    <section className="px-4 pb-20 pt-4 sm:pb-28">
      <div data-reveal="clip" className="relative mx-auto max-w-6xl overflow-hidden rounded-[32px] bg-[#07070d] px-6 py-20 text-center text-white sm:py-28">
        <div className="lp-grid absolute inset-0" aria-hidden />
        <div className="lp-glow -left-20 top-0 h-80 w-80 bg-rose-500/40" aria-hidden />
        <div className="lp-glow -right-20 bottom-0 h-80 w-80 bg-orange-500/30" style={{ animationDelay: '-8s' }} aria-hidden />
        <h2 className="relative mx-auto max-w-3xl text-4xl font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-6xl">
          {tx('Tu próxima cita puede')}{' '}<span className="lp-gradient-text">{tx('reservarse sola')}</span> {tx('esta noche')}
        </h2>
        <p className="relative mx-auto mt-5 max-w-xl text-lg text-white/65">{tx('En 5 minutos tienes tu app lista para compartir con tus clientes.')}</p>
        <Link to="/crear" className="lp-cta relative mt-9 inline-flex items-center gap-2 rounded-2xl px-8 py-4 text-lg font-bold text-white">
          {tx('Crear mi app gratis')}{' '}<Ico name="arrow" />
        </Link>
        <p className="relative mt-4 text-sm text-white/45">{freeLine}</p>
      </div>
    </section>
  )
}

function Footer() {
  const link = 'text-slate-600 transition hover:text-slate-900'
  return (
    <footer className="border-t border-slate-200 bg-white pb-28 pt-14 text-sm md:pb-12">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-10 px-4 sm:grid-cols-3 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
        <div className="col-span-2 sm:col-span-3 lg:col-span-1">
          <CitoraLogo className="text-lg text-slate-900" />
          <p className="mt-3 max-w-xs text-slate-500">{IS_INT ? tx('La app de reservas para barberías, salones, uñas, spas y cualquier negocio que trabaje con citas.') : tx('La app de reservas para barberías, salones, uñas, spas y cualquier negocio que trabaje con citas en Cuba.')}</p>
        </div>
        <nav aria-label={tx('Producto')}>
          <p className="font-bold text-slate-900">{tx('Producto')}</p>
          <ul className="mt-3 space-y-2">
            {NAV.map((n) => <li key={n.href}><a href={n.href} className={link}>{n.label}</a></li>)}
          </ul>
        </nav>
        <nav aria-label={tx('Tu cuenta')}>
          <p className="font-bold text-slate-900">{tx('Tu cuenta')}</p>
          <ul className="mt-3 space-y-2">
            <li><Link to="/crear" className={link}>{tx('Crear mi app')}</Link></li>
            <li><Link to="/entrar" className={link}>{tx('Entrar a mi panel')}</Link></li>
          </ul>
        </nav>
        <nav aria-label={tx('Legal')}>
          <p className="font-bold text-slate-900">{tx('Legal')}</p>
          <ul className="mt-3 space-y-2">
            <li><Link to="/terminos" className={link}>{tx('Términos de uso')}</Link></li>
            <li><Link to="/privacidad" className={link}>{tx('Privacidad')}</Link></li>
          </ul>
        </nav>
      </div>
      <div className="mx-auto mt-12 flex max-w-6xl flex-col items-center justify-between gap-2 border-t border-slate-100 px-4 pt-6 text-xs text-slate-500 sm:flex-row">
        <p>© {new Date().getFullYear()} {tx('Citora. Todos los derechos reservados.')}</p>
        <p>{IS_INT ? tx('Hecha para negocios como el tuyo') : tx('Hecha para negocios en Cuba')}</p>
      </div>
    </footer>
  )
}

function SectionHead({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <p data-reveal className="text-xs font-bold uppercase tracking-[0.2em] text-rose-500">{eyebrow}</p>
      <h2 data-reveal style={{ ['--i' as string]: 1 }} className="mt-3 text-4xl font-extrabold leading-[1.08] tracking-[-0.03em] sm:text-5xl">{title}</h2>
      {sub && <p data-reveal style={{ ['--i' as string]: 2 }} className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">{sub}</p>}
    </div>
  )
}
