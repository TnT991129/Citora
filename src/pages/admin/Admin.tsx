// Panel de administrador de Citora. Cinco pestañas: Inicio (lo de hoy), Negocios, Cobros, Números y
// Ajustes. En el ordenador, menú lateral oscuro; en el móvil, barra abajo.
import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { RefreshButton } from '../../components/RefreshButton'
import { ThemeToggle } from '../../components/ThemeToggle'
import { Button, CitoraLogo, PageLoader } from '../../components/ui'
import { stopTracking } from '../../lib/analytics'
import { useSession } from '../../lib/auth'
import { CITORA_COLOR, setBrandColor } from '../../lib/brand'
import { setAppManifest } from '../../lib/pwa'
import { supabase } from '../../lib/supabase'
import { Icon } from '../panel/Panel'
import { AdminHome } from './AdminHome'
import AdminSettings from './AdminSettings'
import AdminStats from './AdminStats'
import { Businesses, type BizFilter } from './Businesses'
import { Payments } from './Payments'

const TABS = [
  { key: 'inicio', label: 'Inicio', icon: 'home' },
  { key: 'negocios', label: 'Negocios', icon: 'store' },
  { key: 'cobros', label: 'Cobros', icon: 'card' },
  { key: 'numeros', label: 'Números', icon: 'chart' },
  { key: 'ajustes', label: 'Ajustes', icon: 'gear' },
] as const

export type AdminTab = (typeof TABS)[number]['key']

const TAB_KEY = 'citora:admin-pestana'

function savedTab(): AdminTab {
  try {
    const t = sessionStorage.getItem(TAB_KEY)
    if (TABS.some((x) => x.key === t)) return t as AdminTab
  } catch {
    /* sin almacenamiento se empieza en Inicio */
  }
  return 'inicio'
}

export default function Admin() {
  const session = useSession()
  const [isAdmin, setIsAdmin] = useState<boolean | undefined>(undefined)
  const [tab, setTabState] = useState<AdminTab>(savedTab)
  const [bizFilter, setBizFilter] = useState<BizFilter>('todos')
  const [pending, setPending] = useState(0)

  const go = useCallback((t: AdminTab, filter: BizFilter = 'todos') => {
    setTabState(t)
    setBizFilter(filter)
    window.scrollTo(0, 0)
    // Al pulsar "Actualizar" se vuelve a la misma pestaña
    try {
      sessionStorage.setItem(TAB_KEY, t)
    } catch {
      /* sin almacenamiento se vuelve a Inicio */
    }
  }, [])

  // Comprobantes por revisar: el número junto a "Cobros"
  const countPending = useCallback(() => {
    supabase.from('payment_claims').select('id', { count: 'exact', head: true }).eq('status', 'pendiente')
      .then(({ count }) => setPending(count || 0))
  }, [])

  useEffect(() => {
    setBrandColor(null)
    document.title = 'Administración · Citora'
    setAppManifest({ name: 'Citora Admin', path: 'admin', color: CITORA_COLOR })
  }, [])

  useEffect(() => {
    if (!session) return
    supabase.rpc('is_platform_admin').then(({ data }) => {
      setIsAdmin(Boolean(data))
      // Tus visitas a la portada no cuentan en las estadísticas
      if (data) stopTracking()
    })
  }, [session])

  useEffect(() => {
    if (isAdmin) countPending()
  }, [isAdmin, tab, countPending])

  if (session === null) return <Navigate to="/entrar?next=%2Fadmin" replace />
  if (session === undefined || isAdmin === undefined) return <PageLoader />
  if (!isAdmin) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <CitoraLogo className="text-xl" />
        <h1 className="text-xl font-bold">Esta cuenta no es de administrador</h1>
        <p className="text-slate-600">
          Estás conectado como <b>{session.user.email}</b>, que es la cuenta de un negocio. Para ver tu panel de administrador entra con tu correo de administrador.
        </p>
        <Button block onClick={() => supabase.auth.signOut()}>Entrar con otra cuenta</Button>
      </div>
    )
  }

  const badge = (key: AdminTab) => (key === 'cobros' && pending > 0 ? pending : 0)

  return (
    <div className="min-h-dvh pb-24 lg:pb-0 lg:pl-60">
      {/* Ordenador: menú lateral oscuro (así se distingue de un vistazo del panel de un negocio) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-[#0b0b14] p-4 text-white lg:flex">
        <div className="flex items-center gap-2 px-2 pb-6 pt-1">
          <CitoraLogo className="text-lg" />
          <span className="ml-auto rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/60">Admin</span>
        </div>
        <nav className="space-y-0.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => go(t.key)}
              aria-current={tab === t.key ? 'page' : undefined}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] font-semibold transition ${tab === t.key ? 'bg-white/10 text-white' : 'text-white/55 hover:bg-white/5 hover:text-white'}`}
            >
              <Icon name={t.icon} className="h-5 w-5 shrink-0" />
              <span className="flex-1">{t.label}</span>
              {badge(t.key) > 0 && <span className="rounded-full bg-citora-600 px-2 py-0.5 text-xs font-bold text-white">{badge(t.key)}</span>}
            </button>
          ))}
        </nav>
        <div className="mt-auto flex items-center gap-1 border-t border-white/10 pt-3">
          <RefreshButton onImage />
          <ThemeToggle onImage />
          <button onClick={() => supabase.auth.signOut()} className="ml-auto flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-white/60 transition hover:bg-white/10 hover:text-white">
            <Icon name="logout" className="h-4 w-4" /> Salir
          </button>
        </div>
      </aside>

      {/* Móvil y tableta: cabecera oscura */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0b0b14]/95 text-white backdrop-blur-lg lg:hidden">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3">
          <CitoraLogo className="text-lg" />
          <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/60">Admin</span>
          <div className="ml-auto flex items-center gap-1">
            <RefreshButton onImage />
            <ThemeToggle onImage />
            <button onClick={() => supabase.auth.signOut()} className="ml-1 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-white/70 transition hover:bg-white/10 hover:text-white">Salir</button>
          </div>
        </div>
      </header>

      <main key={tab} className="ui-page mx-auto max-w-5xl px-4 py-6 lg:px-8 lg:py-8">
        {tab === 'inicio' && <AdminHome go={go} />}
        {tab === 'negocios' && <Businesses initialFilter={bizFilter} />}
        {tab === 'cobros' && <Payments onChanged={countPending} />}
        {tab === 'numeros' && <AdminStats />}
        {tab === 'ajustes' && <AdminSettings />}
      </main>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-slate-200 bg-white/90 backdrop-blur-lg lg:hidden">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => go(t.key)}
            aria-current={tab === t.key ? 'page' : undefined}
            className={`flex flex-col items-center gap-0.5 pb-1.5 pt-2 text-[11px] font-semibold ${tab === t.key ? 'text-brand' : 'text-slate-500'}`}
          >
            <span className={`relative flex h-8 w-14 items-center justify-center rounded-full transition duration-300 ${tab === t.key ? 'bg-brand/10' : ''}`}>
              <Icon name={t.icon} className="h-[22px] w-[22px]" />
              {badge(t.key) > 0 && (
                <span className="absolute right-2 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-citora-600 px-1 text-[10px] font-bold text-white">{badge(t.key)}</span>
              )}
            </span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
