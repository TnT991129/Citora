import { useState } from 'react'
import { CapacityStepper } from '../../components/CapacityStepper'
import { Alert, Button, Field, Toggle, flash } from '../../components/ui'
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
    max_daily_bookings: business.max_daily_bookings, // null = sin límite
    cancel_notice_hours: business.cancel_notice_hours,
    reschedule_notice_hours: business.reschedule_notice_hours,
    max_reschedules: business.max_reschedules, // null = sin límite
    deposit_enabled: business.deposit_enabled,
    deposit_amount: business.deposit_amount != null ? String(business.deposit_amount) : '',
    deposit_instructions: business.deposit_instructions || '',
    loyalty_enabled: business.loyalty_enabled,
    loyalty_every: business.loyalty_every || 5,
    loyalty_reward: business.loyalty_reward || '',
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
      max_daily_bookings: form.max_daily_bookings,
      cancel_notice_hours: form.cancel_notice_hours,
      reschedule_notice_hours: form.reschedule_notice_hours,
      max_reschedules: form.max_reschedules,
      deposit_enabled: form.deposit_enabled,
      deposit_amount: form.deposit_enabled && Number(form.deposit_amount) > 0 ? Number(form.deposit_amount) : null,
      deposit_instructions: form.deposit_enabled ? (form.deposit_instructions.trim() || null) : null,
      loyalty_enabled: form.loyalty_enabled,
      loyalty_every: form.loyalty_enabled ? form.loyalty_every : null,
      loyalty_reward: form.loyalty_enabled ? (form.loyalty_reward.trim() || null) : null,
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
            <span className="label">Citas creadas por día</span>
            <p className="mb-2 text-sm text-slate-500">
              Cuántas veces puede reservar un mismo teléfono en 24 horas. Otra forma de evitar abusos, aparte de la de arriba.
            </p>
            <label className="mb-2 flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.max_daily_bookings === null}
                onChange={(e) => set({ max_daily_bookings: e.target.checked ? null : 3 })}
              />
              Sin límite
            </label>
            {form.max_daily_bookings !== null && (
              <CapacityStepper
                size="sm"
                min={1}
                max={50}
                value={form.max_daily_bookings}
                onChange={(n) => set({ max_daily_bookings: n })}
                unit={(n) => (n === 1 ? 'cita al día' : 'citas al día')}
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
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold">Depósito para reservar</h2>
            <p className="text-sm text-slate-500">
              No hay pasarela de pago para Cuba, así que es informativo: el cliente lo transfiere por su cuenta
              (Transfermóvil/EnZona) y te manda la captura por WhatsApp. Tú confirmas la cita como siempre.
            </p>
          </div>
          <Toggle checked={form.deposit_enabled} onChange={(v) => set({ deposit_enabled: v })} label="Pedir depósito" />
        </div>
        {form.deposit_enabled && (
          <>
            <Field label="Importe" hint={`En ${business.currency}.`}>
              <input className="input" type="number" min={0} step="any" inputMode="decimal" value={form.deposit_amount} onChange={(e) => set({ deposit_amount: e.target.value })} placeholder="Ej. 500" />
            </Field>
            <Field label="Instrucciones para el cliente">
              <textarea
                className="input min-h-[90px]"
                maxLength={500}
                value={form.deposit_instructions}
                onChange={(e) => set({ deposit_instructions: e.target.value })}
                placeholder="Ej. Transfiere a la tarjeta 9200 0000 0000 0000 y manda la captura por WhatsApp para confirmar tu cita."
              />
            </Field>
          </>
        )}
      </section>

      <section className="card space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold">Tarjeta de cliente fiel</h2>
            <p className="text-sm text-slate-500">
              Un aviso para tus clientas cada cierto número de visitas. Tú entregas el premio cuando te lo mencionen (no se aplica solo).
            </p>
          </div>
          <Toggle checked={form.loyalty_enabled} onChange={(v) => set({ loyalty_enabled: v })} label="Tarjeta de cliente fiel" />
        </div>
        {form.loyalty_enabled && (
          <>
            <div>
              <span className="label">Cada</span>
              <CapacityStepper size="sm" min={2} max={50} value={form.loyalty_every} onChange={(n) => set({ loyalty_every: n })} unit={(n) => (n === 1 ? 'visita' : 'visitas')} />
            </div>
            <Field label="Premio">
              <input className="input" maxLength={160} value={form.loyalty_reward} onChange={(e) => set({ loyalty_reward: e.target.value })} placeholder="Ej. Un servicio gratis" />
            </Field>
          </>
        )}
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
