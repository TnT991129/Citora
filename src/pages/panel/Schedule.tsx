import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CapacityStepper } from '../../components/CapacityStepper'
import { TimeChips } from '../../components/TimeChips'
import { Alert, Button, PageLoader, Toggle, flash } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { normalizeSlot, todayKey, WEEKDAYS, dayTitle } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import type { ClosedDay, ScheduleDay } from '../../lib/types'
import { usePanel } from './context'

const ORDER = [1, 2, 3, 4, 5, 6, 0]

export default function Schedule() {
  const { business, reloadBusiness, staff, link } = usePanel()
  const hasTeam = staff.some((s) => s.active)
  const [days, setDays] = useState<ScheduleDay[] | null>(null)
  const [closed, setClosed] = useState<ClosedDay[]>([])
  const [newClosed, setNewClosed] = useState('')
  const [reason, setReason] = useState('')
  const [capacity, setCapacity] = useState(business.slot_capacity || 1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    ;(async () => {
      const [{ data: d }, { data: c }] = await Promise.all([
        supabase.from('schedule_days').select('*'),
        supabase.from('closed_days').select('*').gte('day', todayKey(business.timezone)).order('day'),
      ])
      const map = new Map((d as ScheduleDay[] | null || []).map((x) => [x.weekday, x]))
      setDays(ORDER.map((w) => {
        const x = map.get(w)
        return { business_id: business.id, weekday: w, is_open: x?.is_open ?? false, slots: (x?.slots || []).map(normalizeSlot) }
      }))
      setClosed((c as ClosedDay[]) || [])
    })()
  }, [business.id, business.timezone])

  const updateDay = (w: number, patch: Partial<ScheduleDay>) => {
    setDirty(true)
    setDays((ds) => ds!.map((d) => (d.weekday === w ? { ...d, ...patch } : d)))
  }

  const copyToAll = (from: ScheduleDay) => {
    setDirty(true)
    setDays((ds) => ds!.map((d) => (d.is_open ? { ...d, slots: [...from.slots] } : d)))
    flash('Copiado a los días abiertos')
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    const { error: e1 } = await supabase.from('schedule_days').upsert(days!.map((d) => ({ ...d, business_id: business.id })))
    const { error: e2 } = await supabase.from('businesses').update({ slot_capacity: capacity }).eq('id', business.id)
    setBusy(false)
    if (e1 || e2) return setError(errorMessage(e1 || e2))
    setDirty(false)
    flash('Horario guardado')
    reloadBusiness()
  }

  const addClosed = async () => {
    if (!newClosed) return
    const { error } = await supabase.from('closed_days').upsert({ business_id: business.id, day: newClosed, reason: reason.trim() || null })
    if (error) return setError(errorMessage(error))
    setClosed((c) => [...c.filter((x) => x.day !== newClosed), { business_id: business.id, day: newClosed, reason: reason.trim() || null }].sort((a, b) => a.day.localeCompare(b.day)))
    setNewClosed('')
    setReason('')
  }

  const removeClosed = async (day: string) => {
    await supabase.from('closed_days').delete().eq('business_id', business.id).eq('day', day)
    setClosed((c) => c.filter((x) => x.day !== day))
  }

  if (!days) return <PageLoader />

  return (
    <div className="space-y-5 pb-16">
      <h1 className="text-2xl font-extrabold">Horario</h1>

      <section id="clientes-por-turno" className="card scroll-mt-20 space-y-3 ring-2 ring-brand/20">
        <div>
          <h2 className="text-lg font-bold">Clientes por turno</h2>
          <p className="text-sm text-slate-500">
            Cuántos clientes pueden reservar a la misma hora. Por ejemplo, si tienes 2 manicuras trabajando a la vez, pon 2.
          </p>
        </div>
        <CapacityStepper value={capacity} onChange={(n) => { setDirty(true); setCapacity(n) }} />
        {hasTeam && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Tienes profesionales en Equipo: cada uno atiende a un cliente a la vez. Este número se aplica a las citas sin profesional asignado.
          </p>
        )}
        {dirty && <p className="text-sm font-semibold text-brand">Recuerda pulsar «Guardar cambios» abajo.</p>}
      </section>

      <p className="text-sm text-slate-500">Para cada día, las horas a las que puede empezar una cita.</p>

      <div className="space-y-3">
        {days.map((d) => (
          <div key={d.weekday} className="card">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{WEEKDAYS[d.weekday]}</span>
              <div className="flex items-center gap-3">
                {d.is_open && d.slots.length > 0 && (
                  <button onClick={() => copyToAll(d)} className="text-xs font-semibold text-brand">Copiar a todos</button>
                )}
                <Toggle checked={d.is_open} onChange={(v) => updateDay(d.weekday, { is_open: v })} label={`Abrir ${WEEKDAYS[d.weekday]}`} />
              </div>
            </div>
            {d.is_open ? (
              <div className="mt-3"><TimeChips value={d.slots} onChange={(slots) => updateDay(d.weekday, { slots })} /></div>
            ) : (
              <p className="mt-1 text-sm text-slate-400">Cerrado</p>
            )}
          </div>
        ))}
      </div>

      <p className="text-sm text-slate-500">
        La antelación mínima para reservar y los plazos para cancelar o cambiar están en <Link to={link('politicas')} className="font-semibold text-brand">Políticas</Link>.
      </p>

      <section className="card space-y-3">
        <h2 className="font-bold">Días cerrados</h2>
        <p className="text-sm text-slate-500">Vacaciones, feriados o días libres. Esos días no se podrá reservar.</p>
        <div className="flex flex-wrap gap-2">
          <input type="date" className="input w-auto" min={todayKey(business.timezone)} value={newClosed} onChange={(e) => setNewClosed(e.target.value)} />
          <input className="input w-auto flex-1" placeholder="Motivo (opcional)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button variant="secondary" onClick={addClosed} disabled={!newClosed}>Añadir</Button>
        </div>
        <ul className="divide-y divide-slate-100">
          {closed.map((c) => (
            <li key={c.day} className="flex items-center justify-between py-2">
              <span>{dayTitle(c.day)}{c.reason && <span className="normal-case text-slate-500"> · {c.reason}</span>}</span>
              <button onClick={() => removeClosed(c.day)} className="text-sm font-semibold text-red-600">Quitar</button>
            </li>
          ))}
          {closed.length === 0 && <li className="py-2 text-sm text-slate-400">Ninguno</li>}
        </ul>
      </section>

      {error && <Alert>{error}</Alert>}

      {dirty && (
        <div className="fixed inset-x-0 bottom-16 z-30 px-4 md:bottom-4">
          <div className="mx-auto max-w-4xl">
            <Button block size="lg" onClick={save} loading={busy} className="shadow-xl">Guardar cambios</Button>
          </div>
        </div>
      )}
    </div>
  )
}
