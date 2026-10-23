import { useEffect, useRef, useState } from 'react'
import { TimeChips } from '../../components/TimeChips'
import { Alert, BusinessAvatar, Button, Modal, Toggle, flash } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { WEEKDAYS, normalizeSlot } from '../../lib/format'
import { imageExt, resizeImage } from '../../lib/image'
import { supabase } from '../../lib/supabase'
import type { Staff, StaffScheduleDay } from '../../lib/types'
import { usePanel } from './context'
import { Locked, useModule } from './Locked'

const MAX = 20
const ORDER = [1, 2, 3, 4, 5, 6, 0]

/** Profesionales del negocio: cada uno tiene su propia agenda */
export default function Team() {
  const allowed = useModule('empleados')
  const { business, staff, reloadStaff } = usePanel()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<Staff | null>(null)

  if (!allowed) return <Locked module="empleados" />

  const run = async (fn: () => PromiseLike<{ error: unknown }>, msg?: string) => {
    setError(null)
    const { error } = await fn()
    if (error) return setError(errorMessage(error))
    if (msg) flash(msg)
    await reloadStaff()
  }

  const add = async () => {
    const n = name.trim()
    if (n.length < 2) return setError('Escribe el nombre (al menos 2 letras).')
    setBusy(true)
    await run(() => supabase.from('staff').insert({ business_id: business.id, name: n, position: staff.length }), `${n} añadido`)
    setBusy(false)
    setName('')
  }

  const move = async (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= staff.length) return
    const next = [...staff]
    ;[next[i], next[j]] = [next[j], next[i]]
    await run(async () => {
      const results = await Promise.all(next.map((s, k) => supabase.from('staff').update({ position: k }).eq('id', s.id)))
      return { error: results.find((r) => r.error)?.error || null }
    })
  }

  const active = staff.filter((s) => s.active).length

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Equipo</h1>
        <p className="text-slate-600">
          Añade a las personas que atienden. Cada una tiene su propia agenda: dos clientes pueden reservar a la misma hora con profesionales distintos.
        </p>
      </div>

      <section className="card space-y-3">
        <div className="flex gap-2">
          <input
            className="input"
            placeholder="Nombre (ej. Carlos)"
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <Button onClick={add} loading={busy} disabled={staff.length >= MAX}>Añadir</Button>
        </div>
        {staff.length === 0 && (
          <p className="text-sm text-slate-500">
            Mientras no añadas a nadie, tu negocio funciona con una sola agenda, como ahora.
          </p>
        )}
      </section>

      {error && <Alert>{error}</Alert>}

      {staff.length > 0 && (
        <ul className="space-y-2">
          {staff.map((s, i) => (
            <StaffRow
              key={s.id}
              s={s}
              first={i === 0}
              last={i === staff.length - 1}
              onMove={(dir) => move(i, dir)}
              onRename={(n) => run(() => supabase.from('staff').update({ name: n }).eq('id', s.id), 'Nombre guardado')}
              onToggle={(v) => run(() => supabase.from('staff').update({ active: v }).eq('id', s.id))}
              onRemove={() => run(() => supabase.from('staff').delete().eq('id', s.id), `${s.name} quitado`)}
              onDetail={() => setDetail(s)}
            />
          ))}
        </ul>
      )}

      {staff.length > 0 && (
        <p className="text-sm text-slate-500">
          {active} {active === 1 ? 'profesional activo' : 'profesionales activos'}. Tus clientes pueden elegir con quién reservar o dejar que se asigne al que esté libre.
          Los inactivos no reciben reservas nuevas, pero conservan sus citas.
        </p>
      )}

      {detail && <StaffDetailsModal staff={detail} onClose={() => setDetail(null)} onPhotoChanged={reloadStaff} />}
    </div>
  )
}

function StaffRow({ s, first, last, onMove, onRename, onToggle, onRemove, onDetail }: {
  s: Staff
  first: boolean
  last: boolean
  onMove: (dir: -1 | 1) => void
  onRename: (name: string) => void
  onToggle: (active: boolean) => void
  onRemove: () => void
  onDetail: () => void
}) {
  const [confirm, setConfirm] = useState(false)
  return (
    <li className={`card flex flex-wrap items-center gap-3 ${s.active ? '' : 'opacity-60'}`}>
      <div className="flex flex-col">
        <ArrowBtn label="Subir" disabled={first} onClick={() => onMove(-1)} d="M6 15l6-6 6 6" />
        <ArrowBtn label="Bajar" disabled={last} onClick={() => onMove(1)} d="M6 9l6 6 6-6" />
      </div>
      <BusinessAvatar name={s.name} logo={s.photo_url} size={40} />
      <input
        className="input min-w-0 flex-1"
        defaultValue={s.name}
        maxLength={60}
        aria-label="Nombre"
        onBlur={(e) => {
          const n = e.target.value.trim()
          if (n.length >= 2 && n !== s.name) onRename(n)
        }}
      />
      <button onClick={onDetail} className="text-sm font-semibold text-brand">Horario y servicios</button>
      <Toggle checked={s.active} onChange={onToggle} label="Activo" />
      {confirm ? (
        <span className="flex gap-1">
          <Button size="sm" variant="danger" onClick={onRemove}>Quitar</Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>No</Button>
        </span>
      ) : (
        <button onClick={() => setConfirm(true)} className="rounded-lg px-2 py-1 text-sm font-medium text-red-600 hover:bg-red-50">Quitar</button>
      )}
    </li>
  )
}

function ArrowBtn({ label, d, disabled, onClick }: { label: string; d: string; disabled: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} className="rounded p-0.5 text-slate-500 hover:bg-slate-100 disabled:opacity-25">
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d={d} /></svg>
    </button>
  )
}

function StaffDetailsModal({ staff, onClose, onPhotoChanged }: { staff: Staff; onClose: () => void; onPhotoChanged: () => Promise<void> | void }) {
  const { business, services } = usePanel()
  const [tab, setTab] = useState<'horario' | 'servicios'>('horario')
  const [custom, setCustom] = useState<boolean | null>(null)
  const [days, setDays] = useState<StaffScheduleDay[] | null>(null)
  const [serviceIds, setServiceIds] = useState<string[] | null>(null)
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ;(async () => {
      const [{ data: d }, { data: ss }] = await Promise.all([
        supabase.from('staff_schedule_days').select('*').eq('staff_id', staff.id),
        supabase.from('staff_services').select('service_id').eq('staff_id', staff.id),
      ])
      const rows = (d as StaffScheduleDay[] | null) || []
      setCustom(rows.length > 0)
      const map = new Map(rows.map((x) => [x.weekday, x]))
      setDays(ORDER.map((w) => {
        const x = map.get(w)
        return { staff_id: staff.id, weekday: w, is_open: x?.is_open ?? true, slots: (x?.slots || []).map(normalizeSlot) }
      }))
      setServiceIds(((ss as { service_id: string }[] | null) || []).map((x) => x.service_id))
    })()
  }, [staff.id])

  const uploadPhoto = async (file: File) => {
    setUploading(true)
    setError(null)
    try {
      const blob = await resizeImage(file, 320)
      const path = `${business.id}/staff-${staff.id}-${Date.now()}.${imageExt(blob)}`
      const { error: upErr } = await supabase.storage.from('logos').upload(path, blob, { contentType: blob.type })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('logos').getPublicUrl(path)
      const { error } = await supabase.from('staff').update({ photo_url: data.publicUrl }).eq('id', staff.id)
      if (error) throw error
      await onPhotoChanged()
      flash('Foto actualizada')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setUploading(false)
    }
  }

  const toggleCustom = async (v: boolean) => {
    setCustom(v)
    if (!v) {
      await supabase.from('staff_schedule_days').delete().eq('staff_id', staff.id)
      flash('Ahora usa el horario del negocio')
    }
  }

  const saveSchedule = async () => {
    if (!days) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('staff_schedule_days').upsert(days.map((d) => ({ ...d, staff_id: staff.id })))
    setBusy(false)
    if (error) return setError(errorMessage(error))
    flash('Horario guardado')
  }

  const toggleService = (id: string) => {
    setServiceIds((ids) => (ids!.includes(id) ? ids!.filter((x) => x !== id) : [...ids!, id]))
  }

  const saveServices = async () => {
    if (!serviceIds) return
    setBusy(true)
    setError(null)
    const { error: e1 } = await supabase.from('staff_services').delete().eq('staff_id', staff.id)
    const { error: e2 } = serviceIds.length > 0
      ? await supabase.from('staff_services').insert(serviceIds.map((service_id) => ({ staff_id: staff.id, service_id })))
      : { error: null }
    setBusy(false)
    if (e1 || e2) return setError(errorMessage(e1 || e2))
    flash('Servicios guardados')
  }

  return (
    <Modal open onClose={onClose} title={staff.name}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <BusinessAvatar name={staff.name} logo={staff.photo_url} size={56} />
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} loading={uploading}>
              {staff.photo_url ? 'Cambiar foto' : 'Subir foto'}
            </Button>
            {staff.photo_url && (
              <Button variant="ghost" size="sm" onClick={async () => {
                await supabase.from('staff').update({ photo_url: null }).eq('id', staff.id)
                await onPhotoChanged()
              }}>Quitar</Button>
            )}
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

        <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
          {(['horario', 'servicios'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === t ? 'bg-white shadow-sm' : 'text-slate-600'}`}
            >
              {t === 'horario' ? 'Horario' : 'Servicios'}
            </button>
          ))}
        </div>

        {tab === 'horario' && (
          <div className="space-y-3">
            <label className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
              <span className="text-sm">
                <b>Horario propio</b>
                <br /><span className="text-slate-500">Si lo apagas, usa el mismo horario que el negocio (en Horario).</span>
              </span>
              <Toggle checked={Boolean(custom)} onChange={toggleCustom} label="Horario propio" />
            </label>
            {custom && days && (
              <>
                {days.map((d) => (
                  <div key={d.weekday} className="rounded-xl bg-slate-50 p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{WEEKDAYS[d.weekday]}</span>
                      <Toggle
                        checked={d.is_open}
                        onChange={(v) => setDays((ds) => ds!.map((x) => (x.weekday === d.weekday ? { ...x, is_open: v } : x)))}
                        label={`Abrir ${WEEKDAYS[d.weekday]}`}
                      />
                    </div>
                    {d.is_open ? (
                      <div className="mt-2">
                        <TimeChips value={d.slots} onChange={(slots) => setDays((ds) => ds!.map((x) => (x.weekday === d.weekday ? { ...x, slots } : x)))} />
                      </div>
                    ) : (
                      <p className="mt-1 text-sm text-slate-400">No trabaja este día</p>
                    )}
                  </div>
                ))}
                <Button block onClick={saveSchedule} loading={busy}>Guardar horario</Button>
              </>
            )}
          </div>
        )}

        {tab === 'servicios' && serviceIds && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              Marca los servicios que hace {staff.name}. Si no marcas ninguno, puede con todos.
            </p>
            <div className="flex flex-wrap gap-2">
              {services.map((sv) => (
                <button
                  key={sv.id}
                  type="button"
                  onClick={() => toggleService(sv.id)}
                  className={`rounded-full px-3 py-1.5 text-sm font-semibold ${serviceIds.includes(sv.id) ? 'bg-brand text-white' : 'bg-white ring-1 ring-slate-300'}`}
                >
                  {sv.name}
                </button>
              ))}
              {services.length === 0 && <p className="text-sm text-slate-400">Todavía no tienes servicios creados.</p>}
            </div>
            <Button block onClick={saveServices} loading={busy}>Guardar servicios</Button>
          </div>
        )}

        {error && <Alert>{error}</Alert>}
      </div>
    </Modal>
  )
}
