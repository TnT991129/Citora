import { useEffect, useRef, useState } from 'react'
import { TimeChips } from '../../components/TimeChips'
import { Alert, BusinessAvatar, Button, Modal, Toggle, WhatsAppIcon, flash } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { WEEKDAYS, normalizeSlot } from '../../lib/format'
import { imageExt, resizeImage } from '../../lib/image'
import { supabase } from '../../lib/supabase'
import type { Staff, StaffScheduleDay } from '../../lib/types'
import { staffUrl } from '../../lib/url'
import { shareLink } from '../../lib/whatsapp'
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
  const [detail, setDetail] = useState<{ staff: Staff; justAdded?: boolean } | null>(null)

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
    setError(null)
    // Empieza sin servicios: los crea ella misma con su enlace (se abre al momento para mandárselo)
    const { data, error } = await supabase
      .from('staff')
      .insert({ business_id: business.id, name: n, position: staff.length, own_services: true })
      .select('*')
      .single()
    setBusy(false)
    if (error) return setError(errorMessage(error))
    setName('')
    await reloadStaff()
    setDetail({ staff: data as Staff, justAdded: true })
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
              onDetail={() => setDetail({ staff: s })}
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

      {detail && <StaffDetailsModal staff={detail.staff} justAdded={detail.justAdded} onClose={() => setDetail(null)} onPhotoChanged={reloadStaff} />}
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
    <li className={`card space-y-3 ${s.active ? '' : 'opacity-60'}`}>
      <div className="flex items-center gap-3">
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
        <Toggle checked={s.active} onChange={onToggle} label="Activo" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button size="sm" variant="secondary" onClick={onDetail}>Horario, servicios y su enlace</Button>
        {confirm ? (
          <span className="flex gap-1">
            <Button size="sm" variant="danger" onClick={onRemove}>Quitar</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>No</Button>
          </span>
        ) : (
          <button onClick={() => setConfirm(true)} className="rounded-lg px-2 py-1 text-sm font-medium text-red-600 hover:bg-red-50">Quitar</button>
        )}
      </div>
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

function StaffDetailsModal({ staff, justAdded, onClose, onPhotoChanged }: { staff: Staff; justAdded?: boolean; onClose: () => void; onPhotoChanged: () => Promise<void> | void }) {
  const { business, services, reloadStaff } = usePanel()
  const [tab, setTab] = useState<'horario' | 'servicios' | 'enlace'>(justAdded ? 'enlace' : 'horario')
  // true = solo hace sus propios servicios (los crea con su enlace); false = hace todos si no se marca ninguno
  const [own, setOwn] = useState(Boolean(staff.own_services))
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
    const ids = own ? serviceIds : []
    const { error: e0 } = await supabase.from('staff').update({ own_services: own }).eq('id', staff.id)
    const { error: e1 } = await supabase.from('staff_services').delete().eq('staff_id', staff.id)
    const { error: e2 } = ids.length > 0
      ? await supabase.from('staff_services').insert(ids.map((service_id) => ({ staff_id: staff.id, service_id })))
      : { error: null }
    setBusy(false)
    if (e0 || e1 || e2) return setError(errorMessage(e0 || e1 || e2))
    if (!own) setServiceIds([])
    flash('Servicios guardados')
    void reloadStaff()
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
          {(['horario', 'servicios', 'enlace'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === t ? 'bg-white shadow-sm' : 'text-slate-600'}`}
            >
              {t === 'horario' ? 'Horario' : t === 'servicios' ? 'Servicios' : 'Su enlace'}
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
            <div className="grid gap-2">
              {([
                [true, 'Sus propios servicios', `Los crea ${staff.name.split(' ')[0]} con su enlace (pestaña "Su enlace"). Si quieres, márcale también alguno de los tuyos.`],
                [false, 'Todos los servicios del negocio', 'Hace todo lo que ofreces: los clientes pueden reservar cualquier servicio con esta persona.'],
              ] as const).map(([v, t, d]) => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => setOwn(v)}
                  aria-pressed={own === v}
                  className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${own === v ? 'border-brand bg-brand/5 ring-1 ring-brand' : 'border-slate-200'}`}
                >
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${own === v ? 'border-brand bg-brand' : 'border-slate-300'}`}>
                    {own === v && <span className="h-2 w-2 rounded-full bg-white" />}
                  </span>
                  <span><span className="block font-semibold">{t}</span><span className="block text-sm text-slate-500">{d}</span></span>
                </button>
              ))}
            </div>
            {own && (
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
            )}
            <Button block onClick={saveServices} loading={busy}>Guardar</Button>
          </div>
        )}

        {tab === 'enlace' && serviceIds && <StaffLink staff={staff} canEditServices={own || serviceIds.length > 0} autoCreate={justAdded} />}

        {error && <Alert>{error}</Alert>}
      </div>
    </Modal>
  )
}

/** Enlace privado para que el propio profesional cambie sus servicios y su horario, sin cuenta */
function StaffLink({ staff, canEditServices, autoCreate }: { staff: Staff; canEditServices: boolean; autoCreate?: boolean }) {
  const { business, reloadStaff } = usePanel()
  const [token, setToken] = useState<string | null>(staff.edit_token || null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const first = staff.name.split(' ')[0]
  const url = token ? staffUrl(business.slug, token) : ''

  // Recién añadida: el enlace ya está listo para mandárselo
  useEffect(() => {
    if (autoCreate && !staff.edit_token) void act('ver')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const act = async (action: 'ver' | 'nuevo' | 'anular') => {
    if (action === 'anular' && !window.confirm(`¿Anular el enlace de ${first}? Dejará de funcionar y tendrás que mandarle uno nuevo.`)) return
    setBusy(action)
    setError(null)
    const { data, error } = await supabase.rpc('owner_staff_link', { p_staff: staff.id, p_action: action })
    setBusy(null)
    if (error) return setError(errorMessage(error))
    setToken((data as string | null) || null)
    if (action === 'nuevo') flash('Enlace nuevo creado. El anterior ya no funciona.')
    if (action === 'anular') flash('Enlace anulado')
    void reloadStaff()
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      flash('Enlace copiado')
    } catch {
      flash('No se pudo copiar')
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Con este enlace, <b>{first}</b> cambia desde su móvil <b>sus servicios</b> (nombre, precio, duración) y <b>su horario</b>, sin crear cuenta.
        Solo puede tocar lo suyo: los servicios que comparte con otras personas del equipo los sigues cambiando tú.
      </p>
      {autoCreate && (
        <Alert kind="success">
          <b>{first}</b> ya está en tu equipo. Mándale su enlace: con él crea sus servicios con sus precios y pone su horario. Hasta que cree alguno, no se puede reservar con ella.
        </Alert>
      )}
      {!canEditServices && (
        <Alert kind="warning">
          {first} hace todos los servicios del negocio, así que con el enlace solo puede cambiar su horario. Para que tenga los suyos, elige "Sus propios servicios" en la pestaña <b>Servicios</b>.
        </Alert>
      )}
      {!token ? (
        <Button block onClick={() => act('ver')} loading={busy === 'ver'}>Crear enlace para {first}</Button>
      ) : (
        <>
          <p className="break-all rounded-xl bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600">{url.replace(/^https?:\/\//, '')}</p>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <a
              href={shareLink(`Hola ${first}, este es tu enlace de ${business.name} para cambiar tus servicios y tu horario. Es solo para ti, no lo compartas: ${url}`)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-btn bg-[#25D366] px-4 py-2.5 font-semibold text-white shadow-sm"
            >
              <WhatsAppIcon className="h-4 w-4" /> Mandárselo por WhatsApp
            </a>
            <Button variant="secondary" onClick={copy}>Copiar</Button>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="ghost" onClick={() => act('nuevo')} loading={busy === 'nuevo'}>Hacer uno nuevo</Button>
            <Button size="sm" variant="ghost" onClick={() => act('anular')} loading={busy === 'anular'} className="text-red-600">Anular enlace</Button>
          </div>
          <p className="text-xs text-slate-500">Si {first} deja de trabajar contigo o el enlace llega a otra persona, anúlalo: deja de funcionar al momento.</p>
        </>
      )}
      {error && <Alert>{error}</Alert>}
    </div>
  )
}
