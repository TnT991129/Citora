/** Cuántos clientes pueden reservar a la misma hora (1 a 50), con botones − y + */
export function CapacityStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const btn = 'flex h-12 w-12 items-center justify-center rounded-xl text-2xl font-bold ring-1 ring-slate-300 transition hover:bg-slate-100 disabled:opacity-30'
  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={() => onChange(Math.max(1, value - 1))} disabled={value <= 1} className={btn} aria-label="Uno menos">−</button>
      <span className="min-w-[3rem] text-center text-3xl font-extrabold" aria-live="polite">{value}</span>
      <button type="button" onClick={() => onChange(Math.min(50, value + 1))} disabled={value >= 50} className={btn} aria-label="Uno más">+</button>
      <span className="text-sm text-slate-600">{value === 1 ? 'cliente por turno' : 'clientes por turno'}</span>
    </div>
  )
}
