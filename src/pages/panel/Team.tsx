import { useEffect, useRef, useState } from 'react'
import { TimeChips } from '../../components/TimeChips'
import { Alert, BusinessAvatar, Button, Field, Modal, Toggle, WhatsAppIcon, flash } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { WEEKDAYS, normalizeSlot } from '../../lib/format'
import { imageExt, resizeImage } from '../../lib/image'
import { supabase } from '../../lib/supabase'
import type { Staff, StaffScheduleDay } from '../../lib/types'
import { staffUrl } from '../../lib/url'
import { shareLink } from '../../lib/whatsapp'
import { usePanel } from './context'
import { Locked, useModule } from './Locked'
import { DistributeServices } from './TeamServices'
import { businessType } from '../../lib/templates'
import { t as tx } from '../../lib/i18n'

const MAX = 20
const ORDER = [1, 2, 3, 4, 5, 6, 0]

/** Profesionales del negocio: cada uno tiene su propia agenda */
export default function Team() {
  const allowed = useModule('empleados')
  const { business, staff, services, reloadStaff } = usePanel()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<{ staff: Staff; justAdded?: boolean } | null>(null)
  const [distributing, setDistributing] = useState(false)

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
    if (n.length < 2) return setError(tx('Escribe el nombre (al menos 2 letras).'))
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
  // Equipo de antes de la 1.4: alguien hace todos los servicios porque nunca se repartieron
  const undistributed = staff.some((s) => s.active && !s.own_services)

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">{tx('Equipo')}</h1>
        <p className="text-slate-600">
          {tx('Añade a las personas que atienden. Cada una tiene su propia agenda: dos clientes pueden reservar a la misma hora con profesionales distintos.')}
        </p>
      </div>

      <section className="card space-y-3">
        <div className="flex gap-2">
          <input
            className="input"
            placeholder={tx('Nombre (ej. Carlos)')}
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <Button onClick={add} loading={busy} disabled={staff.length >= MAX}>{tx('Añadir')}</Button>
        </div>
        {staff.length === 0 && (
          <p className="text-sm text-slate-500">
            {tx('Mientras no añadas a nadie, tu negocio funciona con una sola agenda, como ahora.')}
          </p>
        )}
      </section>

      {error && <Alert>{error}</Alert>}

      {active > 0 && services.length > 0 && (
        undistributed ? (
          <section className="card space-y-3 ring-2 ring-brand/25">
            <div className="flex items-start gap-3">
              <span className="text-2xl" aria-hidden>✂️</span>
              <div>
                <h2 className="font-bold">{tx('Reparte los servicios de tu salón')}</h2>
                <p className="text-sm text-slate-600">
                  {tx('Ahora cada servicio puede ser de una persona: las uñas para tu manicura, las pestañas para tu lashista… Tus clientes los verán agrupados por persona y solo podrán reservar cada uno con quien lo hace.')}
                </p>
              </div>
            </div>
            <Button block onClick={() => setDistributing(true)}>{tx('Repartir servicios')}</Button>
          </section>
        ) : (
          <Button block variant="secondary" onClick={() => setDistributing(true)}>{tx('Repartir servicios entre el equipo')}</Button>
        )
      )}

      {staff.length > 0 && <OwnerCard />}

      {staff.length > 0 && (
        <ul className="space-y-2">
          {staff.map((s, i) => (
            <StaffRow
              key={s.id}
              s={s}
              first={i === 0}
              last={i === staff.length - 1}
              onMove={(dir) => move(i, dir)}
              onRename={(n) => run(() => supabase.from('staff').update({ name: n }).eq('id', s.id), tx('Nombre guardado'))}
              onToggle={(v) => run(() => supabase.from('staff').update({ active: v }).eq('id', s.id))}
              onRemove={() => run(() => supabase.from('staff').delete().eq('id', s.id), tx('{name} quitado', { name: s.name }))}
              onDetail={() => setDetail({ staff: s })}
            />
          ))}
        </ul>
      )}

      {staff.length > 0 && (
        <p className="text-sm text-slate-500">
          {active} {active === 1 ? tx('profesional activo') : tx('profesionales activos')}{tx('. Tus clientes pueden elegir con quién reservar o dejar que se asigne al que esté libre. Los inactivos no reciben reservas nuevas, pero conservan sus citas.')}
        </p>
      )}

      {distributing && <DistributeServices onClose={() => setDistributing(false)} />}
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
          <ArrowBtn label={tx('Subir')} disabled={first} onClick={() => onMove(-1)} d="M6 15l6-6 6 6" />
          <ArrowBtn label={tx('Bajar')} disabled={last} onClick={() => onMove(1)} d="M6 9l6 6 6-6" />
        </div>
        <BusinessAvatar name={s.name} logo={s.photo_url} size={40} />
        <input
          className="input min-w-0 flex-1"
          defaultValue={s.name}
          maxLength={60}
          aria-label={tx('Nombre')}
          onBlur={(e) => {
            const n = e.target.value.trim()
            if (n.length >= 2 && n !== s.name) onRename(n)
          }}
        />
        <Toggle checked={s.active} onChange={onToggle} label={tx('Activo')} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button size="sm" variant="secondary" onClick={onDetail}>{tx('Horario, servicios y su enlace')}</Button>
        {confirm ? (
          <span className="flex gap-1">
            <Button size="sm" variant="danger" onClick={onRemove}>{tx('Quitar')}</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>{tx('No')}</Button>
          </span>
        ) : (
          <button onClick={() => setConfirm(true)} className="rounded-lg px-2 py-1 text-sm font-medium text-red-600 hover:bg-red-50">{tx('Quitar')}</button>
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
      flash(tx('Foto actualizada'))
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
      flash(tx('Ahora usa el horario del negocio'))
    }
  }

  const saveSchedule = async () => {
    if (!days) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('staff_schedule_days').upsert(days.map((d) => ({ ...d, staff_id: staff.id })))
    setBusy(false)
    if (error) return setError(errorMessage(error))
    flash(tx('Horario guardado'))
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
    flash(tx('Servicios guardados'))
    void reloadStaff()
  }

  return (
    <Modal open onClose={onClose} title={staff.name}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <BusinessAvatar name={staff.name} logo={staff.photo_url} size={56} />
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} loading={uploading}>
              {staff.photo_url ? tx('Cambiar foto') : tx('Subir foto')}
            </Button>
            {staff.photo_url && (
              <Button variant="ghost" size="sm" onClick={async () => {
                await supabase.from('staff').update({ photo_url: null }).eq('id', staff.id)
                await onPhotoChanged()
              }}>{tx('Quitar')}</Button>
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

        <SpecialtyField staff={staff} onSaved={reloadStaff} />

        <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
          {(['horario', 'servicios', 'enlace'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === t ? 'bg-white shadow-sm' : 'text-slate-600'}`}
            >
              {t === 'horario' ? tx('Horario') : t === 'servicios' ? tx('Servicios') : tx('Su enlace')}
            </button>
          ))}
        </div>

        {tab === 'horario' && (
          <div className="space-y-3">
            <label className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
              <span className="text-sm">
                <b>{tx('Horario propio')}</b>
                <br /><span className="text-slate-500">{tx('Si lo apagas, usa el mismo horario que el negocio (en Horario).')}</span>
              </span>
              <Toggle checked={Boolean(custom)} onChange={toggleCustom} label={tx('Horario propio')} />
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
                        label={tx('Abrir {v}', { v: WEEKDAYS[d.weekday] })}
                      />
                    </div>
                    {d.is_open ? (
                      <div className="mt-2">
                        <TimeChips value={d.slots} onChange={(slots) => setDays((ds) => ds!.map((x) => (x.weekday === d.weekday ? { ...x, slots } : x)))} />
                      </div>
                    ) : (
                      <p className="mt-1 text-sm text-slate-400">{tx('No trabaja este día')}</p>
                    )}
                  </div>
                ))}
                <Button block onClick={saveSchedule} loading={busy}>{tx('Guardar horario')}</Button>
              </>
            )}
          </div>
        )}

        {tab === 'servicios' && serviceIds && (
          <div className="space-y-3">
            <div className="grid gap-2">
              {([
                [true, tx('Sus propios servicios'), tx('Los crea {v} con su enlace (pestaña "Su enlace"). Si quieres, márcale también alguno de los tuyos.', { v: staff.name.split(' ')[0] })],
                [false, tx('Todos los servicios del negocio'), tx('Hace todo lo que ofreces: los clientes pueden reservar cualquier servicio con esta persona.')],
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
              {services.length === 0 && <p className="text-sm text-slate-400">{tx('Todavía no tienes servicios creados.')}</p>}
            </div>
            )}
            <Button block onClick={saveServices} loading={busy}>{tx('Guardar')}</Button>
          </div>
        )}

        {tab === 'enlace' && serviceIds && <StaffLink staff={staff} canEditServices={own || serviceIds.length > 0} autoCreate={justAdded} />}

        {error && <Alert>{error}</Alert>}
      </div>
    </Modal>
  )
}

/**
 * El dueño también atiende: los servicios que no son de nadie del equipo son los suyos y salen en la
 * página con su nombre y su especialidad ("Peluquería · con Osmel"), igual que los de cada profesional.
 */
function OwnerCard() {
  const { business, reloadBusiness } = usePanel()
  const [name, setName] = useState(business.owner_name || '')
  const [specialty, setSpecialty] = useState(business.owner_specialty || '')
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    const n = name.trim()
    const sp = specialty.trim()
    if (n === (business.owner_name || '') && sp === (business.owner_specialty || '')) return
    const { error } = await supabase.from('businesses').update({ owner_name: n || null, owner_specialty: sp || null }).eq('id', business.id)
    if (error) return setError(errorMessage(error))
    flash(tx('Guardado'))
    await reloadBusiness()
  }
  const bt = businessType(business.business_type)
  const typeName = bt.key !== 'otro' ? bt.name : null
  return (
    <section className={`card space-y-3 ${business.owner_specialty ? '' : 'ring-2 ring-brand/25'}`}>
      <div className="flex items-center gap-3">
        <span className="shrink-0"><BusinessAvatar name={business.name} logo={business.logo_url} size={40} /></span>
        <div className="min-w-0">
          <h2 className="font-bold">{tx('Tú también atiendes')}</h2>
          <p className="text-sm text-slate-500">{tx('Los servicios que no son de nadie del equipo son los tuyos. En tu página salen con tu nombre y tu especialidad.')}</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={tx('Tu nombre')}>
          <input className="input" value={name} maxLength={40} placeholder={tx('Ej. Osmel')} onChange={(e) => setName(e.target.value)} onBlur={save} />
        </Field>
        <Field label={tx('Tu especialidad')}>
          <input className="input" value={specialty} maxLength={40} placeholder={tx('Ej. Peluquería')} onChange={(e) => setSpecialty(e.target.value)} onBlur={save} />
        </Field>
      </div>
      {!business.owner_specialty && (
        <p className="text-xs text-slate-500">
          {tx('Mientras no la pongas, tus servicios salen en tu página como «')}{typeName || name.trim() || tx('Servicios')}{tx('», arriba del todo, y los de tu equipo debajo con su especialidad.')}
        </p>
      )}
      {error && <Alert>{error}</Alert>}
    </section>
  )
}

/** Especialidad (ej. "Uñas"): en la página de reservas, sus servicios salen agrupados con este título */
function SpecialtyField({ staff, onSaved }: { staff: Staff; onSaved: () => Promise<void> }) {
  const [value, setValue] = useState(staff.specialty || '')
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    const v = value.trim()
    if (v === (staff.specialty || '')) return
    const { error } = await supabase.from('staff').update({ specialty: v || null }).eq('id', staff.id)
    if (error) return setError(errorMessage(error))
    flash(tx('Especialidad guardada'))
    await onSaved()
  }
  return (
    <div>
      <label className="label" htmlFor="especialidad">{tx('Especialidad')}</label>
      <input
        id="especialidad"
        className="input"
        value={value}
        maxLength={40}
        placeholder={tx('Ej. Uñas, Pestañas, Peluquería')}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
      />
      <p className="mt-1 text-xs text-slate-500">{tx('En tu página, sus servicios salen agrupados con este título.')}</p>
      {error && <div className="mt-2"><Alert>{error}</Alert></div>}
    </div>
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
    if (action === 'anular' && !window.confirm(tx('¿Anular el enlace de {first}? Dejará de funcionar y tendrás que mandarle uno nuevo.', { first: first }))) return
    setBusy(action)
    setError(null)
    const { data, error } = await supabase.rpc('owner_staff_link', { p_staff: staff.id, p_action: action })
    setBusy(null)
    if (error) return setError(errorMessage(error))
    setToken((data as string | null) || null)
    if (action === 'nuevo') flash(tx('Enlace nuevo creado. El anterior ya no funciona.'))
    if (action === 'anular') flash(tx('Enlace anulado'))
    void reloadStaff()
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      flash(tx('Enlace copiado'))
    } catch {
      flash(tx('No se pudo copiar'))
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        {tx('Con este enlace,')}{' '}<b>{first}</b> {tx('cambia desde su móvil')}{' '}<b>{tx('sus servicios')}</b> {tx('(nombre, precio, duración) y')}{' '}<b>{tx('su horario')}</b>{tx(', sin crear cuenta. Solo puede tocar lo suyo: los servicios que comparte con otras personas del equipo los sigues cambiando tú.')}
      </p>
      {autoCreate && (
        <Alert kind="success">
          <b>{first}</b> {tx('ya está en tu equipo. Mándale su enlace: con él crea sus servicios con sus precios y pone su horario. Hasta que cree alguno, no se puede reservar con ella.')}
        </Alert>
      )}
      {!canEditServices && (
        <Alert kind="warning">
          {first} {tx('hace todos los servicios del negocio, así que con el enlace solo puede cambiar su horario. Para que tenga los suyos, elige "Sus propios servicios" en la pestaña')}{' '}<b>{tx('Servicios')}</b>.
        </Alert>
      )}
      {!token ? (
        <Button block onClick={() => act('ver')} loading={busy === 'ver'}>{tx('Crear enlace para')}{' '}{first}</Button>
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
              <WhatsAppIcon className="h-4 w-4" /> {tx('Mandárselo por WhatsApp')}
            </a>
            <Button variant="secondary" onClick={copy}>{tx('Copiar')}</Button>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="ghost" onClick={() => act('nuevo')} loading={busy === 'nuevo'}>{tx('Hacer uno nuevo')}</Button>
            <Button size="sm" variant="ghost" onClick={() => act('anular')} loading={busy === 'anular'} className="text-red-600">{tx('Anular enlace')}</Button>
          </div>
          <p className="text-xs text-slate-500">{tx('Si')}{' '}{first} {tx('deja de trabajar contigo o el enlace llega a otra persona, anúlalo: deja de funcionar al momento.')}</p>
        </>
      )}
      {error && <Alert>{error}</Alert>}
    </div>
  )
}
