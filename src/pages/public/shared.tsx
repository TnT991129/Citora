import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BusinessAvatar } from '../../components/ui'
import { setBrandColor } from '../../lib/brand'
import { errorMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import type { PublicBusiness } from '../../lib/types'

/** Carga los datos públicos de un negocio y aplica su color */
export function usePublicBusiness(slug: string | undefined) {
  const [business, setBusiness] = useState<PublicBusiness | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) return
    let alive = true
    supabase.rpc('get_public_business', { p_slug: slug }).then(({ data, error }) => {
      if (!alive) return
      if (error) {
        setError(errorMessage(error))
        return
      }
      const b = data as PublicBusiness | null
      setBusiness(b)
      if (b) {
        setBrandColor(b.color_primary)
        document.title = b.name
      }
    })
    return () => {
      alive = false
    }
  }, [slug])

  return { business, error }
}

export function PublicHeader({ business, back }: { business: Pick<PublicBusiness, 'name' | 'slug' | 'logo_url'>; back?: boolean }) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-3">
        {back && (
          <Link to={`/${business.slug}`} className="-ml-2 rounded-full p-2 text-slate-600 hover:bg-slate-100" aria-label="Volver">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 6l-6 6 6 6" /></svg>
          </Link>
        )}
        <Link to={`/${business.slug}`} className="flex min-w-0 items-center gap-2.5">
          <BusinessAvatar name={business.name} logo={business.logo_url} size={34} />
          <span className="truncate font-bold">{business.name}</span>
        </Link>
      </div>
    </header>
  )
}

export function PoweredBy() {
  return (
    <p className="py-8 text-center text-xs text-slate-400">
      Reservas con <Link to="/" className="font-semibold text-slate-500">Citora</Link>
    </p>
  )
}

export function Closed({ business }: { business: PublicBusiness }) {
  return (
    <div className="min-h-dvh">
      <PublicHeader business={business} />
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="flex justify-center"><BusinessAvatar name={business.name} logo={business.logo_url} size={72} /></div>
        <h1 className="mt-4 text-2xl font-bold">{business.name}</h1>
        <p className="mt-2 text-slate-600">Este negocio no está recibiendo reservas en este momento.</p>
      </main>
      <PoweredBy />
    </div>
  )
}

/** Estrellas de 1 a 5. Si se pasa onChange, se pueden pulsar. */
export function Stars({ value, onChange, size = 20 }: { value: number; onChange?: (n: number) => void; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" role={onChange ? 'radiogroup' : 'img'} aria-label={`${value} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const star = (
          <svg viewBox="0 0 24 24" width={size} height={size} className={n <= Math.round(value) ? 'text-amber-400' : 'text-slate-300'} fill="currentColor" aria-hidden>
            <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" />
          </svg>
        )
        return onChange ? (
          <button key={n} type="button" role="radio" aria-checked={n === value} aria-label={`${n} estrellas`} onClick={() => onChange(n)} className="p-1 active:scale-90">
            {star}
          </button>
        ) : (
          <span key={n}>{star}</span>
        )
      })}
    </span>
  )
}

export function Centered({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center gap-3 p-6 text-center">{children}</div>
}
