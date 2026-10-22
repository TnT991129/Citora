import { useRef, useState } from 'react'
import { Alert, Button, Empty, Field, Modal, Toggle } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { cupRate, duration, money, price } from '../../lib/format'
import { imageExt, resizeImage } from '../../lib/image'
import { supabase } from '../../lib/supabase'
import type { Service } from '../../lib/types'
import { usePanel } from './context'
import { RateCard } from './RateCard'

type Editing = Partial<Service> & { name: string; price: number; duration_min: number; is_extra: boolean }

export default function Services() {
  const { business, services, reloadServices } = usePanel()
  const [editing, setEditing] = useState<Editing | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const rate = cupRate(business)
  const main = services.filter((s) => !s.is_extra)
  const extras = services.filter((s) => s.is_extra)

  const open = (e: Editing) => {
    setError(null)
    setEditing(e)
  }

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
      is_extra: editing.is_extra,
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

  const uploadPhoto = async (file: File) => {
    if (!editing?.id) return
    setUploading(true)
    setError(null)
    try {
      const blob = await resizeImage(file, 480)
      const path = `${business.id}/service-${editing.id}-${Date.now()}.${imageExt(blob)}`
      const { error: upErr } = await supabase.storage.from('logos').upload(path, blob, { contentType: blob.type })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('logos').getPublicUrl(path)
      const { error } = await supabase.from('services').update({ photo_url: data.publicUrl }).eq('id', editing.id)
      if (error) throw error
      setEditing({ ...editing, photo_url: data.publicUrl })
      reloadServices()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setUploading(false)
    }
  }

  const removePhoto = async () => {
    if (!editing?.id) return
    await supabase.from('services').update({ photo_url: null }).eq('id', editing.id)
    setEditing({ ...editing, photo_url: null })
    reloadServices()
  }

  // Sube o baja dentro de su lista (principales o complementos) y deja las posiciones seguidas
  const moveItem = async (list: Service[], index: number, dir: -1 | 1) => {
    const j = index + dir
    if (j < 0 || j >= list.length) return
    const order = [...list]
    ;[order[index], order[j]] = [order[j], order[index]]
    const all = [...(list === main ? order : main), ...(list === extras ? order : extras)]
    await Promise.all(all.map((s, i) => (s.position === i ? null : supabase.from('services').update({ position: i }).eq('id', s.id))))
    reloadServices()
  }

  const row = (list: Service[]) => (s: Service, i: number) => (
    <div key={s.id} className={`flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200 ${s.active ? '' : 'opacity-60'}`}>
      <div className="flex flex-col">
        <button onClick={() => moveItem(list, i, -1)} disabled={i === 0} className="rounded p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-20" aria-label="Subir">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 15l6-6 6 6" /></svg>
        </button>
        <button onClick={() => moveItem(list, i, 1)} disabled={i === list.length - 1} className="rounded p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-20" aria-label="Bajar">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
        </button>
      </div>
      {s.photo_url && <img src={s.photo_url} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />}
      <button className="min-w-0 flex-1 text-left" onClick={() => open({ ...s })}>
        <p className="truncate font-semibold">{s.is_extra ? '+ ' : ''}{s.name}</p>
        <p className="text-sm text-slate-500">{price(s.price, business.currency, rate)} · {duration(s.duration_min)}</p>
      </button>
      <Toggle checked={s.active} onChange={(v) => toggle(s, v)} label={s.active ? 'Visible' : 'Oculto'} />
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Servicios</h1>
        <Button size="sm" onClick={() => open({ name: '', price: 0, duration_min: 60, is_extra: false })}>+ Servicio</Button>
      </div>
      <p className="text-sm text-slate-500">Los servicios ocultos no aparecen en tu web, pero se guardan. Las citas ya hechas mantienen su precio.</p>

      <RateCard />

      {main.length === 0 && <Empty title="No tienes servicios">Añade el primero para que puedan reservar.</Empty>}
      <div className="space-y-2">{main.map(row(main))}</div>

      <section className="space-y-2 pt-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Complementos</h2>
            <p className="text-sm text-slate-500">Extras opcionales que el cliente añade a un servicio, como un lavado o un diseño.</p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => open({ name: '', price: 0, duration_min: 15, is_extra: true })}>+ Complemento</Button>
        </div>
        {extras.length === 0 && <p className="rounded-2xl bg-white/60 px-4 py-3 text-sm text-slate-500 ring-1 ring-slate-200">Todavía no tienes complementos.</p>}
        <div className="space-y-2">{extras.map(row(extras))}</div>
      </section>

      {editing && (
        <Modal
          open
          onClose={() => setEditing(null)}
          title={editing.id ? (editing.is_extra ? 'Editar complemento' : 'Editar servicio') : editing.is_extra ? 'Nuevo complemento' : 'Nuevo servicio'}
          footer={
            <div className="flex gap-2">
              {editing.id && <Button variant="danger" onClick={remove} disabled={busy}>Eliminar</Button>}
              <Button block onClick={save} loading={busy}>Guardar</Button>
            </div>
          }
        >
          <div className="space-y-4">
            {editing.id ? (
              <div className="flex items-center gap-3">
                {editing.photo_url ? (
                  <img src={editing.photo_url} alt="" className="h-16 w-16 rounded-xl object-cover" />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M15.5 9.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" /></svg>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} loading={uploading}>
                    {editing.photo_url ? 'Cambiar foto' : 'Subir foto'}
                  </Button>
                  {editing.photo_url && <Button variant="ghost" size="sm" onClick={removePhoto}>Quitar</Button>}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) uploadPhoto(f)
                    e.target.value = ''
                  }}
                />
              </div>
            ) : (
              <p className="text-xs text-slate-400">Guarda el servicio para poder añadirle una foto.</p>
            )}
            <Field label="Nombre"><input className="input" value={editing.name} maxLength={80} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            <Field label="Descripción (opcional)"><input className="input" value={editing.description || ''} maxLength={160} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Precio (${business.currency})`} hint={rate && editing.price > 0 ? `≈ ${money(Math.round(editing.price * rate), 'CUP')}` : undefined}>
                <input className="input" type="number" min={0} step="any" inputMode="decimal" value={editing.price} onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })} />
              </Field>
              <Field label={editing.is_extra ? 'Tiempo que añade' : 'Duración'}>
                <select className="input" value={editing.duration_min} onChange={(e) => setEditing({ ...editing, duration_min: Number(e.target.value) })}>
                  {[5, 10, 15, 20, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300].map((m) => <option key={m} value={m}>{duration(m)}</option>)}
                </select>
              </Field>
            </div>
            <Toggle
              checked={editing.is_extra}
              onChange={(v) => setEditing({ ...editing, is_extra: v })}
              label="Es un complemento (extra opcional que se añade a un servicio)"
            />
            {error && <Alert>{error}</Alert>}
          </div>
        </Modal>
      )}
    </div>
  )
}
