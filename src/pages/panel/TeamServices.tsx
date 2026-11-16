// "Repartir servicios": el dueño dice, servicio por servicio, quién del equipo lo hace. Cada
// profesional empieza con lo que hace hoy (si hacía de todo, con todo marcado). Lo que no tiene a
// nadie es del dueño. Se guarda de una vez en el servidor (owner_set_team_services).
import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Modal, flash } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { money } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import type { Service, Staff } from '../../lib/types'
import { usePanel } from './context'

export function DistributeServices({ onClose }: { onClose: () => void }) {
  const { business, services, staff, reloadStaff } = usePanel()
  const team = useMemo(() => staff.filter((s) => s.active), [staff])
  const list = useMemo(() => [...services.filter((s) => !s.is_extra), ...services.filter((s) => s.is_extra)], [services])
  const [map, setMap] = useState<Record<string, Set<string>> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmEmpty, setConfirmEmpty] = useState<Staff[] | null>(null)

  useEffect(() => {
    supabase.from('staff_services').select('staff_id, service_id').then(({ data, error }) => {
      if (error) return setError(errorMessage(error))
      const rows = (data as { staff_id: string; service_id: string }[]) || []
      const m: Record<string, Set<string>> = {}
      for (const st of team) {
        const own = rows.filter((r) => r.staff_id === st.id).map((r) => r.service_id)
        // Hacía de todo: empieza con todo marcado (así, si guarda sin tocar, nada cambia)
        m[st.id] = new Set(own.length === 0 && !st.own_services ? services.map((s) => s.id) : own)
      }
      setMap(m)
    })
  }, [team, services])

  const toggle = (staffId: string, serviceId: string) =>
    setMap((m) => {
      const next = new Set(m![staffId])
      if (next.has(serviceId)) next.delete(serviceId)
      else next.add(serviceId)
      return { ...m!, [staffId]: next }
    })

  const save = async (force = false) => {
    if (!map) return
    const empty = team.filter((st) => map[st.id].size === 0)
    if (empty.length > 0 && !force) return setConfirmEmpty(empty)
    setConfirmEmpty(null)
    setBusy(true)
    setError(null)
    const payload = Object.fromEntries(team.map((st) => [st.id, [...map[st.id]]]))
    const { error } = await supabase.rpc('owner_set_team_services', { p_map: payload })
    setBusy(false)
    if (error) return setError(errorMessage(error))
    flash('Servicios repartidos. Tus clientes ya los ven así.')
    await reloadStaff()
    onClose()
  }

  const who = (s: Service) => (map ? team.filter((st) => map[st.id].has(s.id)) : [])

  return (
    <Modal
      open
      onClose={onClose}
      title="Repartir servicios"
      footer={
        <div className="space-y-2">
        {confirmEmpty && (
            <Alert kind="warning">
              <b>{confirmEmpty.map((st) => st.name.split(' ')[0]).join(', ')}</b> se {confirmEmpty.length === 1 ? 'queda' : 'quedan'} sin servicios: no se podrá reservar con {confirmEmpty.length === 1 ? 'ella' : 'ellas'} hasta que {confirmEmpty.length === 1 ? 'cree' : 'creen'} los suyos con su enlace.
              <span className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => save(true)} loading={busy}>Guardar igualmente</Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmEmpty(null)}>Revisar</Button>
              </span>
            </Alert>
          )}
          <Button block size="lg" onClick={() => save()} loading={busy} disabled={!map}>Guardar el reparto</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Toca en cada servicio a quién lo hace (puede ser más de una persona). Lo que no tenga a nadie marcado lo haces tú.
          Tus clientes verán los servicios agrupados por persona.
        </p>
        {!map ? (
          <p className="text-sm text-slate-400">Cargando…</p>
        ) : (
          <ul className="space-y-2.5">
            {list.map((s) => {
              const people = who(s)
              return (
                <li key={s.id} className={`rounded-2xl p-3 ring-1 ring-slate-200 ${s.active ? '' : 'opacity-60'}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate font-semibold">{s.is_extra ? '+ ' : ''}{s.name}</p>
                    <span className="shrink-0 text-sm text-slate-500">{money(s.price, business.currency)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {team.map((st) => {
                      const on = map[st.id].has(s.id)
                      return (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => toggle(st.id, s.id)}
                          aria-pressed={on}
                          className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${on ? 'bg-brand text-white shadow-sm' : 'bg-white text-slate-600 ring-1 ring-slate-300'}`}
                        >
                          {on ? '✓ ' : ''}{st.name.split(' ')[0]}
                        </button>
                      )
                    })}
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500">
                    {people.length === 0 ? 'Lo haces tú' : people.length === 1 ? `Solo ${people[0].name.split(' ')[0]}` : `${people.length} personas: el cliente elige con quién`}
                  </p>
                </li>
              )
            })}
          </ul>
        )}
        {error && <Alert>{error}</Alert>}
      </div>
    </Modal>
  )
}
