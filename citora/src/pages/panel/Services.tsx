import { useState } from 'react'
import { Alert, Button, Empty, Field, Modal, Toggle } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { duration, money } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import type { Service } from '../../lib/types'
import { usePanel } from './context'

type Editing = Partial<Service> & { name: string; price: number; duration_min: number }

export default function Services() {
  const { business, services, reloadServices } = usePanel()
  const [editing, setEditing] = useState<Editing | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (!editing) return
    if (!editing.name.trim()) return setError('Escribe el nombre del servicio.')
    setBusy(true)
    setError(null)
    const payload = {
      name: editing.name.trim(),
      description: editing.description?.trim() || null,
      price: Math.max(0, Number(editing.price) || 0),
      duration_min: editing.duration_min,
    }
    const { error } = editing.id
      ? await supabase.from('services').update(payload).eq('id', editing.id)
      : await supabase.from('services').insert({ ...payload, business_id: business.id, position: services.length })
    setBusy(false)
    if (error) return setError(errorMessage(error))
    setEditing(null)
    reloadServices()
  }

  const remove = async () => {
    if (!editing?.id) return
    setBusy(true)
    const { error } = await supabase.from('services').delete().eq('id', editing.id)
    setBusy(false)
    if (error) return setError(errorMessage(error))
    setEditing(null)
    reloadServices()
  }

  const toggle = async (s: Service, active: boolean) => {
    await supabase.from('services').update({ active }).eq('id', s.id)
    reloadServices()
  }

  const moveItem = async (index: number, dir: -1 | 1) => {
    const j = index + dir
    if (j < 0 || j >= services.length) return
    const a = services[index]
    const b = services[j]
    await Promise.all([
      supabase.from('services').update({ position: j }).eq('id', a.id),
      supabase.from('services').update({ position: index }).eq('id', b.id),
    ])
    // Normaliza el resto de posiciones si estaban repetidas
    await Promise.all(
      services.map((s, i) => (s.id === a.id || s.id === b.id || s.position === i ? null : supabase.from('services').update({ position: i }).eq('id', s.id))),
    )
    reloadServices()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Servicios</h1>
        <Button size="sm" onClick={() => { setError(null); setEditing({ name: '', price: 0, duration_min: 60 }) }}>+ Servicio</Button>
      </div>
      <p className="text-sm text-slate-500">Los servicios ocultos no aparecen en tu web, pero se guardan. Las citas ya hechas mantienen su precio.</p>

      {services.length === 0 && <Empty title="No tienes servicios">Añade el primero para que puedan reservar.</Empty>}

      <div className="space-y-2">
        {services.map((s, i) => (
          <div key={s.id} className={`flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200 ${s.active ? '' : 'opacity-60'}`}>
            <div className="flex flex-col">
              <button onClick={() => moveItem(i, -1)} disabled={i === 0} className="rounded p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-20" aria-label="Subir">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 15l6-6 6 6" /></svg>
              </button>
              <button onClick={() => moveItem(i, 1)} disabled={i === services.length - 1} className="rounded p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-20" aria-label="Bajar">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
              </button>
            </div>
            <button className="min-w-0 flex-1 text-left" onClick={() => { setError(null); setEditing({ ...s }) }}>
              <p className="truncate font-semibold">{s.name}</p>
              <p className="text-sm text-slate-500">{money(s.price, business.currency)} · {duration(s.duration_min)}</p>
            </button>
            <Toggle checked={s.active} onChange={(v) => toggle(s, v)} label={s.active ? 'Visible' : 'Oculto'} />
          </div>
        ))}
      </div>

      {editing && (
        <Modal
          open
          onClose={() => setEditing(null)}
          title={editing.id ? 'Editar servicio' : 'Nuevo servicio'}
          footer={
            <div className="flex gap-2">
              {editing.id && <Button variant="danger" onClick={remove} disabled={busy}>Eliminar</Button>}
              <Button block onClick={save} loading={busy}>Guardar</Button>
            </div>
          }
        >
          <div className="space-y-4">
            <Field label="Nombre"><input className="input" value={editing.name} maxLength={80} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            <Field label="Descripción (opcional)"><input className="input" value={editing.description || ''} maxLength={160} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Precio (${business.currency})`}>
                <input className="input" type="number" min={0} inputMode="decimal" value={editing.price} onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })} />
              </Field>
              <Field label="Duración">
                <select className="input" value={editing.duration_min} onChange={(e) => setEditing({ ...editing, duration_min: Number(e.target.value) })}>
                  {[10, 15, 20, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300].map((m) => <option key={m} value={m}>{duration(m)}</option>)}
                </select>
              </Field>
            </div>
            {error && <Alert>{error}</Alert>}
          </div>
        </Modal>
      )}
    </div>
  )
}
