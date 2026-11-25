import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CapacityStepper } from '../../components/CapacityStepper'
import { TimeChips } from '../../components/TimeChips'
import { Alert, Button, PageLoader, Toggle, flash } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { normalizeSlot, time12, todayKey, WEEKDAYS, dayTitle } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import type { ClosedDay, ClosedSlot, ScheduleDay } from '../../lib/types'
import { usePanel } from './context'
import { useModule } from './Locked'
import { t } from '../../lib/i18n'

const ORDER = [1, 2, 3, 4, 5, 6, 0]

export default function Schedule() {
  const { business, reloadBusiness, staff, link } = usePanel()
  const hasTeam = staff.some((s) => s.active)
  // Varios clientes a la misma hora es del plan Equipo (y de la prueba gratis), como en _free_lane
  const canMany = useModule('empleados')
  const [days, setDays] = useState<ScheduleDay[] | null>(null)
  const [closed, setClosed] = useState<ClosedDay[]>([])
  const [newClosed, setNewClosed] = useState('')
  const [reason, setReason] = useState('')
  const [slots, setSlots] = useState<ClosedSlot[]>([])
  const [slotDay, setSlotDay] = useState('')
  const [slotStart, setSlotStart] = useState('13:00')
  const [slotEnd, setSlotEnd] = useState('14:00')
  const [slotReason, setSlotReason] = useState('')
  const [capacity, setCapacity] = useState(business.slot_capacity || 1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  // "Opciones avanzadas" plegado al entrar, salvo si ya atiende a varios a la vez o viene de "Clientes por turno"
  const [advancedOpen] = useState(() => (business.slot_capacity || 1) > 1 || window.location.hash === '#clientes-por-turno')

  useEffect(() => {
    ;(async () => {
      const [{ data: d }, { data: c }, { data: cs }] = await Promise.all([
        supabase.from('schedule_days').select('*'),
        supabase.from('closed_days').select('*').gte('day', todayKey(business.timezone)).order('day'),
        supabase.from('closed_slots').select('*').gte('day', todayKey(business.timezone)).order('day').order('start_time'),
      ])
      const map = new Map((d as ScheduleDay[] | null || []).map((x) => [x.weekday, x]))
      setDays(ORDER.map((w) => {
        const x = map.get(w)
        return { business_id: business.id, weekday: w, is_open: x?.is_open ?? false, slots: (x?.slots || []).map(normalizeSlot) }
      }))
      setClosed((c as ClosedDay[]) || [])
      setSlots((cs as ClosedSlot[]) || [])
      setSlotDay(todayKey(business.timezone))
    })()
  }, [business.id, business.timezone])

  const updateDay = (w: number, patch: Partial<ScheduleDay>) => {
    setDirty(true)
    setDays((ds) => ds!.map((d) => (d.weekday === w ? { ...d, ...patch } : d)))
  }

  const copyToAll = (from: ScheduleDay) => {
    setDirty(true)
    setDays((ds) => ds!.map((d) => (d.is_open ? { ...d, slots: [...from.slots] } : d)))
    flash(t('Copiado a los días abiertos'))
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    const { error: e1 } = await supabase.from('schedule_days').upsert(days!.map((d) => ({ ...d, business_id: business.id })))
    const { error: e2 } = await supabase.from('businesses').update({ slot_capacity: capacity }).eq('id', business.id)
    setBusy(false)
    if (e1 || e2) return setError(errorMessage(e1 || e2))
    setDirty(false)
    flash(t('Horario guardado'))
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

  const addSlot = async () => {
    if (!slotDay || slotEnd <= slotStart) return setError(t('Elige un día y un rango de horas válido.'))
    const { data, error } = await supabase.from('closed_slots')
      .insert({ business_id: business.id, day: slotDay, start_time: slotStart, end_time: slotEnd, reason: slotReason.trim() || null })
      .select().single()
    if (error) return setError(errorMessage(error))
    setSlots((s) => [...s, data as ClosedSlot].sort((a, b) => a.day.localeCompare(b.day) || a.start_time.localeCompare(b.start_time)))
    setSlotReason('')
  }

  const removeSlot = async (id: string) => {
    await supabase.from('closed_slots').delete().eq('id', id)
    setSlots((s) => s.filter((x) => x.id !== id))
  }

  if (!days) return <PageLoader />

  return (
    <div className="space-y-5 pb-16">
      <h1 className="text-2xl font-extrabold">{t('Horario')}</h1>


      <p className="text-sm text-slate-500">{t('Para cada día, las horas a las que puede empezar una cita.')}</p>

      <div className="space-y-3">
        {days.map((d) => (
          <div key={d.weekday} className="card">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{WEEKDAYS[d.weekday]}</span>
              <div className="flex items-center gap-3">
                {d.is_open && d.slots.length > 0 && (
                  <button onClick={() => copyToAll(d)} className="text-xs font-semibold text-brand">{t('Copiar a todos')}</button>
                )}
                <Toggle checked={d.is_open} onChange={(v) => updateDay(d.weekday, { is_open: v })} label={t('Abrir {v}', { v: WEEKDAYS[d.weekday] })} />
              </div>
            </div>
            {d.is_open ? (
              <div className="mt-3"><TimeChips value={d.slots} onChange={(slots) => updateDay(d.weekday, { slots })} /></div>
            ) : (
              <p className="mt-1 text-sm text-slate-400">{t('Cerrado')}</p>
            )}
          </div>
        ))}
      </div>

      <p className="text-sm text-slate-500">
        {t('La antelación mínima para reservar y los plazos para cancelar o cambiar están en')}{' '}<Link to={link('politicas')} className="font-semibold text-brand">{t('Políticas')}</Link>.
      </p>

      <section className="card space-y-3">
        <h2 className="font-bold">{t('Días cerrados')}</h2>
        <p className="text-sm text-slate-500">{t('Vacaciones, feriados o días libres. Esos días no se podrá reservar.')}</p>
        <div className="flex flex-wrap gap-2">
          <input type="date" className="input w-auto" min={todayKey(business.timezone)} value={newClosed} onChange={(e) => setNewClosed(e.target.value)} />
          <input className="input w-auto flex-1" placeholder={t('Motivo (opcional)')} value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button variant="secondary" onClick={addClosed} disabled={!newClosed}>{t('Añadir')}</Button>
        </div>
        <ul className="divide-y divide-slate-100">
          {closed.map((c) => (
            <li key={c.day} className="flex items-center justify-between py-2">
              <span>{dayTitle(c.day)}{c.reason && <span className="normal-case text-slate-500"> · {c.reason}</span>}</span>
              <button onClick={() => removeClosed(c.day)} className="text-sm font-semibold text-red-600">{t('Quitar')}</button>
            </li>
          ))}
          {closed.length === 0 && <li className="py-2 text-sm text-slate-400">{t('Ninguno')}</li>}
        </ul>
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold">{t('Bloquear horas')}</h2>
        <p className="text-sm text-slate-500">
          {t('Para un rato dentro de un día abierto (ej. el almuerzo, o si sales antes). El resto del día sigue abierto.')}
        </p>
        <div className="flex flex-wrap gap-2">
          <input type="date" className="input w-auto" min={todayKey(business.timezone)} value={slotDay} onChange={(e) => setSlotDay(e.target.value)} />
          <input type="time" className="input w-auto" value={slotStart} onChange={(e) => setSlotStart(e.target.value)} />
          <span className="self-center text-slate-500">{t('a')}</span>
          <input type="time" className="input w-auto" value={slotEnd} onChange={(e) => setSlotEnd(e.target.value)} />
          <input className="input w-auto flex-1" placeholder={t('Motivo (opcional)')} value={slotReason} onChange={(e) => setSlotReason(e.target.value)} />
          <Button variant="secondary" onClick={addSlot} disabled={!slotDay}>{t('Añadir')}</Button>
        </div>
        <ul className="divide-y divide-slate-100">
          {slots.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-2">
              <span>{dayTitle(s.day)} · {time12(s.start_time.slice(0, 5))}-{time12(s.end_time.slice(0, 5))}{s.reason && <span className="normal-case text-slate-500"> · {s.reason}</span>}</span>
              <button onClick={() => removeSlot(s.id)} className="text-sm font-semibold text-red-600">{t('Quitar')}</button>
            </li>
          ))}
          {slots.length === 0 && <li className="py-2 text-sm text-slate-400">{t('Ninguna')}</li>}
        </ul>
      </section>

      <details className="group" open={advancedOpen}>
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-bold text-slate-500">
          <svg viewBox="0 0 24 24" className="h-4 w-4 transition group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
          {t('Opciones avanzadas')}
        </summary>
        <section id="clientes-por-turno" className="card mt-3 scroll-mt-20 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">{t('Clientes por turno')}</h2>
              <p className="text-sm text-slate-500">
                {t('Cuántos clientes pueden reservar a la misma hora. Por ejemplo, si tienes 2 manicuras trabajando a la vez, pon 2.')}
              </p>
            </div>
            {!canMany && <span className="chip shrink-0 bg-brand/10 font-semibold text-brand">{t('Plan Equipo')}</span>}
          </div>
          {canMany && hasTeam ? (
            // Con equipo, cada persona atiende a una clienta a la vez (como en _free_lane)
            <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
              {t('Tienes equipo: cada persona (tú también) atiende a 1 cliente a la vez. Para recibir a más clientes a la misma hora, añade a quien trabaje contigo en Equipo.')}
            </div>
          ) : canMany ? (
            <CapacityStepper value={capacity} onChange={(n) => { setDirty(true); setCapacity(n) }} />
          ) : (
            <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
              <p>
                {t('Con tu plan atiendes a')}{' '}<b>{t('1 cliente a la vez')}</b>{t('. Para recibir a varios a la misma hora, pásate a')}{' '}<b>{t('Equipo')}</b>{t(': además, cada persona tiene su agenda y tus clientes eligen con quién reservar.')}
              </p>
              {(business.slot_capacity || 1) > 1 && (
                <p className="mt-1 text-slate-500">{t('Tenías')}{' '}{business.slot_capacity} {t('a la vez: vuelve a funcionar al pasar a Equipo.')}</p>
              )}
              <Link to={link('plan')} className="mt-2 inline-block font-semibold text-brand">{t('Pasarme a Equipo →')}</Link>
            </div>
          )}
          {dirty && <p className="text-sm font-semibold text-brand">{t('Recuerda pulsar «Guardar cambios» abajo.')}</p>}
        </section>
      </details>

      {error && <Alert>{error}</Alert>}

      {dirty && (
        <div className="fixed inset-x-0 bottom-16 z-30 px-4 md:bottom-4">
          <div className="mx-auto max-w-4xl">
            <Button block size="lg" onClick={save} loading={busy} className="shadow-xl">{t('Guardar cambios')}</Button>
          </div>
        </div>
      )}
    </div>
  )
}
