import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { PageLoader } from './components/ui'
import { supabaseConfigured } from './lib/supabase'

// Cada parte se descarga solo cuando se usa: el cliente que reserva nunca baja el código del panel
const Landing = lazy(() => import('./pages/Landing'))
const Create = lazy(() => import('./pages/Create'))
const Login = lazy(() => import('./pages/Login'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const Panel = lazy(() => import('./pages/panel/Panel'))
const Admin = lazy(() => import('./pages/admin/Admin'))
const BusinessHome = lazy(() => import('./pages/public/BusinessHome'))
const BookingFlow = lazy(() => import('./pages/public/BookingFlow'))
const BookingPage = lazy(() => import('./pages/public/BookingPage'))
const MyAppointments = lazy(() => import('./pages/public/MyAppointments'))
const NotFound = lazy(() => import('./pages/NotFound'))

export default function App() {
  if (!supabaseConfigured) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <div className="card">
          <h1 className="text-xl font-bold">Falta configurar Supabase</h1>
          <p className="mt-2 text-sm text-slate-600">
            Crea el archivo <code>.env.local</code> con <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code>
            (ver <code>.env.example</code> y la guía de instalación).
          </p>
        </div>
      </div>
    )
  }
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/crear" element={<Create />} />
        <Route path="/entrar" element={<Login />} />
        <Route path="/restablecer" element={<ResetPassword />} />
        <Route path="/panel/*" element={<Panel />} />
        <Route path="/admin/*" element={<Admin />} />

        {/* Cada negocio: su web de clientes y su panel */}
        <Route path="/:slug/client" element={<BusinessHome />} />
        <Route path="/:slug/client/reservar" element={<BookingFlow />} />
        <Route path="/:slug/client/cita/:token" element={<BookingPage />} />
        <Route path="/:slug/client/mis-citas" element={<MyAppointments />} />
        <Route path="/:slug/panel-admin/*" element={<Panel />} />

        {/* Direcciones de antes (enlaces ya enviados por WhatsApp): llevan a las nuevas */}
        <Route path="/:slug" element={<ToClient />} />
        <Route path="/:slug/reservar" element={<ToClient sub="reservar" />} />
        <Route path="/:slug/cita/:token" element={<ToClient sub="cita" />} />
        <Route path="/:slug/mis-citas" element={<ToClient sub="mis-citas" />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}

/** Redirige una dirección antigua (/barberia-leo/...) a la web de clientes (/barberia-leo/client/...) */
function ToClient({ sub }: { sub?: string }) {
  const { slug, token } = useParams()
  const { search } = useLocation()
  const tail = sub === 'cita' ? `/cita/${token}` : sub ? `/${sub}` : ''
  return <Navigate to={`/${slug}/client${tail}${search}`} replace />
}
