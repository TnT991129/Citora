import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Button, PageLoader, flash } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { imageExt, shrinkImage } from '../../lib/image'
import { supabase } from '../../lib/supabase'
import type { GalleryPhoto } from '../../lib/types'
import { publicUrl } from '../../lib/url'
import { usePanel } from './context'
import { Locked, useModule } from './Locked'

const MAX = 30

export default function Gallery() {
  const allowed = useModule('galeria')
  const { business } = usePanel()
  const [list, setList] = useState<GalleryPhoto[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('gallery_photos').select('id, url, caption, position').order('position').order('created_at')
    if (error) setError(errorMessage(error))
    else setList(data as GalleryPhoto[])
  }, [])

  useEffect(() => {
    if (allowed) load()
  }, [allowed, load])

  if (!allowed) return <Locked module="galeria" />
  if (error && !list) return <Alert>{error}</Alert>
  if (!list) return <PageLoader />

  const upload = async (files: File[]) => {
    const room = MAX - list.length
    const batch = files.filter((f) => f.type.startsWith('image/')).slice(0, room)
    if (files.length > room) setError(`Puedes tener hasta ${MAX} fotos. Se subirán ${room}.`)
    else setError(null)
    let pos = list.reduce((m, p) => Math.max(m, p.position ?? 0), 0)
    try {
      for (let i = 0; i < batch.length; i++) {
        setUploading(`Subiendo ${i + 1} de ${batch.length}…`)
        const blob = await shrinkImage(batch[i], 1280)
        const path = `${business.id}/galeria/${Date.now()}-${i}.${imageExt(blob)}`
        const { error: upErr } = await supabase.storage.from('logos').upload(path, blob, { contentType: blob.type })
        if (upErr) throw upErr
        const { data } = supabase.storage.from('logos').getPublicUrl(path)
        const { error } = await supabase.from('gallery_photos').insert({ business_id: business.id, url: data.publicUrl, position: ++pos })
        if (error) throw error
      }
      if (batch.length) flash(batch.length === 1 ? 'Foto añadida' : `${batch.length} fotos añadidas`)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setUploading(null)
      load()
    }
  }

  const remove = async (p: GalleryPhoto) => {
    const { error } = await supabase.from('gallery_photos').delete().eq('id', p.id)
    if (error) return setError(errorMessage(error))
    // Borra también el archivo si está en nuestro almacén
    const m = p.url.match(/\/object\/public\/logos\/(.+)$/)
    if (m) await supabase.storage.from('logos').remove([decodeURIComponent(m[1])])
    load()
  }

  const move = async (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= list.length) return
    const next = [...list]
    ;[next[i], next[j]] = [next[j], next[i]]
    setList(next)
    const results = await Promise.all(next.map((p, k) => supabase.from('gallery_photos').update({ position: k }).eq('id', p.id)))
    const failed = results.find((r) => r.error)
    if (failed) setError(errorMessage(failed.error))
    load()
  }

  const saveCaption = async (p: GalleryPhoto, caption: string) => {
    if ((p.caption || '') === caption.trim()) return
    const { error } = await supabase.from('gallery_photos').update({ caption: caption.trim().slice(0, 120) || null }).eq('id', p.id)
    if (error) setError(errorMessage(error))
    else flash('Texto guardado')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Galería</h1>
          <p className="text-slate-600">Fotos de tus trabajos. Se ven en tu web. {list.length}/{MAX}</p>
        </div>
        <Button onClick={() => fileRef.current?.click()} loading={Boolean(uploading)} disabled={list.length >= MAX}>
          Añadir fotos
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files || [])
            if (files.length) upload(files)
            e.target.value = ''
          }}
        />
      </div>
      {uploading && <p className="text-sm font-medium text-brand">{uploading}</p>}
      {error && <Alert>{error}</Alert>}

      {list.length === 0 ? (
        <button onClick={() => fileRef.current?.click()} className="card flex w-full flex-col items-center gap-2 border-2 border-dashed border-slate-300 py-10 text-slate-500">
          <span className="text-4xl">📷</span>
          Sube tus mejores trabajos para que tus clientes los vean antes de reservar.
        </button>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {list.map((p, i) => (
            <li key={p.id} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
              <img src={p.url} alt={p.caption || 'Trabajo'} loading="lazy" className="aspect-square w-full object-cover" />
              <div className="space-y-2 p-2">
                <input
                  className="input py-1.5 text-sm"
                  defaultValue={p.caption || ''}
                  maxLength={120}
                  placeholder="Texto (opcional)"
                  onBlur={(e) => saveCaption(p, e.target.value)}
                />
                <div className="flex items-center justify-between">
                  <div className="flex">
                    <IconBtn label="Mover antes" disabled={i === 0} onClick={() => move(i, -1)} d="M15 6l-6 6 6 6" />
                    <IconBtn label="Mover después" disabled={i === list.length - 1} onClick={() => move(i, 1)} d="M9 6l6 6-6 6" />
                  </div>
                  <button onClick={() => remove(p)} className="rounded-lg px-2 py-1 text-sm font-medium text-red-600 hover:bg-red-50">Quitar</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {list.length > 0 && (
        <a href={publicUrl(business.slug)} target="_blank" rel="noreferrer" className="inline-block text-sm font-semibold text-brand">Ver mi web →</a>
      )}
    </div>
  )
}

function IconBtn({ label, d, disabled, onClick }: { label: string; d: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30">
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d={d} /></svg>
    </button>
  )
}
