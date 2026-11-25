import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ThemeToggle } from '../../components/ThemeToggle'
import { LangSwitch } from '../../components/LangSwitch'
import { WhatsNew } from '../../components/WhatsNew'
import { Alert, BusinessAvatar, Button, CitoraLogo, Modal, PageLoader } from '../../components/ui'
import { useSession } from '../../lib/auth'
import { setBrandColor } from '../../lib/brand'
import { setAppManifest } from '../../lib/pwa'
import { createBusinessFromDraft, loadDraft } from '../../lib/draft'
import { stopTracking } from '../../lib/analytics'
import { errorMessage } from '../../lib/errors'
import { goToMarket, IS_INT } from '../../lib/market'
import { fetchProgress, mergeOnboarding, readOnboarding, saveOnboarding, type Onboarding, type Progress } from '../../lib/onboarding'
import { load, save } from '../../lib/storage'
import { APP_VERSION } from '../../lib/version'
import { dateKey, daysLeft, fullDateFromIso, hoursLeft, timeOf, todayKey } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import type { Business, MyStatus, Service, Staff } from '../../lib/types'
import { panelPath, publicUrl } from '../../lib/url'
import Agenda from './Agenda'
import Appearance from './Appearance'
import { PanelContext } from './context'
import Backup from './Backup'
import Customers from './Customers'
import Discounts from './Discounts'
import Expenses from './Expenses'
import Gallery from './Gallery'
import More from './More'
import MyBusiness from './MyBusiness'
import Packages from './Packages'
import PlanPage from './PlanPage'
import Policies from './Policies'
import Reminders from './Reminders'
import Reviews from './Reviews'
import Schedule from './Schedule'
import Services from './Services'
import Settings from './Settings'
import Stats from './Stats'
import { SurveyBanner } from './Survey'
import Team from './Team'
import Waitlist from './Waitlist'
import Today from './Today'
import { GuidedTour, isMobileScreen, tourSteps, DEMO_PENDING_NAME } from './tutorial'
import { LANG, t, tn } from '../../lib/i18n'

export default function Panel() {
  const session = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  // /:slug/panel-admin/*  (o /panel/* de antes, que lleva al panel propio)
  const { slug, '*': rest = '' } = useParams()
  const [business, setBusiness] = useState<Business | null | undefined>(undefined)
  const [status, setStatus] = useState<MyStatus | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [progress, setProgress] = useState<Progress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newsOpen, setNewsOpen] = useState(false)
  // Tutorial: número del paso (null = cerrado). Los pasos dependen de si es móvil u ordenador.
  const [tourIndex, setTourIndex] = useState<number | null>(null)
  const [tourMobile, setTourMobile] = useState(isMobileScreen)
  const steps = useMemo(() => tourSteps(tourMobile, DEMO_PENDING_NAME), [tourMobile])

  const reloadBusiness = useCallback(async () => {
    const [{ data: b, error: e1 }, { data: st, error: e2 }] = await Promise.all([
      supabase.from('businesses').select('*').maybeSingle(),
      supabase.rpc('get_my_business_status'),
    ])
    if (e1 || e2) {
      setError(errorMessage(e1 || e2))
      return
    }
    // Negocio de la otra versión (Cuba o /int/): su panel está allí
    if (b && goToMarket((b as Business).market)) return
    // Versión internacional: los avisos push salen en el idioma en que el dueño usa su panel
    if (b && IS_INT && (b as Business).lang !== LANG) {
      supabase.from('businesses').update({ lang: LANG }).eq('id', (b as Business).id).then(() => {}, () => {})
    }
    setBusiness(b as Business | null)
    setStatus(st as MyStatus | null)
    if (b) {
      const biz = b as Business
      setBrandColor(biz.color_primary)
      setAppManifest({ name: t('{name} · Panel', { name: biz.name }), shortName: biz.name, path: panelPath(biz.slug).slice(1), color: biz.color_primary, logo: biz.logo_url })
    }
  }, [])

  const reloadServices = useCallback(async () => {
    const { data } = await supabase.from('services').select('*').order('position').order('created_at')
    setServices((data as Service[]) || [])
  }, [])

  const reloadStaff = useCallback(async () => {
    const { data } = await supabase.from('staff').select('*').order('position').order('created_at')
    setStaff((data as Staff[]) || [])
  }, [])

  const refreshProgress = useCallback(async () => {
    setProgress(await fetchProgress())
  }, [])

  useEffect(() => {
    document.title = t('Mi panel · Citora')
  }, [])

  useEffect(() => {
    if (!session) return
    ;(async () => {
      const { data: b } = await supabase.from('businesses').select('id').maybeSingle()
      if (!b) {
        // Venía del asistente y tuvo que confirmar el correo: se crea ahora
        const draft = loadDraft()
        if (draft && draft.name && draft.slug) {
          try {
            await createBusinessFromDraft(draft)
          } catch (e) {
            setError(errorMessage(e))
          }
        } else {
          const { data: isAdmin } = await supabase.rpc('is_platform_admin')
          if (isAdmin) {
            navigate('/admin', { replace: true })
            return
          }
        }
      }
      await Promise.all([reloadBusiness(), reloadServices(), reloadStaff(), refreshProgress()])
    })()
  }, [session, navigate, reloadBusiness, reloadServices, reloadStaff, refreshProgress])

  // Primeros pasos y herramientas: se cambian aquí al momento y se guardan en el servidor
  const updateOnboarding = useCallback((patch: Onboarding) => {
    setBusiness((b) => {
      if (!b) return b
      const next = mergeOnboarding(readOnboarding(b), patch)
      void saveOnboarding(b.id, next)
      return { ...b, onboarding: next }
    })
  }, [])

  const markStep = useCallback((id: keyof NonNullable<Onboarding['steps']>) => {
    if (readOnboarding(business).steps?.[id]) return
    updateOnboarding({ steps: { [id]: new Date().toISOString() } })
  }, [business, updateOnboarding])

  // ----- Tutorial -----
  const startTutorial = useCallback(() => {
    setTourMobile(isMobileScreen())
    setNewsOpen(false)
    setTourIndex(0)
  }, [])
  const exitTutorial = useCallback(() => setTourIndex(null), [])
  const nextTutorial = useCallback(() => setTourIndex((i) => (i === null ? i : Math.min(i + 1, steps.length - 1))), [steps.length])
  const prevTutorial = useCallback(() => setTourIndex((i) => (i === null ? i : Math.max(i - 1, 1))), [])
  const finishTutorial = useCallback(() => {
    setTourIndex(null)
    updateOnboarding({ tutorial: new Date().toISOString() })
    if (business) navigate(panelPath(business.slug))
    window.scrollTo(0, 0)
  }, [business, navigate, updateOnboarding])

  // Desde la bienvenida: ?tutorial=1
  useEffect(() => {
    if (!business || params.get('tutorial') !== '1') return
    params.delete('tutorial')
    setParams(params, { replace: true })
    startTutorial()
  }, [business, params, setParams, startTutorial])

  // Cada paso en su pantalla: solo al entrar en el paso (al tocar "Mi negocio" la propia pestaña
  // cambia de pantalla y el paso siguiente ya está ahí)
  const step = tourIndex === null ? null : steps[tourIndex]
  const businessSlug = business?.slug
  useEffect(() => {
    if (!businessSlug || tourIndex === null) return
    const route = steps[tourIndex].route
    if (route === undefined) return
    const want = panelPath(businessSlug, route)
    if (window.location.pathname.replace(/\/+$/, '').endsWith(want)) return
    navigate(want)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourIndex, businessSlug])

  // Novedades de la versión: una sola vez por versión. A quien acaba de crear su app no se le
  // muestran: para él todo es nuevo.
  useEffect(() => {
    if (!business || !status || status.status === 'vencido') return
    if (load<string>(NEWS_KEY, '') === APP_VERSION) return
    const isNew = Date.now() - new Date(business.created_at).getTime() < 2 * 86400000
    // Las novedades hablan de cambios de la versión de Cuba: en la internacional no se enseñan
    if (isNew || IS_INT) save(NEWS_KEY, APP_VERSION)
    else setNewsOpen(true)
  }, [business, status])
  // Los dueños no cuentan como visitas cuando miran la portada o su propia web
  useEffect(() => {
    if (business) stopTracking()
  }, [business])

  const closeNews = useCallback(() => {
    save(NEWS_KEY, APP_VERSION)
    setNewsOpen(false)
  }, [])

  const slugChanged = useCallback((newSlug: string) => {
    setBusiness((b) => (b ? { ...b, slug: newSlug } : b))
    navigate(panelPath(newSlug, rest), { replace: true })
  }, [navigate, rest])

  if (session === null) return <Navigate to={`/entrar?next=${encodeURIComponent(location.pathname)}`} replace />
  if (error && !business) {
    return (
      <div className="mx-auto max-w-md p-6">
        <Alert>{error}</Alert>
        <Button className="mt-4" variant="secondary" onClick={() => window.location.reload()}>{t('Reintentar')}</Button>
      </div>
    )
  }
  if (session === undefined || business === undefined) return <PageLoader />
  if (business === null || !status) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <CitoraLogo className="text-xl" />
        <h1 className="text-xl font-bold">{t('Todavía no tienes una app')}</h1>
        <Link to="/crear" className="rounded-xl bg-citora-600 px-5 py-3 font-semibold text-white">{t('Crear mi app')}</Link>
        <button onClick={() => supabase.auth.signOut()} className="text-sm text-slate-500">{t('Salir')}</button>
      </div>
    )
  }

  // Dirección antigua (/panel): se lleva al panel propio con su enlace
  if (!slug) return <Navigate to={panelPath(business.slug, rest)} replace />
  // El panel de otro negocio: no se muestra nada suyo
  if (slug.toLowerCase() !== business.slug) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <CitoraLogo className="text-xl" />
        <h1 className="text-xl font-bold">{t('Este panel es de otro negocio')}</h1>
        <p className="text-slate-600">
          {t('Estás conectado como')}{' '}<b>{session.user.email}</b>{t(', dueño de')}{' '}<b>{business.name}</b>.
        </p>
        <Link to={panelPath(business.slug)} className="w-full rounded-xl bg-citora-600 px-5 py-3 font-semibold text-white">
          {t('Ir al panel de')}{' '}{business.name}
        </Link>
        <button
          onClick={async () => {
            await supabase.auth.signOut()
            navigate(`/entrar?next=${encodeURIComponent(location.pathname)}`, { replace: true })
          }}
          className="w-full rounded-xl px-5 py-3 font-semibold text-slate-700 ring-1 ring-slate-300"
        >
          {t('Entrar con la cuenta de este negocio')}
        </button>
      </div>
    )
  }

  const blocked = status.status === 'vencido'
  const base = panelPath(business.slug)
  const link = (sub = '') => panelPath(business.slug, sub)
  const onboarding = readOnboarding(business)

  return (
    <PanelContext.Provider
      value={{
        business, status, services, staff, reloadStaff, reloadBusiness, reloadServices, base, link, slugChanged,
        showTour: startTutorial, showNews: () => setNewsOpen(true),
        onboarding, updateOnboarding, markStep, progress, refreshProgress,
        tutorial: { active: tourIndex !== null, step },
      }}
    >
      <div className={`min-h-dvh pb-24 md:pb-8 ${blocked ? '' : 'lg:pb-10 lg:pl-64'}`}>
        {/* Ordenador: menú lateral fijo con las secciones principales */}
        {!blocked && <Sidebar business={business} status={status} base={base} link={link} />}

        <header className={`sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-lg ${blocked ? '' : 'lg:hidden'}`}>
          <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-2.5">
            <BusinessAvatar name={business.name} logo={business.logo_url} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold leading-tight">{business.name}</p>
              <p className="truncate text-xs text-slate-500">{t('Código')}{' '}{business.code}</p>
            </div>
            <nav className="hidden gap-1 md:flex">
              {!blocked && NAV.map((n) => <TopLink key={n.sub} base={base} to={link(n.sub)} label={n.label} />)}
              {blocked && <TopLink base={base} to={link('plan')} label={t('Plan')} />}
            </nav>
            {!blocked && <PlanChip status={status} to={link('plan')} />}
            <LangSwitch />
            <ThemeToggle />
          </div>
        </header>

        <StatusBanner status={status} planLink={link('plan')} />
        {!blocked && <SurveyBanner />}

        <main className="mx-auto max-w-4xl px-4 py-5 lg:px-8 lg:py-8">
          {/* key: cada pantalla entra con una transición suave */}
          <div key={location.pathname} className="ui-page">
          {blocked ? (
            <Routes>
              <Route path="*" element={<PlanPage blocked />} />
            </Routes>
          ) : (
            <Routes>
              <Route index element={<Today />} />
              <Route path="agenda" element={<Agenda />} />
              <Route path="negocio" element={<MyBusiness />} />
              <Route path="servicios" element={<Services />} />
              <Route path="equipo" element={<Team />} />
              <Route path="horario" element={<Schedule />} />
              <Route path="ajustes" element={<Settings />} />
              <Route path="apariencia" element={<Appearance />} />
              <Route path="clientes" element={<Customers />} />
              <Route path="estadisticas" element={<Stats />} />
              <Route path="gastos" element={<Expenses />} />
              <Route path="opiniones" element={<Reviews />} />
              <Route path="galeria" element={<Gallery />} />
              <Route path="recordatorios" element={<Reminders />} />
              <Route path="espera" element={<Waitlist />} />
              <Route path="cupones" element={<Discounts />} />
              <Route path="bonos" element={<Packages />} />
              <Route path="respaldo" element={<Backup />} />
              <Route path="mas" element={<More />} />
              <Route path="politicas" element={<Policies />} />
              <Route path="plan" element={<PlanPage />} />
              <Route path="*" element={<Navigate to={base} replace />} />
            </Routes>
          )}
          </div>
        </main>

        {!blocked && (
          <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-slate-200 bg-white/90 backdrop-blur-lg safe-bottom md:hidden">
            {NAV.map((n) => <BottomLink key={n.sub} base={base} to={link(n.sub)} label={n.label} icon={n.icon} tour={n.tour} />)}
          </nav>
        )}
      </div>
      {!blocked && tourIndex !== null && (
        <GuidedTour steps={steps} index={tourIndex} onNext={nextTutorial} onPrev={prevTutorial} onExit={exitTutorial} onFinish={finishTutorial} />
      )}
      {!blocked && <WhatsNew open={newsOpen && tourIndex === null} onClose={closeNews} />}
      {!blocked && business && status && !newsOpen && tourIndex === null && (
        <TrialEnding status={status} tz={business.timezone} onPlan={() => navigate(link('plan'))} />
      )}
    </PanelContext.Provider>
  )
}

const NEWS_KEY = 'citora:novedades-vistas'

const NAV = [
  { sub: '', label: t('Hoy'), icon: 'home', tour: 'nav-hoy' },
  { sub: 'agenda', label: t('Agenda'), icon: 'calendar', tour: 'nav-agenda' },
  { sub: t('clientes'), label: t('Clientes'), icon: 'users', tour: 'nav-clientes' },
  { sub: t('negocio'), label: t('Mi negocio'), icon: 'store', tour: 'nav-negocio' },
  { sub: 'mas', label: t('Más'), icon: 'grid', tour: 'nav-mas' },
] as const

// Pantallas que cuelgan de "Mi negocio" y de "Más": su pestaña queda marcada en ellas
const PARENT: Record<string, string[]> = {
  negocio: ['negocio', 'servicios', 'horario', 'apariencia', 'equipo', 'politicas'],
  mas: ['mas', 'estadisticas', 'gastos', 'opiniones', 'galeria', 'recordatorios', 'espera', 'cupones', 'bonos', 'respaldo', 'ajustes', 'plan'],
}

function useIsActive(to: string, base: string): boolean {
  const { pathname } = useLocation()
  const path = pathname.replace(/\/+$/, '')
  for (const [tab, subs] of Object.entries(PARENT)) {
    if (to === `${base}/${tab}`) return subs.some((s) => path === `${base}/${s}`)
  }
  return to === base ? path === base : path === to || path.startsWith(to + '/')
}

function TopLink({ to, label, base }: { to: string; label: string; base: string }) {
  const active = useIsActive(to, base)
  return (
    <Link
      to={to}
      className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${active ? 'bg-brand/10 text-brand' : 'text-slate-600 hover:bg-slate-100'}`}
    >
      {label}
    </Link>
  )
}

function BottomLink({ to, label, icon, base, tour }: { to: string; label: string; icon: string; base: string; tour: string }) {
  const active = useIsActive(to, base)
  return (
    <Link to={to} data-tour={tour} aria-current={active ? 'page' : undefined} className={`flex flex-col items-center gap-0.5 pb-1.5 pt-2 text-[11px] font-semibold ${active ? 'text-brand' : 'text-slate-500'}`}>
      <span className={`flex h-8 w-14 items-center justify-center rounded-full transition duration-300 ${active ? 'bg-brand/10' : ''}`}>
        <Icon name={icon} className="h-[22px] w-[22px]" />
      </span>
      {label}
    </Link>
  )
}

/** "Prueba · 11 días" o "Pagado · 20 días": lleva a Mensualidad */
function PlanChip({ status, to }: { status: MyStatus; to: string }) {
  let text: string | null = null
  if (status.status === 'prueba') {
    const d = daysLeft(status.trial_ends_at)
    text = d <= 0 ? t('Prueba · último día') : tn(d, 'Prueba · {n} día', 'Prueba · {n} días')
  } else if (status.status === 'activo' && status.paid_until && daysLeft(status.paid_until) <= 5) {
    const d = daysLeft(status.paid_until)
    text = d <= 0 ? t('Vence hoy') : tn(d, 'Vence en {n} día', 'Vence en {n} días')
  }
  if (!text) return null
  return <Link to={to} className="shrink-0 whitespace-nowrap rounded-full bg-brand/10 px-2.5 py-1 text-xs font-bold text-brand">{text}</Link>
}

/** Menú lateral del ordenador: las cinco secciones, "Nueva cita" y la mensualidad */
function Sidebar({ business, status, base, link }: { business: Business; status: MyStatus; base: string; link: (sub?: string) => string }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
      <div className="flex items-center gap-3 px-5 pb-4 pt-5">
        <BusinessAvatar name={business.name} logo={business.logo_url} size={40} />
        <div className="min-w-0">
          <p className="truncate font-extrabold leading-tight">{business.name}</p>
          <p className="truncate text-xs text-slate-500">{t('Código')}{' '}{business.code}</p>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {NAV.map((n) => <SideLink key={n.sub} base={base} to={link(n.sub)} label={n.label} icon={n.icon} tour={n.tour} />)}
      </nav>
      <div className="space-y-3 px-4 pb-3">
        <Link to={`${base}?nueva=1`} className="flex w-full items-center justify-center gap-2 rounded-btn bg-brand bg-btn-grad px-4 py-2.5 font-semibold text-white shadow-md shadow-brand/25 transition hover:brightness-110">
          <Icon name="plus" className="h-4 w-4" /> {t('Nueva cita')}
        </Link>
        <div className="text-center"><PlanChip status={status} to={link('plan')} /></div>
      </div>
      <div className="flex items-center gap-1 border-t border-slate-100 p-3">
        <a href={publicUrl(business.slug)} target="_blank" rel="noreferrer" className="flex flex-1 items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900">
          <Icon name="globe" className="h-5 w-5" /> {t('Ver mi web')}
        </a>
        <LangSwitch />
        <ThemeToggle />
      </div>
      <p className="px-6 pb-3 text-[11px] font-medium text-slate-400">{t('Citora v')}{APP_VERSION}</p>
    </aside>
  )
}

function SideLink({ to, label, icon, base, tour }: { to: string; label: string; icon: string; base: string; tour: string }) {
  const active = useIsActive(to, base)
  return (
    <Link
      to={to}
      data-tour={tour}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-semibold transition ${active ? 'bg-brand/10 text-brand' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
    >
      <Icon name={icon} className="h-5 w-5 shrink-0" />
      {label}
    </Link>
  )
}

/**
 * Ventana al entrar al panel cuando a la prueba gratis le quedan 2 días o menos (una vez al día):
 * el recuadro de arriba se pasa por alto con facilidad y los avisos push solo llegan a quien los activó.
 */
function TrialEnding({ status, tz, onPlan }: { status: MyStatus; tz: string; onPlan: () => void }) {
  const { pathname } = useLocation()
  const today = todayKey(tz)
  const [seen, setSeen] = useState(() => load<string>(TRIAL_KEY, '') === today)
  if (status.status !== 'prueba' || seen || pathname.endsWith('/plan')) return null
  // Días que faltan en el calendario del negocio: 0 = hoy, 1 = mañana
  const days = Math.round((Date.parse(dateKey(status.trial_ends_at, tz)) - Date.parse(today)) / 86400000)
  if (days > 2 || hoursLeft(status.trial_ends_at) <= 0) return null
  const close = () => {
    save(TRIAL_KEY, today)
    setSeen(true)
  }
  const title = days <= 0 ? t('Hoy termina tu prueba gratis') : days === 1 ? t('Mañana termina tu prueba gratis') : t('Te quedan 2 días de prueba gratis')
  return (
    <Modal
      open
      onClose={close}
      title={title}
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={close}>{t('Más tarde')}</Button>
          <Button block onClick={() => { close(); onPlan() }}>{t('Elegir mi plan')}</Button>
        </div>
      }
    >
      <div className="space-y-3 text-slate-700">
        <p className="text-4xl" aria-hidden>⏳</p>
        <p>
          {t('Tu prueba gratis termina el {day} a las {time}. A partir de ese momento, tus clientes ya no podrán reservar.', {
            day: fullDateFromIso(status.trial_ends_at, tz),
            time: timeOf(status.trial_ends_at, tz, true),
          })}
        </p>
        <p>{t('Elige tu plan y paga la mensualidad para seguir recibiendo reservas sin cortes. Todo lo que tienes se queda igual.')}</p>
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
          {t('Si no pagas, a los 5 días de terminar la prueba tu app se borra para siempre.')}
        </p>
      </div>
    </Modal>
  )
}

const TRIAL_KEY = 'citora:aviso-fin-prueba'

function StatusBanner({ status, planLink }: { status: MyStatus; planLink: string }) {
  const box = (cls: string, icon: string, text: ReactNode, action?: ReactNode) => (
    <div className="mx-auto max-w-4xl px-4 pt-4 lg:px-8 lg:pt-6">
      <div className={`flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 text-sm ${cls}`}>
        <Icon name={icon} className="h-5 w-5 shrink-0" />
        <span className="min-w-0 flex-1">{text}</span>
        {action}
      </div>
    </div>
  )
  // Con días de sobra, la prueba solo se ve en la etiqueta de arriba ("Prueba · 11 días")
  if (status.status === 'prueba') {
    const h = hoursLeft(status.trial_ends_at)
    if (h > 72) return null
    const left = h > 24 ? t('{n} días', { n: daysLeft(status.trial_ends_at) }) : t('{n} horas', { n: h })
    return box(
      'border-amber-200 bg-amber-50 text-amber-900',
      'clock',
      <>{t('Tu prueba gratis termina en')}{' '}<b>{left}</b>{t('. Suscríbete para que tus clientes sigan reservando.')}</>,
      <Link to={planLink} className="rounded-full bg-amber-500 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-amber-600">{t('Suscribirme')}</Link>,
    )
  }
  if (status.status === 'activo' && status.paid_until && daysLeft(status.paid_until) <= 5) {
    return box(
      'border-amber-200 bg-amber-50 text-amber-900',
      'clock',
      <>{t('Tu plan vence en')}{' '}<b>{daysLeft(status.paid_until)} {t('días')}</b>{t('. Renueva para no perder reservas.')}</>,
      <Link to={planLink} className="rounded-full bg-amber-500 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-amber-600">{t('Renovar')}</Link>,
    )
  }
  if (status.status === 'vencido') {
    return box(
      'border-red-200 bg-red-50 text-red-800',
      'lock',
      <>{t('Tu app está')}{' '}<b>{t('inhabilitada')}</b>{t(': tus clientes no pueden reservar. Paga la mensualidad para activarla. Tus datos están guardados.')}</>,
    )
  }
  return null
}

export function Icon({ name, className = 'h-6 w-6' }: { name: string; className?: string }) {
  const paths: Record<string, string> = {
    home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
    calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
    list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
    clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
    users: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8',
    grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
    chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    star: 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z',
    image: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M15.5 9.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z',
    card: 'M2 6h20v12H2zM2 10h20M6 15h4',
    globe: 'M12 21a9 9 0 100-18 9 9 0 000 18zM3.6 9h16.8M3.6 15h16.8M12 3a14 14 0 010 18M12 3a14 14 0 000 18',
    external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5',
    chevron: 'M9 6l6 6-6 6',
    compass: 'M12 21a9 9 0 100-18 9 9 0 000 18zM15.5 8.5l-2 5-5 2 2-5z',
    palette: 'M12 21a9 9 0 110-18c5 0 9 3.6 9 8 0 2.8-2.2 4-4.5 4H15a1.5 1.5 0 00-1 2.6c.6.6.4 3.4-2 3.4zM7.5 11.5h.01M10.5 7.5h.01M15 8h.01',
    seats: 'M6 11V6a2 2 0 012-2h8a2 2 0 012 2v5M4 11h16v3H4zM6 14v6M18 14v6',
    scroll: 'M8 3h10a2 2 0 012 2v12M8 3a2 2 0 00-2 2v14a2 2 0 002 2h10M8 3a2 2 0 012 2M10 9h6M10 13h6M10 17h4',
    bell: 'M6 8a6 6 0 0112 0c0 7 3 8 3 8H3s3-1 3-8M10.3 20a2 2 0 003.4 0',
    hourglass: 'M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9',
    gift: 'M3 9h18v4H3zM5 13v8h14v-8M12 9v12M12 9C10 5 6.5 5 6.5 7S9 9 12 9zM12 9c2-4 5.5-4 5.5-2S15 9 12 9z',
    ticket: 'M3 8a2 2 0 002-2h14a2 2 0 002 2v2a2 2 0 000 4v2a2 2 0 00-2 2H5a2 2 0 00-2-2v-2a2 2 0 000-4zM14 6v12',
    receipt: 'M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2zM9 8h6M9 12h6',
    download: 'M12 3v12M7 10l5 5 5-5M4 19h16',
    lock: 'M6 11h12v10H6zM8 11V7a4 4 0 018 0v4',
    x: 'M6 6l12 12M18 6L6 18',
    shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
    sparkles: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
    plus: 'M12 5v14M5 12h14',
    alert: 'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
    check: 'M5 12l5 5 9-10',
    store: 'M4 4h16l1 5a3 3 0 01-6 0 3 3 0 01-6 0 3 3 0 01-6 0zM5 12v9h14v-9M10 21v-5h4v5',
    search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-3.5-3.5',
    logout: 'M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 17l5-5-5-5M15 12H4',
    ban: 'M12 21a9 9 0 100-18 9 9 0 000 18zM5.6 5.6l12.8 12.8',
    cash: 'M2 7h20v10H2zM12 15a3 3 0 100-6 3 3 0 000 6zM6 7v10M18 7v10',
    gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
    eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
    link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
    copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
    whatsapp: 'M3 21l1.6-4.7A8.5 8.5 0 1112 20.5a8.4 8.4 0 01-4.3-1.2zM9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.6-2-1-1 .9a4.5 4.5 0 01-2.8-2.8l.9-1-1-2z',
    scissors: 'M6 9a3 3 0 100-6 3 3 0 000 6zM6 21a3 3 0 100-6 3 3 0 000 6zM20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12',
    help: 'M12 21a9 9 0 100-18 9 9 0 000 18zM9.5 9a2.5 2.5 0 014.9.8c0 1.7-2.4 2.2-2.4 3.7M12 17h.01',
  }
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[name]} />
    </svg>
  )
}
