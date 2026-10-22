import { duration, price } from '../../lib/format'
import type { PublicService } from '../../lib/types'

/** Servicios principales (al menos uno) y, debajo, los complementos opcionales */
export function ServicePicker({ services, selected, onChange, currency, rate }: {
  services: PublicService[]
  selected: string[]
  onChange: (ids: string[]) => void
  currency: string
  rate: number | null
}) {
  const main = services.filter((s) => !s.is_extra)
  const extras = services.filter((s) => s.is_extra)
  const item = (s: PublicService) => {
    const on = selected.includes(s.id)
    return (
      <button
        key={s.id}
        type="button"
        onClick={() => onChange(on ? selected.filter((x) => x !== s.id) : [...selected, s.id])}
        className={`card flex w-full items-center gap-3 text-left transition ${on ? 'ring-2 ring-brand' : ''}`}
      >
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${on ? 'border-brand bg-brand text-white' : 'border-slate-300'}`}>
          {on && <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12l5 5 9-10" /></svg>}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{s.is_extra ? '+ ' : ''}{s.name}</span>
          <span className="block text-sm text-slate-500">{s.is_extra ? `+${duration(s.duration_min)}` : duration(s.duration_min)}</span>
        </span>
        <span className="shrink-0 text-right font-semibold">{price(s.price, currency, rate)}</span>
      </button>
    )
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-500">Puedes elegir varios.</p>
      {main.map(item)}
      {extras.length > 0 && (
        <>
          <h2 className="pt-3 font-bold">Complementos <span className="font-normal text-slate-500">(opcional)</span></h2>
          {extras.map(item)}
        </>
      )}
    </div>
  )
}

/** ¿Hay al menos un servicio principal entre los elegidos? */
export function hasMainService(services: PublicService[], selected: string[]): boolean {
  return services.some((s) => !s.is_extra && selected.includes(s.id))
}
