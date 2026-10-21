/** Número con botones − y +. Por defecto, para "clientes por turno" (1 a 50); se puede reutilizar para otros contadores. */
export function CapacityStepper({ value, onChange, min = 1, max = 50, unit, size = 'lg' }: {
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
  unit?: (n: number) => string
  size?: 'lg' | 'sm'
}) {
  const label = unit ? unit(value) : value === 1 ? 'cliente por turno' : 'clientes por turno'
  const big = size === 'lg'
  const btn = `flex items-center justify-center rounded-xl font-bold ring-1 ring-slate-300 transition hover:bg-slate-100 disabled:opacity-30 ${big ? 'h-12 w-12 text-2xl' : 'h-10 w-10 text-lg'}`
  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} className={btn} aria-label="Uno menos">−</button>
      <span className={`min-w-[3rem] text-center font-extrabold ${big ? 'text-3xl' : 'text-xl'}`} aria-live="polite">{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} className={btn} aria-label="Uno más">+</button>
      {label && <span className="text-sm text-slate-600">{label}</span>}
    </div>
  )
}
