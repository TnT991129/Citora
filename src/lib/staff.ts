import { businessType } from './templates'
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
  /** El tipo de negocio ("Barbería"): título de sus servicios si no ha puesto su especialidad */
  typeName?: string | null
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
      // Los servicios de la casa: su especialidad o, si no la puso, el tipo de negocio ("Barbería")
      title: specialty || owner.typeName?.trim() || name || 'Servicios',
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

type TeamRule = Pick<PublicStaff, 'id' | 'service_ids' | 'all_services'>

/**
 * Los servicios que cuentan para saber quién atiende (como _required_services en la base de datos):
 * todos menos los extras que no son de nadie del equipo (un extra del dueño se puede sumar a la
 * manicura de una profesional).
 */
export function requiredIds(ids: string[], services: { id: string; is_extra?: boolean }[], team: TeamRule[]): string[] {
  return ids.filter((id) => {
    const s = services.find((x) => x.id === id)
    return !(s?.is_extra && !team.some((st) => st.service_ids.includes(id)))
  })
}

/**
 * Quién puede atender estos servicios (como _free_staff): alguien del equipo, el dueño (si ninguno es
 * de nadie del equipo y nadie del equipo puede con ellos) o nadie (son de personas distintas).
 */
export function whoAttends(ids: string[], services: { id: string; is_extra?: boolean }[], team: TeamRule[]): 'equipo' | 'dueno' | null {
  if (team.length === 0) return 'dueno'
  const req = requiredIds(ids, services, team)
  if (team.some((st) => staffDoes(st, req))) return 'equipo'
  if (req.every((id) => !team.some((st) => st.service_ids.includes(id)))) return 'dueno'
  return null
}

/** El aviso cuando se mezclan servicios de personas distintas en una sola cita */
export const MIXED_PEOPLE = 'Estos servicios los hacen personas distintas del equipo y nadie hace todos. Reserva primero uno y después haz otra reserva para el otro.'

/** Los datos del dueño para agrupar los servicios, sacados de su negocio */
export function ownerInfo(b: { owner_name?: string | null; owner_specialty?: string | null; logo_url?: string | null; business_type?: string | null }): OwnerInfo {
  const bt = businessType(b.business_type)
  const type = bt.key !== 'otro' ? bt.name : null
  return { name: b.owner_name, specialty: b.owner_specialty, photo_url: b.logo_url, typeName: type }
}
