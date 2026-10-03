import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
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
        <Route path="/:slug" element={<BusinessHome />} />
        <Route path="/:slug/reservar" element={<BookingFlow />} />
        <Route path="/:slug/cita/:token" element={<BookingPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}
