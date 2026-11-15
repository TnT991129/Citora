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
  /** 'dueno' (los del dueño), 'varios' (los que hacen varias personas del equipo) o el id del profesional */
  key: string
  /** Su especialidad o su nombre; null = sin título (no hay grupos) */
  title: string | null
  /** Quién los hace (el dueño también, con la foto del logo); null en "varios" */
  staff: Pick<PublicStaff, 'id' | 'name' | 'photo_url' | 'specialty'> | null
  services: S[]
}

/** El dueño, que también atiende: su nombre, su especialidad y, como foto, el logo del negocio */
export interface OwnerInfo {
  name?: string | null
  specialty?: string | null
  photo_url?: string | null
}

/**
 * Agrupa los servicios por quién los hace: los de un solo profesional, bajo su especialidad; los que
 * no son de nadie del equipo son del dueño (también atiende), bajo la suya; y los que hacen varias
 * personas, en "Con varias personas del equipo". Si sale un solo grupo, se devuelve sin título (la
 * página se ve como siempre).
 */
export function groupServices<S extends { id: string }>(
  services: S[],
  team: Pick<PublicStaff, 'id' | 'name' | 'photo_url' | 'specialty' | 'service_ids' | 'all_services'>[],
  owner: OwnerInfo = {},
): ServiceGroup<S>[] {
  const explicit = team.filter((st) => !(st.all_services ?? st.service_ids.length === 0))
  const byKey = new Map<string, S[]>()
  for (const s of services) {
    const doers = explicit.filter((st) => st.service_ids.includes(s.id))
    const key = doers.length === 1 ? doers[0].id : doers.length > 1 ? 'varios' : 'dueno'
    byKey.set(key, [...(byKey.get(key) || []), s])
  }
  const groups: ServiceGroup<S>[] = []
  if (byKey.has('dueno')) {
    const name = owner.name?.trim() || ''
    const specialty = owner.specialty?.trim() || ''
    groups.push({
      key: 'dueno',
      title: specialty || name || 'Más servicios',
      staff: name ? { id: 'dueno', name, photo_url: owner.photo_url || null, specialty: specialty || null } : null,
      services: byKey.get('dueno')!,
    })
  }
  for (const st of team) {
    const list = byKey.get(st.id)
    if (list) groups.push({ key: st.id, title: st.specialty?.trim() || st.name, staff: st, services: list })
  }
  if (byKey.has('varios')) groups.push({ key: 'varios', title: 'Con varias personas del equipo', staff: null, services: byKey.get('varios')! })
  if (groups.length <= 1) return [{ key: 'todos', title: null, staff: null, services }]
  return groups
}
