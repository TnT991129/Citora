import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CitoraLogo } from '../components/ui'
import { setBrandColor } from '../lib/brand'
import { money } from '../lib/format'
import { DEFAULT_PRICE, INCLUDED, MODULES } from '../lib/plans'
import { supabase } from '../lib/supabase'
import { BUSINESS_TYPES } from '../lib/templates'
import type { Prices } from '../lib/types'

export default function Landing() {
  const [prices, setPrices] = useState<Prices>({ basico: DEFAULT_PRICE, plus: DEFAULT_PRICE, ultra: DEFAULT_PRICE, trial_days: 3 })

  useEffect(() => {
    setBrandColor(null)
    document.title = 'Citora · Reservas para tu negocio'
    supabase.rpc('get_public_prices').then(({ data }) => data && setPrices(data as Prices))
  }, [])

  const trial = prices.trial_days ?? 3

  return (
    <div className="min-h-dvh bg-white">
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <CitoraLogo className="text-xl text-slate-900" />
          <div className="flex items-center gap-2">
            <Link to="/entrar" className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Entrar</Link>
            <Link to="/crear" className="rounded-xl bg-citora-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-citora-700">Crear mi app</Link>
          </div>
        </div>
      </header>

      {/* Portada */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-citora-50 via-white to-white" />
        <div className="mx-auto grid max-w-5xl items-center gap-10 px-4 pb-16 pt-12 md:grid-cols-2 md:pt-20">
          <div>
            <span className="chip bg-citora-100 text-citora-800">{trial} días gratis · sin tarjeta</span>
            <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight text-slate-900 md:text-5xl">
              La app de reservas de tu negocio, lista en minutos
            </h1>
            <p className="mt-4 text-lg text-slate-600">
              Tus clientes reservan solos desde el móvil, sin llamarte ni escribirte. Tú llevas la agenda y avisas por WhatsApp con un toque.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link to="/crear" className="rounded-2xl bg-citora-600 px-6 py-4 text-center text-base font-bold text-white shadow-lg shadow-citora-600/20 hover:bg-citora-700">
                Crear mi app gratis
              </Link>
              <a href="#planes" className="rounded-2xl border border-slate-300 px-6 py-4 text-center text-base font-semibold text-slate-800 hover:bg-slate-50">
                Ver precio
              </a>
            </div>
          </div>
          <PhoneMock />
        </div>
      </section>

      {/* Cómo funciona */}
      <section className="mx-auto max-w-5xl px-4 py-14">
        <h2 className="text-center text-3xl font-extrabold tracking-tight">Así de fácil</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            ['1', 'Crea tu app', 'Elige tu tipo de negocio, pon tu nombre, tus servicios, precios y horarios.'],
            ['2', 'Comparte tu enlace', 'Ponlo en tu Instagram, WhatsApp o estado. Tus clientes reservan desde ahí.'],
            ['3', 'Gestiona tu agenda', 'Ves tus citas del día, confirmas y envías recordatorios por WhatsApp.'],
          ].map(([n, t, d]) => (
            <div key={n} className="card">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-citora-600 text-lg font-bold text-white">{n}</div>
              <h3 className="mt-3 text-lg font-bold">{t}</h3>
              <p className="mt-1 text-slate-600">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Para quién */}
      <section className="bg-slate-50 py-14">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="text-center text-3xl font-extrabold tracking-tight">Para negocios que trabajan con citas</h2>
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {BUSINESS_TYPES.filter((t) => t.key !== 'otro').map((t) => (
              <span key={t.key} className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200">
                {t.emoji} {t.name}
              </span>
            ))}
            <span className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200">✨ y muchos más</span>
          </div>
        </div>
      </section>

      {/* Precio: un solo plan con todo incluido */}
      <section id="planes" className="mx-auto max-w-5xl scroll-mt-16 px-4 py-14">
        <h2 className="text-center text-3xl font-extrabold tracking-tight">Un solo precio, todo incluido</h2>
        <p className="mt-2 text-center text-slate-600">Prueba todo gratis durante {trial} días. Si te gusta, sigues por una mensualidad.</p>
        <div className="card mx-auto mt-8 max-w-md ring-2 ring-citora-600">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-extrabold">Plan Citora</h3>
            <span className="chip bg-citora-600 text-white">Todo incluido</span>
          </div>
          <p className="mt-2">
            <span className="text-4xl font-extrabold">{money(prices.basico, 'CUP')}</span>
            <span className="text-slate-500"> /mes</span>
          </p>
          <ul className="mt-4 grid gap-1.5 text-sm sm:grid-cols-2">
            {INCLUDED.map((m) => (
              <li key={m} className="flex items-start gap-2">
                <span className="mt-0.5 text-citora-600">✓</span>
                <span>{MODULES[m].name}</span>
              </li>
            ))}
            <li className="flex items-start gap-2"><span className="mt-0.5 text-citora-600">✓</span><span>App instalable en el móvil</span></li>
            <li className="flex items-start gap-2"><span className="mt-0.5 text-citora-600">✓</span><span>Tu enlace, tus colores y tu logo</span></li>
          </ul>
          <Link to="/crear" className="mt-6 block rounded-2xl bg-citora-600 py-3.5 text-center font-bold text-white hover:bg-citora-700">
            Probar {trial} días gratis
          </Link>
        </div>
        <p className="mt-4 text-center text-sm text-slate-500">Sin permanencia. Pago por transferencia.</p>
      </section>

      <section className="px-4 pb-16">
        <div className="mx-auto max-w-3xl rounded-3xl bg-citora-600 px-6 py-10 text-center text-white">
          <h2 className="text-3xl font-extrabold">Empieza hoy, gratis</h2>
          <p className="mt-2 text-citora-100">En 5 minutos tienes tu app lista para compartir.</p>
          <Link to="/crear" className="mt-6 inline-block rounded-2xl bg-white px-6 py-4 font-bold text-citora-700 hover:bg-citora-50">
            Crear mi app
          </Link>
        </div>
      </section>

      <footer className="border-t border-slate-100 py-8 text-center text-sm text-slate-500">
        <CitoraLogo className="text-base text-slate-700" />
        <p className="mt-2">© {new Date().getFullYear()} Citora</p>
      </footer>
    </div>
  )
}

function PhoneMock() {
  return (
    <div className="mx-auto w-full max-w-[290px]" aria-hidden="true">
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
