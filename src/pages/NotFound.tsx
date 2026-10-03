import { Link } from 'react-router-dom'
import { CitoraLogo } from '../components/ui'

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[80dvh] max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <CitoraLogo className="text-xl" />
      <h1 className="text-2xl font-bold">Página no encontrada</h1>
      <p className="text-slate-600">Revisa el enlace o vuelve al inicio.</p>
      <Link to="/" className="font-semibold text-citora-600">Ir al inicio</Link>
    </div>
  )
}
