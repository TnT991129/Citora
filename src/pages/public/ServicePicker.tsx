import { HelpTip } from '../../components/HelpTip'
import { duration, price } from '../../lib/format'
import { hasOptions, pickedOptions, toggleOption, type OptionChoice } from '../../lib/serviceOptions'
import { groupServices, type OwnerInfo, type ServiceGroup } from '../../lib/staff'
import type { PublicService, PublicStaff } from '../../lib/types'

/** Servicios principales (al menos uno) y, debajo, los complementos opcionales */
export function ServicePicker({ services, selected, onChange, choice, onChoice, currency, rate, team = [], owner }: {
  services: PublicService[]
  selected: string[]
  onChange: (ids: string[]) => void
  /** Opciones de precio elegidas en los servicios que las tienen */
  choice: OptionChoice
  onChoice: (choice: OptionChoice) => void
  currency: string
  rate: number | null
  /** Con equipo, los servicios salen agrupados por la especialidad de quien los hace */
  team?: PublicStaff[]
  /** El dueño, que también atiende (sus servicios salen con su nombre y su especialidad) */
  owner?: OwnerInfo
}) {
  const main = services.filter((s) => !s.is_extra)
  const groups = groupServices(main, team, owner)
  const extras = services.filter((s) => s.is_extra)
  const item = (s: PublicService) => {
    const on = selected.includes(s.id)
    const opts = hasOptions(s) ? s.options! : null
    const picked = pickedOptions(s, choice)
    const pickedTotal = picked.reduce((a, o) => a + Number(o.price), 0)
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
            {picked.length ? price(pickedTotal, currency, rate) : opts ? <><span className="text-xs font-medium text-slate-500">desde </span>{price(s.price, currency, rate)}</> : price(s.price, currency, rate)}
          </span>
        </button>
        {on && opts && (
          <div className="border-t border-brand/15 pt-3">
            <p className={`mb-2 text-xs font-semibold ${picked.length ? 'text-slate-500' : 'text-brand'}`}>
              {s.multi_options ? 'Elige una o varias opciones' : picked.length ? 'Opción elegida' : 'Elige una opción'}
            </p>
            <div className="flex flex-wrap gap-2">
              {opts.map((o) => {
                const active = picked.includes(o)
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => onChoice(toggleOption(s, choice, o.id))}
                    aria-pressed={active}
                    className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 transition ${active ? 'bg-brand text-white ring-brand' : 'bg-white text-slate-700 ring-slate-300 hover:ring-brand'}`}
                  >
                    {s.multi_options && active ? '✓ ' : ''}{o.name} · {price(o.price, currency, rate)}
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
      <GroupJump groups={groups} />
      {groups.map((g) => (
        <div key={g.key} id={`grupo-${g.key}`} className="scroll-mt-20 space-y-2">
          {g.title && <GroupTitle group={g} />}
          {g.services.map(item)}
        </div>
      ))}
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

/** Título de un grupo de servicios: la foto y la especialidad de quien los hace ("Uñas · con Yaneisy") */
export function GroupTitle({ group }: { group: ServiceGroup<unknown> }) {
  const st = group.staff
  return (
    <div className="flex items-center gap-3 px-1 pt-3">
      {st ? (
        st.photo_url ? (
          <img src={st.photo_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover ring-2 ring-brand/15" />
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 font-bold text-brand">{st.name.trim().charAt(0).toUpperCase()}</span>
        )
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand" aria-hidden>
          {/* Los de la casa: una tienda; los que hacen varias personas: un grupo */}
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d={group.key === 'varios'
              ? 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8'
              : 'M4 4h16l1 5a3 3 0 01-6 0 3 3 0 01-6 0 3 3 0 01-6 0zM5 12v9h14v-9M10 21v-5h4v5'} />
          </svg>
        </span>
      )}
      <div className="min-w-0">
        <h3 className="truncate font-extrabold leading-tight">{group.title}</h3>
        {st && group.title !== st.name && <p className="truncate text-sm text-slate-500">con {st.name.split(' ')[0]}</p>}
      </div>
    </div>
  )
}

/** Con tres grupos o más: unas pestañas arriba para saltar a cada uno */
export function GroupJump({ groups }: { groups: ServiceGroup<unknown>[] }) {
  if (groups.length < 3) return null
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {groups.map((g) => (
        <button
          key={g.key}
          type="button"
          onClick={() => document.getElementById(`grupo-${g.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          className="shrink-0 rounded-full bg-white px-3.5 py-1.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:ring-brand"
        >
          {g.title}
        </button>
      ))}
    </div>
  )
}
