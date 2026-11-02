// Opciones de precio de un servicio (ej. Corte: Niño / Adulto). El precio de verdad lo calcula la
// base de datos (_chosen_services); esto solo lo muestra igual mientras el cliente elige.
import type { ServiceOption } from './types'

/** Opción elegida de cada servicio: { id del servicio: id de la opción } */
export type OptionChoice = Record<string, string>

type WithOptions = { id: string; name: string; price: number; options?: ServiceOption[] | null }

export function hasOptions(s: { options?: ServiceOption[] | null }): boolean {
  return (s.options?.length || 0) > 0
}

/** Los servicios con el nombre y el precio de su opción elegida, igual que quedan en la cita */
export function applyOptions<T extends WithOptions>(list: T[], choice: OptionChoice): T[] {
  return list.map((s) => {
    const o = s.options?.find((x) => x.id === choice[s.id])
    return o ? { ...s, name: `${s.name} · ${o.name}`, price: Number(o.price) } : s
  })
}

/** El primer servicio elegido que tiene opciones y al que todavía no se le eligió ninguna */
export function missingOption<T extends WithOptions>(list: T[], selected: string[], choice: OptionChoice): T | undefined {
  return list.find((s) => selected.includes(s.id) && hasOptions(s) && !s.options!.some((o) => o.id === choice[s.id]))
}

/** Solo las opciones de los servicios elegidos, para mandarlas a la base de datos */
export function optionsFor(selected: string[], choice: OptionChoice): OptionChoice {
  return Object.fromEntries(Object.entries(choice).filter(([id]) => selected.includes(id)))
}
