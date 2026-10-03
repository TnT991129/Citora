import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import { Alert, BusinessAvatar, Button, CitoraLogo, PageLoader } from '../../components/ui'
import { useSession } from '../../lib/auth'
import { setBrandColor } from '../../lib/brand'
import { createBusinessFromDraft, loadDraft } from '../../lib/draft'
import { errorMessage } from '../../lib/errors'
import { daysLeft, hoursLeft } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import type { Business, MyStatus, Service } from '../../lib/types'
import Agenda from './Agenda'
import { PanelContext } from './context'
import PlanPage from './PlanPage'
import Schedule from './Schedule'
import Services from './Services'
import Settings from './Settings'
import Today from './Today'

export default function Panel() {
  const session = useSession()
  const navigate = useNavigate()
  const [business, setBusiness] = useState<Business | null | undefined>(undefined)
  const [status, setStatus] = useState<MyStatus | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [error, setError] = useState<string | null>(null)

  const reloadBusiness = useCallback(async () => {
    const [{ data: b, error: e1 }, { data: st, error: e2 }] = await Promise.all([
      supabase.from('businesses').select('*').maybeSingle(),
      supabase.rpc('get_my_business_status'),
    ])
    if (e1 || e2) {
      setError(errorMessage(e1 || e2))
      return
    }
    setBusiness(b as Business | null)
    setStatus(st as MyStatus | null)
    if (b) setBrandColor((b as Business).color_primary)
  }, [])

  const reloadServices = useCallback(async () => {
    const { data } = await supabase.from('services').select('*').order('position').order('created_at')
    setServices((data as Service[]) || [])
  }, [])

  useEffect(() => {
    document.title = 'Mi panel · Citora'
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
      await Promise.all([reloadBusiness(), reloadServices()])
    })()
  }, [session, navigate, reloadBusiness, reloadServices])

  if (session === null) return <Navigate to="/entrar" replace />
  if (error && !business) {
    return (
      <div className="mx-auto max-w-md p-6">
        <Alert>{error}</Alert>
        <Button className="mt-4" variant="secondary" onClick={() => location.reload()}>Reintentar</Button>
      </div>
    )
  }
  if (session === undefined || business === undefined) return <PageLoader />
  if (business === null || !status) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <CitoraLogo className="text-xl" />
        <h1 className="text-xl font-bold">Todavía no tienes una app</h1>
        <Link to="/crear" className="rounded-xl bg-citora-600 px-5 py-3 font-semibold text-white">Crear mi app</Link>
        <button onClick={() => supabase.auth.signOut()} className="text-sm text-slate-500">Salir</button>
      </div>
    )
  }

  const blocked = status.status === 'vencido'

  return (
    <PanelContext.Provider value={{ business, status, services, reloadBusiness, reloadServices }}>
      <div className="min-h-dvh pb-24 md:pb-8">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-2.5">
            <BusinessAvatar name={business.name} logo={business.logo_url} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold leading-tight">{business.name}</p>
              <p className="truncate text-xs text-slate-500">Código {business.code}</p>
            </div>
            <nav className="hidden gap-1 md:flex">
              {!blocked && NAV.map((n) => <TopLink key={n.to} {...n} />)}
              <TopLink to="/panel/plan" label="Plan" />
            </nav>
          </div>
        </header>

        <StatusBanner status={status} />

        <main className="mx-auto max-w-4xl px-4 py-5">
          {blocked ? (
            <Routes>
              <Route path="*" element={<PlanPage blocked />} />
            </Routes>
          ) : (
            <Routes>
              <Route index element={<Today />} />
              <Route path="agenda" element={<Agenda />} />
              <Route path="servicios" element={<Services />} />
              <Route path="horario" element={<Schedule />} />
              <Route path="ajustes" element={<Settings />} />
              <Route path="plan" element={<PlanPage />} />
              <Route path="*" element={<Navigate to="/panel" replace />} />
            </Routes>
          )}
        </main>

        {!blocked && (
          <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-slate-200 bg-white safe-bottom md:hidden">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === '/panel'}
                className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${isActive ? 'text-brand' : 'text-slate-500'}`}
              >
                <Icon name={n.icon} />
                {n.label}
              </NavLink>
            ))}
          </nav>
        )}
      </div>
    </PanelContext.Provider>
  )
}

const NAV = [
  { to: '/panel', label: 'Hoy', icon: 'home' },
  { to: '/panel/agenda', label: 'Agenda', icon: 'calendar' },
  { to: '/panel/servicios', label: 'Servicios', icon: 'list' },
  { to: '/panel/horario', label: 'Horario', icon: 'clock' },
  { to: '/panel/ajustes', label: 'Ajustes', icon: 'gear' },
] as const

function TopLink({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      end={to === '/panel'}
      className={({ isActive }) => `rounded-lg px-3 py-1.5 text-sm font-semibold ${isActive ? 'bg-brand/10 text-brand' : 'text-slate-600 hover:bg-slate-100'}`}
    >
      {label}
    </NavLink>
  )
}

function StatusBanner({ status }: { status: MyStatus }) {
  if (status.status === 'prueba') {
    const h = hoursLeft(status.trial_ends_at)
    const left = h > 24 ? `${daysLeft(status.trial_ends_at)} días` : `${h} horas`
    return (
      <div className="border-b border-violet-200 bg-violet-50">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm text-violet-900">
          <span>Prueba gratis con todo incluido · te quedan <b>{left}</b></span>
          <Link to="/panel/plan" className="font-semibold underline">Elegir plan</Link>
        </div>
      </div>
    )
  }
  if (status.status === 'activo' && status.paid_until && daysLeft(status.paid_until) <= 5) {
    return (
      <div className="border-b border-amber-200 bg-amber-50">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm text-amber-900">
          <span>Tu plan vence en <b>{daysLeft(status.paid_until)} días</b>. Renueva para no perder reservas.</span>
          <Link to="/panel/plan" className="font-semibold underline">Renovar</Link>
        </div>
      </div>
    )
  }
  if (status.status === 'vencido') {
    return (
      <div className="border-b border-red-200 bg-red-50">
        <div className="mx-auto max-w-4xl px-4 py-2 text-sm text-red-800">
          Tu app está <b>inhabilitada</b>: tus clientes no pueden reservar. Elige un plan y paga para activarla. Tus datos están guardados.
        </div>
      </div>
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
    gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  }
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[name]} />
    </svg>
  )
}
