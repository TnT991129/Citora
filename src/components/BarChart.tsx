import { useState } from 'react'

export interface Bar {
  label: string // etiqueta corta del eje (ej. "oct")
  value: number
  tip?: string // texto completo del tooltip (ej. "Octubre 2026 · 12 citas")
}

/**
 * Barras verticales de una sola serie. Al pasar el dedo o el ratón se ve el valor.
 * `barClass` pone el color (ej. "bg-brand" o "bg-citora-500").
 */
export function BarChart({ bars, barClass = 'bg-brand', height = 140, format = String, labelEvery = 1 }: {
  bars: Bar[]
  barClass?: string
  height?: number
  format?: (n: number) => string
  labelEvery?: number
}) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...bars.map((b) => b.value))
  const active = hover === null ? null : bars[hover]

  return (
    <div>
      <div className="mb-1 h-5 text-sm font-semibold text-slate-700" aria-live="polite">
        {active ? active.tip || `${active.label}: ${format(active.value)}` : <span className="font-normal text-slate-400">Máximo {format(max)}</span>}
      </div>
      <div
        className="relative flex items-end gap-[2px] border-b border-slate-200"
        style={{ height }}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label={bars.map((b) => `${b.label} ${format(b.value)}`).join(', ')}
      >
        {/* línea guía a la mitad */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-slate-100" />
        {bars.map((b, i) => (
          <button
            key={i}
            type="button"
            className="group relative flex h-full min-w-0 flex-1 items-end"
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onClick={() => setHover(i)}
            aria-label={b.tip || `${b.label}: ${format(b.value)}`}
          >
            <span
              className={`block w-full rounded-t-[4px] transition-opacity ${barClass} ${hover !== null && hover !== i ? 'opacity-40' : ''}`}
              style={{ height: b.value > 0 ? `${Math.max(2, (b.value / max) * 100)}%` : 0 }}
            />
          </button>
        ))}
      </div>
      <div className="mt-1 flex gap-[2px]">
        {bars.map((b, i) => (
          <span key={i} className="min-w-0 flex-1 truncate text-center text-[10px] text-slate-500">
            {i % labelEvery === 0 ? b.label : ''}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Barras horizontales con nombre y valor (ranking) */
export function RankBars({ items, barClass = 'bg-brand', format = String }: {
  items: { label: string; value: number; extra?: string }[]
  barClass?: string
  format?: (n: number) => string
}) {
  const max = Math.max(1, ...items.map((i) => i.value))
  return (
    <ul className="space-y-2.5">
      {items.map((it, i) => (
        <li key={i}>
          <div className="flex justify-between gap-2 text-sm">
            <span className="truncate font-medium text-slate-700">{it.label}</span>
            <span className="shrink-0 text-slate-600">{format(it.value)}{it.extra ? <span className="text-slate-400"> · {it.extra}</span> : null}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-slate-100">
            <div className={`h-2 rounded-full ${barClass}`} style={{ width: `${Math.max(2, (it.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}
