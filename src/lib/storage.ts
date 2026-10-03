// localStorage con protección: en modo privado o con datos bloqueados puede fallar
export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* sin almacenamiento disponible */
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* nada */
  }
}

// Citas que el cliente reservó desde este móvil (por negocio)
export interface SavedBooking {
  token: string
  starts_at: string
  slug: string
}

export function savedBookings(slug: string): SavedBooking[] {
  return load<SavedBooking[]>('citora:citas', []).filter((b) => b.slug === slug)
}

export function rememberBooking(b: SavedBooking): void {
  const all = load<SavedBooking[]>('citora:citas', []).filter((x) => x.token !== b.token)
  all.unshift(b)
  save('citora:citas', all.slice(0, 30))
}

export function forgetBooking(token: string): void {
  save('citora:citas', load<SavedBooking[]>('citora:citas', []).filter((x) => x.token !== token))
}
