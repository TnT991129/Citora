import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BusinessAvatar } from '../../components/ui'
import { applyAppearance, socialUrl } from '../../lib/appearance'
import { setBrandColor } from '../../lib/brand'
import { setAppManifest } from '../../lib/pwa'
import { errorMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import type { PublicBusiness } from '../../lib/types'
import { clientPath } from '../../lib/url'

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
        applyAppearance(b.appearance)
        document.title = b.name
        setAppManifest({ name: b.name, path: clientPath(b.slug).slice(1), color: b.color_primary, logo: b.logo_url })
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
          <Link to={clientPath(business.slug)} className="-ml-2 rounded-full p-2 text-slate-600 hover:bg-slate-100" aria-label="Volver">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 6l-6 6 6 6" /></svg>
          </Link>
        )}
        <Link to={clientPath(business.slug)} className="flex min-w-0 items-center gap-2.5">
          <BusinessAvatar name={business.name} logo={business.logo_url} size={34} />
          <span className="truncate font-bold">{business.name}</span>
        </Link>
      </div>
    </header>
  )
}

/** Cabecera de la web del negocio: portada (imagen o color), logo, nombre y redes. También sirve de vista previa en el panel. */
export function BusinessHero({ business, rating, preview }: {
  business: Pick<PublicBusiness, 'name' | 'logo_url' | 'description' | 'address' | 'cover_url' | 'appearance'>
  rating?: PublicBusiness['rating']
  preview?: boolean
}) {
  const a = business.appearance || {}
  const withImage = Boolean(business.cover_url) && a.cover_style !== 'color'
  const socials = [
    a.instagram && { key: 'instagram', href: socialUrl.instagram(a.instagram), label: 'Instagram' },
    a.facebook && { key: 'facebook', href: socialUrl.facebook(a.facebook), label: 'Facebook' },
    a.tiktok && { key: 'tiktok', href: socialUrl.tiktok(a.tiktok), label: 'TikTok' },
    a.maps_url && { key: 'maps', href: a.maps_url, label: 'Cómo llegar' },
  ].filter(Boolean) as { key: keyof typeof SOCIAL_ICONS; href: string; label: string }[]

  return (
    <div
      className={`relative overflow-hidden text-white ${preview ? 'pb-8 pt-6' : 'pb-16 pt-10'} ${withImage ? 'bg-slate-900 bg-cover bg-center' : 'bg-brand'}`}
      style={withImage ? { backgroundImage: `url("${business.cover_url}")` } : undefined}
    >
      {/* Oscurece la foto para que el texto se lea bien */}
      {withImage && <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/45 to-black/70" />}
      <div className="relative mx-auto max-w-xl px-4 text-center">
        <div className="flex justify-center"><BusinessAvatar name={business.name} logo={business.logo_url} size={preview ? 56 : 80} inverted /></div>
        <h1 className={`mt-3 font-extrabold ${preview ? 'text-xl' : 'text-3xl'}`}>{business.name}</h1>
        {a.tagline && <p className="mt-1 text-sm font-semibold uppercase tracking-wider text-white/85">{a.tagline}</p>}
        {business.description && <p className="mt-2 text-white/90">{business.description}</p>}
        {business.address && <p className="mt-2 text-sm text-white/80">📍 {business.address}</p>}
        {rating && rating.count > 0 && (
          <a href="#opiniones" className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-sm font-semibold">
            <span className="text-amber-300">★</span> {Number(rating.avg).toFixed(1)}
            <span className="font-normal text-white/80">· {rating.count} {rating.count === 1 ? 'opinión' : 'opiniones'}</span>
          </a>
        )}
        {socials.length > 0 && (
          <div className="mt-4 flex justify-center gap-2">
            {socials.map((x) => (
              <a
                key={x.key}
                href={preview ? undefined : x.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={x.label}
                title={x.label}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 transition hover:bg-white/25"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={SOCIAL_ICONS[x.key]} />
                </svg>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const SOCIAL_ICONS = {
  instagram: 'M7 3h10a4 4 0 014 4v10a4 4 0 01-4 4H7a4 4 0 01-4-4V7a4 4 0 014-4zM12 16a4 4 0 100-8 4 4 0 000 8zM17.5 6.5h.01',
  facebook: 'M15 3h-2.5A3.5 3.5 0 009 6.5V9H7v3.5h2V21h3.5v-8.5H15l.5-3.5h-3V7a1 1 0 011-1H15z',
  tiktok: 'M14 3v11.5a3.5 3.5 0 11-3.5-3.5M14 3c.5 2.5 2.5 4.5 5 4.5',
  maps: 'M12 21s-7-6.2-7-11.5a7 7 0 0114 0C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
}

/** Aviso destacado del negocio (ej. "Esta semana 20% en tintes") */
export function Announcement({ text }: { text?: string }) {
  if (!text) return null
  return (
    <div className="rounded-btn bg-amber-50 px-4 py-3 text-center font-semibold text-amber-900 shadow-sm ring-1 ring-amber-200">
      📣 {text}
    </div>
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
