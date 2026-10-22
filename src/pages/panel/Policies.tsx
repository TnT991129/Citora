import { useState } from 'react'
import { CapacityStepper } from '../../components/CapacityStepper'
import { Alert, Button, Field, flash } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import { usePanel } from './context'

const POLICIES_MAX = 5000

export default function Policies() {
  const { business, reloadBusiness } = usePanel()
  const [form, setForm] = useState({
    min_notice_hours: business.min_notice_hours,
    max_days_ahead: business.max_days_ahead,
    max_pending_bookings: business.max_pending_bookings, // null = sin límite
    cancel_notice_hours: business.cancel_notice_hours,
    reschedule_notice_hours: business.reschedule_notice_hours,
    max_reschedules: business.max_reschedules, // null = sin límite
    policies: business.policies || '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))

  const save = async () => {
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('businesses').update({
      min_notice_hours: form.min_notice_hours,
      max_days_ahead: form.max_days_ahead,
      max_pending_bookings: form.max_pending_bookings,
      cancel_notice_hours: form.cancel_notice_hours,
      reschedule_notice_hours: form.reschedule_notice_hours,
      max_reschedules: form.max_reschedules,
      policies: form.policies.trim() || null,
    }).eq('id', business.id)
    setBusy(false)
    if (error) return setError(errorMessage(error))
    flash('Políticas guardadas')
    reloadBusiness()
  }

  return (
    <div className="space-y-5 pb-10">
      <div>
        <h1 className="text-2xl font-extrabold">Políticas</h1>
        <p className="text-sm text-slate-500">Reglas de reserva y lo que leen tus clientas antes de reservar.</p>
      </div>

      <section className="card space-y-4">
        <h2 className="font-bold">Reglas</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Reservar con al menos" hint="Antelación mínima para reservar por la web.">
            <select className="input" value={form.min_notice_hours} onChange={(e) => set({ min_notice_hours: Number(e.target.value) })}>
              {[0, 1, 2, 3, 4, 6, 12, 24, 48].map((h) => <option key={h} value={h}>{h === 0 ? 'Sin mínimo' : `${h} h`}</option>)}
            </select>
          </Field>
          <Field label="Reservar hasta" hint="Cuántos días hacia adelante se ve el calendario.">
            <select className="input" value={form.max_days_ahead} onChange={(e) => set({ max_days_ahead: Number(e.target.value) })}>
              {[7, 14, 30, 60, 90].map((d) => <option key={d} value={d}>{d} días</option>)}
            </select>
          </Field>
          <Field label="Cancelar hasta" hint="Horas antes de la cita.">
            <select className="input" value={form.cancel_notice_hours} onChange={(e) => set({ cancel_notice_hours: Number(e.target.value) })}>
              {[0, 1, 2, 3, 6, 12, 24, 48].map((h) => <option key={h} value={h}>{h === 0 ? 'Hasta la hora' : `${h} h antes`}</option>)}
            </select>
          </Field>
          <Field label="Cambiar hasta" hint="Día u hora de la cita, horas antes.">
            <select className="input" value={form.reschedule_notice_hours} onChange={(e) => set({ reschedule_notice_hours: Number(e.target.value) })}>
              {[0, 1, 2, 3, 6, 12, 24, 48].map((h) => <option key={h} value={h}>{h === 0 ? 'Hasta la hora' : `${h} h antes`}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
          <div>
            <span className="label">Citas pendientes por clienta</span>
            <p className="mb-2 text-sm text-slate-500">
              Cuántas citas futuras puede tener a la vez con el mismo teléfono. Útil para evitar abusos; si tus clientas suelen reservar varias citas seguidas (ej. de varias semanas), pon "Sin límite".
            </p>
            <label className="mb-2 flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.max_pending_bookings === null}
                onChange={(e) => set({ max_pending_bookings: e.target.checked ? null : 2 })}
              />
              Sin límite
            </label>
            {form.max_pending_bookings !== null && (
              <CapacityStepper
                size="sm"
                min={1}
                max={50}
                value={form.max_pending_bookings}
                onChange={(n) => set({ max_pending_bookings: n })}
                unit={(n) => (n === 1 ? 'cita pendiente' : 'citas pendientes')}
              />
            )}
          </div>
          <div>
            <span className="label">Cambios por cita</span>
            <p className="mb-2 text-sm text-slate-500">Veces que puede cambiar la fecha u hora de una misma cita.</p>
            <label className="mb-2 flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.max_reschedules === null}
                onChange={(e) => set({ max_reschedules: e.target.checked ? null : 1 })}
              />
              Sin límite
            </label>
            {form.max_reschedules !== null && (
              <CapacityStepper
                size="sm"
                min={1}
                max={10}
                value={form.max_reschedules}
                onChange={(n) => set({ max_reschedules: n })}
                unit={(n) => (n === 1 ? 'cambio por cita' : 'cambios por cita')}
              />
            )}
          </div>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold">Políticas</h2>
        <p className="text-sm text-slate-500">Lo que tus clientes aceptan al reservar: puntualidad, cancelaciones, etc.</p>
        <textarea
          className="input min-h-[320px] resize-y leading-relaxed"
          rows={14}
          value={form.policies}
          maxLength={POLICIES_MAX}
          placeholder={'Ej.\n• Llega 5 minutos antes de tu cita.\n• Si llegas más de 15 minutos tarde, puede que tengamos que cambiar tu cita.\n• Cancela con al menos 6 horas de antelación.'}
          onChange={(e) => set({ policies: e.target.value })}
        />
        <p className={`text-right text-xs ${form.policies.length > POLICIES_MAX * 0.9 ? 'text-amber-700' : 'text-slate-400'}`}>
          {form.policies.length.toLocaleString('es-ES')} / {POLICIES_MAX.toLocaleString('es-ES')} caracteres
        </p>
      </section>

      {error && <Alert>{error}</Alert>}
      <Button block size="lg" onClick={save} loading={busy}>Guardar políticas</Button>
    </div>
  )
}
