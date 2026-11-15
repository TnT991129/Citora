import type { PublicStaff } from './types'

/**
 * ¿Hace este profesional todos estos servicios? Como en la base de datos (_staff_can_do): si no
 * tiene ninguno marcado hace todos, salvo si tiene servicios propios (all_services = false).
 */
export function staffDoes(s: Pick<PublicStaff, 'service_ids' | 'all_services'>, serviceIds: string[]): boolean {
  const all = s.all_services ?? s.service_ids.length === 0
  return all || serviceIds.every((id) => s.service_ids.includes(id))
}

/**
 * Profesional que queda elegido al cambiar los servicios: el mismo si los hace todos; si no (o ya
 * no está en el equipo), null = "Cualquiera disponible". Sin esto, el cliente se quedaba con alguien
 * que no hace ese servicio y no le salía ninguna hora libre en ningún día.
 */
export function keepStaff(team: Pick<PublicStaff, 'id' | 'service_ids' | 'all_services'>[], staffId: string | null, serviceIds: string[]): string | null {
  if (!staffId) return null
  const s = team.find((x) => x.id === staffId)
  return s && staffDoes(s, serviceIds) ? staffId : null
}

export interface ServiceGroup<S> {
  /** 'salon' para los servicios de todos, o el id del profesional */
  key: string
  /** Su especialidad o su nombre; null = sin título (no hay grupos) */
  title: string | null
  staff: Pick<PublicStaff, 'id' | 'name' | 'photo_url' | 'specialty'> | null
  services: S[]
}

/**
 * Agrupa los servicios por quién los hace: los que hace solo un profesional (con servicios propios
 * o marcados) van bajo su especialidad; el resto, en "Del salón". Si sale un solo grupo, se devuelve
 * sin título (la página se ve como siempre).
 */
export function groupServices<S extends { id: string }>(
  services: S[],
  team: Pick<PublicStaff, 'id' | 'name' | 'photo_url' | 'specialty' | 'service_ids' | 'all_services'>[],
  salonTitle = 'Del salón',
): ServiceGroup<S>[] {
  const explicit = team.filter((st) => !(st.all_services ?? st.service_ids.length === 0))
  const byKey = new Map<string, S[]>()
  for (const s of services) {
    const owners = explicit.filter((st) => st.service_ids.includes(s.id))
    const key = owners.length === 1 ? owners[0].id : 'salon'
    byKey.set(key, [...(byKey.get(key) || []), s])
  }
  const groups: ServiceGroup<S>[] = []
  if (byKey.has('salon')) groups.push({ key: 'salon', title: salonTitle, staff: null, services: byKey.get('salon')! })
  for (const st of team) {
    const list = byKey.get(st.id)
    if (list) groups.push({ key: st.id, title: st.specialty?.trim() || st.name, staff: st, services: list })
  }
  if (groups.length <= 1) return [{ key: 'todos', title: null, staff: null, services }]
  return groups
}
