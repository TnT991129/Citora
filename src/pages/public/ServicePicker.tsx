import { HelpTip } from '../../components/HelpTip'
import { duration, price } from '../../lib/format'
import { hasOptions, type OptionChoice } from '../../lib/serviceOptions'
import type { PublicService } from '../../lib/types'

/** Servicios principales (al menos uno) y, debajo, los complementos opcionales */
export function ServicePicker({ services, selected, onChange, choice, onChoice, currency, rate }: {
  services: PublicService[]
  selected: string[]
  onChange: (ids: string[]) => void
  /** Opción de precio elegida en los servicios que tienen varias (ej. Niño / Adulto) */
  choice: OptionChoice
  onChoice: (choice: OptionChoice) => void
  currency: string
  rate: number | null
}) {
  const main = services.filter((s) => !s.is_extra)
  const extras = services.filter((s) => s.is_extra)
  const item = (s: PublicService) => {
    const on = selected.includes(s.id)
    const opts = hasOptions(s) ? s.options! : null
    const picked = opts?.find((o) => o.id === choice[s.id])
    return (
      <div key={s.id} className={`card space-y-3 transition ${on ? 'border-brand bg-brand/5 ring-1 ring-brand' : 'hover:border-slate-300'}`}>
        <button
          type="button"
          onClick={() => onChange(on ? selected.filter((x) => x !== s.id) : [...selected, s.id])}
          aria-pressed={on}
          className="flex w-full items-center gap-3 text-left transition active:scale-[0.99]"
        >
          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${on ? 'border-brand bg-brand text-white' : 'border-slate-300'}`}>
            {on && <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12l5 5 9-10" /></svg>}
          </span>
          {s.photo_url && <img src={s.photo_url} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />}
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{s.is_extra ? '+ ' : ''}{s.name}</span>
            {s.description && <span className="line-clamp-1 text-sm text-slate-500">{s.description}</span>}
            <span className="block text-sm text-slate-500">{s.is_extra ? `+${duration(s.duration_min)}` : duration(s.duration_min)}</span>
          </span>
          <span className={`shrink-0 text-right font-bold ${on ? 'text-brand' : ''}`}>
            {picked ? price(picked.price, currency, rate) : opts ? <><span className="text-xs font-medium text-slate-500">desde </span>{price(s.price, currency, rate)}</> : price(s.price, currency, rate)}
          </span>
        </button>
        {on && opts && (
          <div className="border-t border-brand/15 pt-3">
            <p className={`mb-2 text-xs font-semibold ${picked ? 'text-slate-500' : 'text-brand'}`}>{picked ? 'Opción elegida' : 'Elige una opción'}</p>
            <div className="flex flex-wrap gap-2">
              {opts.map((o) => {
                const active = o.id === picked?.id
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => onChoice({ ...choice, [s.id]: o.id })}
                    aria-pressed={active}
                    className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 transition ${active ? 'bg-brand text-white ring-brand' : 'bg-white text-slate-700 ring-slate-300 hover:ring-brand'}`}
                  >
                    {o.name} · {price(o.price, currency, rate)}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-500">Puedes elegir varios.</p>
      {main.map(item)}
      {extras.length > 0 && (
        <>
          <h2 className="flex items-center gap-1.5 pt-3 font-bold">
            Complementos <span className="font-normal text-slate-500">(opcional)</span>
            <HelpTip text="Se añaden a un servicio principal (ej. un diseño junto con la manicura). No se pueden reservar solos." />
          </h2>
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
