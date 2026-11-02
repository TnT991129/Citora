// Opciones de precio dentro de un servicio. El precio de verdad lo calcula la base de datos
// (_chosen_services); esto solo lo muestra igual mientras el cliente elige.
import type { ServiceOption } from './types'

/** Opciones elegidas de cada servicio: { id del servicio: [ids de las opciones] } */
export type OptionChoice = Record<string, string[]>

type WithOptions = { id: string; name: string; price: number; options?: ServiceOption[] | null; multi_options?: boolean }

export function hasOptions(s: { options?: ServiceOption[] | null }): boolean {
  return (s.options?.length || 0) > 0
}

/** Las opciones elegidas de un servicio, en el orden en que las puso el dueño */
export function pickedOptions(s: WithOptions, choice: OptionChoice): ServiceOption[] {
  const ids = choice[s.id] || []
  return (s.options || []).filter((o) => ids.includes(o.id))
}

/** Marca o desmarca una opción: si el servicio solo admite una, sustituye a la anterior */
export function toggleOption(s: WithOptions, choice: OptionChoice, optionId: string): OptionChoice {
  const ids = choice[s.id] || []
  const next = ids.includes(optionId) ? ids.filter((x) => x !== optionId) : s.multi_options ? [...ids, optionId] : [optionId]
  return { ...choice, [s.id]: next }
}

/** Los servicios con el nombre y el precio de sus opciones elegidas, igual que quedan en la cita */
export function applyOptions<T extends WithOptions>(list: T[], choice: OptionChoice): T[] {
  return list.map((s) => {
    const picked = pickedOptions(s, choice)
    if (!picked.length) return s
    return { ...s, name: `${s.name} · ${picked.map((o) => o.name).join(' + ')}`, price: picked.reduce((a, o) => a + Number(o.price), 0) }
  })
}

/** El primer servicio elegido que tiene opciones y al que todavía no se le eligió ninguna */
export function missingOption<T extends WithOptions>(list: T[], selected: string[], choice: OptionChoice): T | undefined {
  return list.find((s) => selected.includes(s.id) && hasOptions(s) && pickedOptions(s, choice).length === 0)
}

/** Solo las opciones de los servicios elegidos, para mandarlas a la base de datos (nada si no hay) */
export function optionsFor(selected: string[], choice: OptionChoice): OptionChoice | undefined {
  const picked = Object.entries(choice).filter(([id, ids]) => selected.includes(id) && ids.length > 0)
  return picked.length ? Object.fromEntries(picked) : undefined
}
