import { useState } from 'react'
import { Alert, Button, Field, Modal } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { duration, money } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import { usePanel } from './context'

/** Cita añadida por el dueño (por ejemplo, alguien que llamó). Puede ser a cualquier hora. */
export function NewAppointment({ defaultDate, onClose, onCreated }: { defaultDate: string; onClose: () => void; onCreated: () => void }) {
  const { business, services } = usePanel()
  const [selected, setSelected] = useState<string[]>([])
  const [date, setDate] = useState(defaultDate)
  const [time, setTime] = useState('10:00')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const chosen = services.filter((s) => selected.includes(s.id))
  const total = chosen.reduce((a, s) => a + Number(s.price), 0)
  const minutes = chosen.reduce((a, s) => a + s.duration_min, 0) || 60

  const save = async () => {
    if (name.trim().length < 2) return setError('Escribe el nombre del cliente.')
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('owner_create_appointment', {
      p_service_ids: selected,
      p_date: date,
      p_time: time,
      p_name: name.trim(),
      p_phone: phone,
      p_note: note.trim() || null,
    })
    setBusy(false)
    if (error) setError(errorMessage(error))
    else onCreated()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Nueva cita"
      footer={<Button block onClick={save} loading={busy}>Guardar cita · {money(total, business.currency)}</Button>}
    >
      <div className="space-y-4">
        <div>
          <span className="label">Servicios</span>
          <div className="flex flex-wrap gap-2">
            {services.filter((s) => s.active).map((s) => {
              const on = selected.includes(s.id)
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelected(on ? selected.filter((x) => x !== s.id) : [...selected, s.id])}
                  className={`rounded-full px-3 py-1.5 text-sm font-semibold ${on ? 'bg-brand text-white' : 'bg-white text-slate-700 ring-1 ring-slate-300'}`}
                >
                  {s.name}
                </button>
              )
            })}
          </div>
          <p className="mt-1 text-xs text-slate-500">Duración: {duration(minutes)}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Día"><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Hora"><input type="time" className="input" value={time} step={300} onChange={(e) => setTime(e.target.value)} /></Field>
        </div>
        <Field label="Nombre del cliente"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Teléfono (opcional)"><input className="input" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="53 5555 5555" /></Field>
        <Field label="Nota (opcional)"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {error && <Alert>{error}</Alert>}
      </div>
    </Modal>
  )
}
