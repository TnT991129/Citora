// Piezas de lista del panel (Mi negocio, Más): un título de grupo y filas con icono que llevan a otra pantalla
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from './Panel'

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 flex items-end justify-between gap-3 px-1">
      <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{children}</h2>
      {right}
    </div>
  )
}

export function RowList({ children }: { children: ReactNode }) {
  return <div className="card divide-y divide-slate-100 overflow-hidden p-0 sm:p-0">{children}</div>
}

const rowCls = 'flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50 active:bg-slate-100'

function Inner({ icon, title, sub, right, tint, chevron }: { icon?: string; title: ReactNode; sub?: ReactNode; right?: ReactNode; tint?: string; chevron: boolean }) {
  return (
    <>
      {icon && (
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tint || 'bg-brand/10 text-brand'}`}>
          <Icon name={icon} className="h-5 w-5" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        {sub && <span className="block truncate text-sm text-slate-500">{sub}</span>}
      </span>
      {right}
      {chevron && <Icon name="chevron" className="h-4 w-4 shrink-0 text-slate-300" />}
    </>
  )
}

/** Fila que lleva a otra pantalla (to), abre algo (onClick) o un enlace de fuera (href) */
export function Row({ to, href, onClick, tour, ...rest }: {
  icon?: string
  title: ReactNode
  sub?: ReactNode
  right?: ReactNode
  tint?: string
  to?: string
  href?: string
  onClick?: () => void
  tour?: string
}) {
  if (to) return <Link to={to} data-tour={tour} className={rowCls}><Inner {...rest} chevron /></Link>
  if (href) return <a href={href} target="_blank" rel="noreferrer" data-tour={tour} onClick={onClick} className={rowCls}><Inner {...rest} chevron /></a>
  return <button type="button" onClick={onClick} data-tour={tour} className={rowCls}><Inner {...rest} chevron={Boolean(onClick)} /></button>
}

export function Chip({ children, tone = 'amber' }: { children: ReactNode; tone?: 'amber' | 'brand' | 'slate' | 'emerald' }) {
  const cls = {
    amber: 'bg-amber-100 text-amber-800',
    brand: 'bg-brand/10 text-brand',
    slate: 'bg-slate-100 text-slate-600',
    emerald: 'bg-emerald-100 text-emerald-800',
  }[tone]
  return <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{children}</span>
}
