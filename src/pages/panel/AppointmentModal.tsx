import { useState } from 'react'
import { Alert, Button, Field, LinkButton, Modal, StatusBadge, WhatsAppIcon } from '../../components/ui'
import { buildMessage, MESSAGE_LABELS, type MessageKind } from '../../lib/appointments'
import { errorMessage } from '../../lib/errors'
import { dateKey, duration, money, timeOf, dayTitle } from '../../lib/format'
import { hasModule } from '../../lib/plans'
import { supabase } from '../../lib/supabase'
import type { Appointment, AppointmentStatus } from '../../lib/types'
import { waLink } from '../../lib/whatsapp'
import { usePanel } from './context'

export function AppointmentModal({ appointment, onClose, onChanged }: {
  appointment: Appointment
  onClose: () => void
  onChanged: () => void
}) {
  const { business, status, staff } = usePanel()
  const a = appointment
  const tz = business.timezone
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState(a.internal_note || '')
  const [moving, setMoving] = useState(false)
  const [newDate, setNewDate] = useState(dateKey(a.starts_at, tz))
  const [newTime, setNewTime] = useState(timeOf(a.starts_at, tz))

  const minutes = (a.appointment_services || []).reduce((s, x) => s + x.duration_min, 0) ||
    Math.round((new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime()) / 60000)
  const canWhatsApp = hasModule(status.effective_plan, 'whatsapp') && a.customer_phone.length >= 8

  const setStatus = async (s: AppointmentStatus) => {
    setBusy(s)
    setError(null)
    const { error } = await supabase.from('appointments').update({ status: s }).eq('id', a.id)
    setBusy(null)
    if (error) setError(errorMessage(error))
    else onChanged()
  }

  const saveNote = async () => {
    setBusy('note')
    const { error } = await supabase.from('appointments').update({ internal_note: note.trim() || null }).eq('id', a.id)
    setBusy(null)
    if (error) setError(errorMessage(error))
    else onChanged()
  }

  const move = async () => {
    setBusy('move')
    setError(null)
    const { error } = await supabase.rpc('owner_reschedule_appointment', { p_id: a.id, p_date: newDate, p_time: newTime })
    setBusy(null)
    if (error) setError(errorMessage(error))
    else onChanged()
  }

  const messages: MessageKind[] =
    a.status === 'cancelada' ? ['cancelacion']
      : a.status === 'completada' ? ['gracias']
        : a.status === 'pendiente' ? ['confirmar', 'recordatorio', 'retraso', 'cancelacion']
          : ['recordatorio', 'retraso', 'gracias', 'cancelacion']

  return (
    <Modal open onClose={onClose} title={a.customer_name}>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-bold">{dayTitle(dateKey(a.starts_at, tz))}</p>
            <p className="font-semibold text-brand">{timeOf(a.starts_at, tz)} – {timeOf(a.ends_at, tz)} · {duration(minutes)}</p>
            {a.staff_id && staff.find((s) => s.id === a.staff_id) && (
              <p className="text-sm text-slate-600">Con <b>{staff.find((s) => s.id === a.staff_id)!.name}</b></p>
            )}
          </div>
          <StatusBadge status={a.status} />
        </div>

        <div className="rounded-xl bg-slate-50 p-3">
          {(a.appointment_services || []).map((s, i) => (
            <div key={i} className="flex justify-between py-0.5 text-sm">
              <span>{s.name}</span>
              <span>{money(s.price, business.currency)}</span>
            </div>
          ))}
          <div className="mt-1 flex justify-between border-t border-slate-200 pt-1.5 font-bold">
            <span>Total</span>
            <span>{money(a.total, business.currency)}</span>
          </div>
        </div>

        <div className="text-sm">
          <p><span className="text-slate-500">Teléfono:</span> <a href={`tel:+${a.customer_phone}`} className="font-semibold">{a.customer_phone || '—'}</a></p>
          {a.customer_note && <p className="mt-1"><span className="text-slate-500">Nota del cliente:</span> {a.customer_note}</p>}
          <p className="mt-1 text-xs text-slate-400">{a.source === 'web' ? 'Reservó desde la web' : 'Cita añadida por ti'}{a.cancelled_by ? ` · cancelada por ${a.cancelled_by === 'cliente' ? 'el cliente' : 'ti'}` : ''}</p>
        </div>

        {error && <Alert>{error}</Alert>}

        {/* Estado */}
        <div className="grid grid-cols-2 gap-2">
          {a.status === 'pendiente' && <Button onClick={() => setStatus('confirmada')} loading={busy === 'confirmada'}>Confirmar</Button>}
          {(a.status === 'pendiente' || a.status === 'confirmada') && (
            <>
              <Button variant="secondary" onClick={() => setStatus('completada')} loading={busy === 'completada'}>Completada</Button>
              <Button variant="secondary" onClick={() => setStatus('no_asistio')} loading={busy === 'no_asistio'}>No vino</Button>
              <Button variant="danger" onClick={() => setStatus('cancelada')} loading={busy === 'cancelada'}>Cancelar</Button>
            </>
          )}
          {(a.status === 'completada' || a.status === 'no_asistio') && (
            <Button variant="secondary" onClick={() => setStatus('confirmada')} loading={busy === 'confirmada'}>Volver a confirmada</Button>
          )}
        </div>

        {/* WhatsApp */}
        {canWhatsApp && (
          <div>
            <p className="label">Enviar por WhatsApp</p>
            <div className="flex flex-wrap gap-2">
              {messages.map((k) => (
                <LinkButton key={k} href={waLink(a.customer_phone, buildMessage(k, a, business))} variant="whatsapp" size="sm" newTab>
                  <WhatsAppIcon className="h-4 w-4" /> {MESSAGE_LABELS[k]}
                </LinkButton>
              ))}
            </div>
          </div>
        )}

        {/* Mover */}
        {(a.status === 'pendiente' || a.status === 'confirmada') && (
          <div>
            {!moving ? (
              <button onClick={() => setMoving(true)} className="text-sm font-semibold text-brand">Cambiar día u hora</button>
            ) : (
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" className="input" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
                  <input type="time" className="input" value={newTime} onChange={(e) => setNewTime(e.target.value)} step={300} />
                </div>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" onClick={move} loading={busy === 'move'}>Mover cita</Button>
                  <Button size="sm" variant="ghost" onClick={() => setMoving(false)}>Cancelar</Button>
                </div>
              </div>
            )}
          </div>
        )}

        <Field label="Nota interna (solo la ves tú)">
          <textarea className="input min-h-[70px]" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {note !== (a.internal_note || '') && <Button size="sm" variant="secondary" onClick={saveNote} loading={busy === 'note'}>Guardar nota</Button>}
      </div>
    </Modal>
  )
}
