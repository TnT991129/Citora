import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ThemeToggle } from './ThemeToggle'
import { CitoraLogo } from './ui'

const POINTS = ['Tus clientes reservan solos, a cualquier hora', 'Recordatorios automáticos para que no falten', 'Tu agenda, tus clientes y tus números en el móvil']

/**
 * Marco de las pantallas de acceso (entrar, contraseña nueva). En ordenador, a la izquierda un panel
 * oscuro con el estilo de la portada; en el móvil, solo el formulario con un toque de color arriba.
 */
export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-[#07070d] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-rose-500/30 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 right-0 h-96 w-96 rounded-full bg-orange-500/20 blur-3xl" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            backgroundImage: 'linear-gradient(rgb(255 255 255 / 0.05) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 0.05) 1px, transparent 1px)',
            backgroundSize: '52px 52px',
            maskImage: 'radial-gradient(ellipse 80% 70% at 30% 40%, #000 20%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 30% 40%, #000 20%, transparent 75%)',
          }}
        />
        <Link to="/" className="relative w-fit text-white"><CitoraLogo className="text-2xl" /></Link>
        <div className="relative">
          <p className="text-5xl font-extrabold leading-[1.04] tracking-[-0.035em] xl:text-6xl">
            Tu agenda
            <br />
            <span className="bg-gradient-to-r from-rose-400 via-orange-400 to-amber-300 bg-clip-text text-transparent">se llena sola.</span>
          </p>
          <ul className="mt-9 space-y-3.5 text-white/75">
            {POINTS.map((p) => (
              <li key={p} className="flex items-center gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-orange-400 text-white">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12l5 5 9-10" /></svg>
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-white/40">© {new Date().getFullYear()} Citora</p>
      </aside>

      <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-12">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-brand/10 to-transparent lg:hidden" />
        <ThemeToggle className="absolute right-3 top-3" />
        <Link to="/" className="relative mb-8 lg:hidden"><CitoraLogo className="text-2xl" /></Link>
        <div className="ui-page relative w-full max-w-sm">
          <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1.5 text-slate-500">{subtitle}</p>}
          <div className="mt-7">{children}</div>
        </div>
        {footer && <div className="relative mt-8 text-sm text-slate-600">{footer}</div>}
      </main>
    </div>
  )
}
