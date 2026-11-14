// Piezas visuales del panel de administrador. Todas mantienen el mismo borde y la misma altura
// para que las pantallas queden alineadas (títulos de sección pegados al borde de las tarjetas,
// etiquetas que nunca se parten en dos líneas, columnas de ancho fijo).
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { businessType } from '../../lib/templates'
import { Icon } from '../panel/Panel'
import { stateInfo, STEPS, type AdminOwner } from './adminData'

export function PageTitle({ title, sub, right }: { title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">{title}</h1>
        {sub && <p className="mt-0.5 text-slate-500">{sub}</p>}
      </div>
      {right}
    </div>
  )
}

export function SectionTitle({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="mb-2.5 flex min-h-[20px] items-center justify-between gap-3">
      <h2 className="text-[13px] font-bold uppercase leading-5 tracking-[0.12em] text-slate-500">{title}</h2>
      {right}
    </div>
  )
}

/** Cifra destacada. En una fila, todas miden lo mismo y la nota queda abajo */
export function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card flex h-full min-w-0 flex-col p-4 sm:p-4">
      <p className="truncate text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-1 truncate text-2xl font-extrabold tracking-tight">{value}</p>
      {hint && <p className="mt-auto truncate pt-0.5 text-xs text-slate-400">{hint}</p>}
    </div>
  )
}

export function StateChip({ owner }: { owner: AdminOwner }) {
  const s = stateInfo(owner)
  return <span className={`chip whitespace-nowrap font-semibold ${s.cls}`}>{s.label}</span>
}

/** Estado en una etiqueta y su detalle debajo ("Prueba" / "Quedan 11 días") */
export function StateCell({ owner }: { owner: AdminOwner }) {
  return (
    <span className="block min-w-0">
      <StateChip owner={owner} />
      <span className="mt-1 block truncate text-xs text-slate-500">{stateInfo(owner).detail}</span>
    </span>
  )
}

/** Primeros pasos en barritas: ■■■□□□ 3/6 */
export function StepsBar({ done }: { done: number | null }) {
  if (done === null) return <span className="text-xs text-slate-400">—</span>
  const total = STEPS.length
  const color = done === total ? 'bg-emerald-500' : done <= 1 ? 'bg-amber-400' : 'bg-sky-500'
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap" title={`${done} de ${total} primeros pasos`}>
      <span className="flex gap-0.5">
        {STEPS.map((_, i) => <span key={i} className={`h-1.5 w-3 rounded-full ${i < done ? color : 'bg-slate-200'}`} />)}
      </span>
      <span className="w-7 text-xs tabular-nums text-slate-500">{done}/{total}</span>
    </span>
  )
}

/** Emoji del tipo de negocio en un cuadro (o la inicial del correo si aún no tiene negocio) */
export function BizAvatar({ owner, size = 'h-9 w-9 text-lg' }: { owner: Pick<AdminOwner, 'business_type' | 'name' | 'email'>; size?: string }) {
  return (
    <span className={`flex ${size} shrink-0 items-center justify-center rounded-xl bg-slate-100`} aria-hidden>
      {owner.business_type
        ? businessType(owner.business_type).emoji
        : <span className="text-sm font-bold text-slate-500">{(owner.name || owner.email || '?').trim().charAt(0).toUpperCase()}</span>}
    </span>
  )
}

/** Filtros en píldoras con su número. En el móvil se deslizan de lado */
export function FilterPills<T extends string>({ options, value, onChange }: {
  options: { key: T; label: string; count?: number }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          aria-pressed={value === o.key}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${value === o.key ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-slate-300'}`}
        >
          {o.label}
          {o.count !== undefined && <span className="ml-1 opacity-60">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

/**
 * Ficha que se abre al tocar algo: en el móvil sube desde abajo y en el ordenador sale por la
 * derecha. Las ventanas de confirmar (Modal) se abren por encima.
 */
export function Drawer({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-40 flex items-end lg:items-stretch lg:justify-end" role="dialog" aria-modal="true" aria-label={label}>
      <button aria-label="Cerrar" className="ui-fade absolute inset-0 cursor-default bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="ui-sheet relative flex max-h-[90dvh] w-full flex-col rounded-t-3xl bg-white shadow-2xl lg:h-full lg:max-h-none lg:w-[440px] lg:rounded-none">
        <div className="flex justify-center pt-2.5 lg:hidden" aria-hidden><span className="h-1.5 w-10 rounded-full bg-slate-200" /></div>
        <button onClick={onClose} className="absolute right-3 top-3 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Cerrar">
          <Icon name="x" className="h-5 w-5" />
        </button>
        <div className="safe-bottom min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pt-3 lg:p-6">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

/** Grupo de ajustes: en el ordenador, qué es a la izquierda y sus campos a la derecha */
export function SettingsGroup({ title, desc, children }: { title: string; desc: string; children: ReactNode }) {
  return (
    <section className="grid gap-3 py-6 first:pt-0 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-8">
      <div>
        <h2 className="font-bold">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">{desc}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}
