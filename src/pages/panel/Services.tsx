import { useRef, useState } from 'react'
import { Alert, Button, Empty, Field, Modal, Toggle } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { cupRate, duration, money, price } from '../../lib/format'
import { imageExt, resizeImage } from '../../lib/image'
import { supabase } from '../../lib/supabase'
import type { Service, ServiceOption } from '../../lib/types'
import { usePanel } from './context'
import { RateCard } from './RateCard'

// Las opciones nuevas no tienen id todavía: se lo pone la base de datos al guardar
type EditingOption = Omit<ServiceOption, 'id'> & { id?: string }
type Editing = Omit<Partial<Service>, 'options'> & { name: string; price: number; duration_min: number; is_extra: boolean; options: EditingOption[] }

const MAX_OPTIONS = 12

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
    const options = editing.options.map((o) => ({ ...o, name: o.name.trim(), price: Math.max(0, Number(o.price) || 0) }))
    if (options.length === 1) return setError('Pon al menos 2 opciones, o quítalas y deja un solo precio.')
    if (options.some((o) => !o.name)) return setError('Escribe el nombre de cada opción (por ejemplo, Niño o Adulto).')
    setBusy(true)
    setError(null)
    const payload = {
      name: editing.name.trim(),
      description: editing.description?.trim() || null,
      // Con opciones, la base de datos guarda como precio el de la más barata
      price: options.length ? Math.min(...options.map((o) => o.price)) : Math.max(0, Number(editing.price) || 0),
      duration_min: editing.duration_min,
      is_extra: editing.is_extra,
      options,
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
      <button className="min-w-0 flex-1 text-left" onClick={() => open({ ...s, options: s.options || [] })}>
        <p className="truncate font-semibold">{s.is_extra ? '+ ' : ''}{s.name}</p>
        <p className="text-sm text-slate-500">
          {s.options?.length ? `${s.options.length} opciones · desde ${price(s.price, business.currency, rate)}` : price(s.price, business.currency, rate)} · {duration(s.duration_min)}
        </p>
      </button>
      <Toggle checked={s.active} onChange={(v) => toggle(s, v)} label={s.active ? 'Visible' : 'Oculto'} />
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Servicios</h1>
        <Button size="sm" onClick={() => open({ name: '', price: 0, duration_min: 60, is_extra: false, options: [] })}>+ Servicio</Button>
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
          <Button size="sm" variant="secondary" onClick={() => open({ name: '', price: 0, duration_min: 15, is_extra: true, options: [] })}>+ Complemento</Button>
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
              {editing.options.length === 0 ? (
                <Field label={`Precio (${business.currency})`} hint={rate && editing.price > 0 ? `≈ ${money(Math.round(editing.price * rate), 'CUP')}` : undefined}>
                  <input className="input" type="number" min={0} step="any" inputMode="decimal" value={editing.price} onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })} />
                </Field>
              ) : (
                <Field label="Precio">
                  <p className="input flex items-center text-slate-500">Según la opción</p>
                </Field>
              )}
              <Field label={editing.is_extra ? 'Tiempo que añade' : 'Duración'}>
                <select className="input" value={editing.duration_min} onChange={(e) => setEditing({ ...editing, duration_min: Number(e.target.value) })}>
                  {[5, 10, 15, 20, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300].map((m) => <option key={m} value={m}>{duration(m)}</option>)}
                </select>
              </Field>
            </div>
            <PriceOptions editing={editing} setEditing={setEditing} currency={business.currency} />
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

/** Varias opciones de precio para un mismo servicio (ej. Corte: Niño 500 · Adulto 800). Duran lo mismo. */
function PriceOptions({ editing, setEditing, currency }: {
  editing: Editing
  setEditing: (e: Editing) => void
  currency: string
}) {
  const opts = editing.options
  const set = (options: EditingOption[]) => setEditing({ ...editing, options })
  if (opts.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-3">
        <p className="text-sm font-semibold">¿El precio cambia según el caso?</p>
        <p className="text-xs text-slate-500">Por ejemplo: Niño, Adulto y Con barba. El cliente elige una al reservar.</p>
        <Button
          size="sm"
          variant="secondary"
          className="mt-2"
          onClick={() => set([{ name: '', price: Number(editing.price) || 0 }, { name: '', price: Number(editing.price) || 0 }])}
        >
          + Añadir opciones de precio
        </Button>
      </div>
    )
  }
  return (
    <div className="space-y-2 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Opciones de precio</p>
        <button type="button" onClick={() => set([])} className="text-xs font-semibold text-slate-500 underline">Quitar opciones</button>
      </div>
      {opts.map((o, i) => (
        <div key={o.id || `nueva-${i}`} className="flex items-center gap-2">
          <input
            className="input min-w-0 flex-1"
            placeholder={['Niño', 'Adulto', 'Con barba'][i] || 'Nombre'}
            aria-label={`Nombre de la opción ${i + 1}`}
            value={o.name}
            maxLength={40}
            onChange={(e) => set(opts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
          />
          <input
            className="input w-28 shrink-0"
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            aria-label={`Precio de la opción ${i + 1} (${currency})`}
            value={o.price}
            onChange={(e) => set(opts.map((x, j) => (j === i ? { ...x, price: Number(e.target.value) } : x)))}
          />
          <button
            type="button"
            onClick={() => set(opts.filter((_, j) => j !== i))}
            aria-label={`Quitar la opción ${i + 1}`}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
      ))}
      {opts.length < MAX_OPTIONS && (
        <Button size="sm" variant="ghost" onClick={() => set([...opts, { name: '', price: 0 }])}>+ Otra opción</Button>
      )}
      <p className="text-xs text-slate-500">Precios en {currency}. Todas duran lo mismo. Las citas ya hechas mantienen su precio.</p>
    </div>
  )
}
