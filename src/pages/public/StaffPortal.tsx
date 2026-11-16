// Enlace privado de un profesional del equipo (/:slug/equipo/:token): sin cuenta, es su pequeño
// panel. Agenda (sus citas: confirmar, si vino, cancelar, apuntar a mano), sus números, SUS servicios
// (nombre, precio, duración, si se ven) y SU horario. Los servicios que comparte con otras personas
// del equipo solo los ve: los cambia el dueño. Todo pasa por staff_portal_* (schema.sql).
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { TimeChips } from '../../components/TimeChips'
import { Alert, BusinessAvatar, Button, CitoraLogo, Field, Modal, PageLoader, Toggle, flash } from '../../components/ui'
import { setBrandColor } from '../../lib/brand'
import { errorMessage } from '../../lib/errors'
import { duration, money, WEEKDAYS } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import { StaffAgenda, StaffStats } from './StaffPortalAgenda'

interface PortalService {
  id: string
  name: string
  description: string | null
  price: number
  duration_min: number
  active: boolean
  is_extra: boolean
  has_options: boolean
  shared: boolean
}
interface PortalDay { weekday: number; is_open: boolean; slots: string[] }
interface Portal {
  staff: { id: string; name: string; photo_url: string | null; specialty?: string | null }
  business: { name: string; slug: string; logo_url: string | null; color_primary: string; currency: string; usd_prices: boolean; timezone: string }
  all_services: boolean
  bookable?: { id: string; name: string; is_extra: boolean }[]
  services: PortalService[]
  schedule: PortalDay[]
  business_schedule: PortalDay[]
}
interface Editing { id: string | null; name: string; price: string; duration_min: number; description: string; active: boolean; is_extra: boolean }

const ORDER = [1, 2, 3, 4, 5, 6, 0]
const DURATIONS = [5, 10, 15, 20, 30, 45, 60, 75, 90, 105, 120, 150, 180, 210, 240, 300, 360, 420, 480, 540, 600]

export default function StaffPortal() {
  const { token = '' } = useParams()
  const [data, setData] = useState<Portal | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  // Horario: null = usa el del negocio
  const [days, setDays] = useState<PortalDay[] | null>(null)
  const [custom, setCustom] = useState(false)
  const [scheduleDirty, setScheduleDirty] = useState(false)
  const [specialty, setSpecialty] = useState('')
  const [tab, setTab] = useState<'agenda' | 'numeros' | 'servicios' | 'horario'>('agenda')

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('staff_portal', { p_token: token })
    if (error) return setError(errorMessage(error))
    const p = data as Portal
    setData(p)
    setSpecialty(p.staff.specialty || '')
    setBrandColor(p.business.color_primary)
    document.title = `${p.staff.name} · ${p.business.name}`
    const own = p.schedule.length > 0
    setCustom(own)
    const base = own ? p.schedule : p.business_schedule
    const map = new Map(base.map((d) => [d.weekday, d]))
    setDays(ORDER.map((w) => ({ weekday: w, is_open: map.get(w)?.is_open ?? false, slots: map.get(w)?.slots || [] })))
    setScheduleDirty(false)
  }, [token])

  useEffect(() => {
    load()
  }, [load])

  if (error && !data) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <CitoraLogo className="text-xl" />
        <h1 className="text-xl font-bold">No se puede abrir</h1>
        <p className="text-slate-600">{error}</p>
      </div>
    )
  }
  if (!data || !days) return <PageLoader />

  const b = data.business
  const currency = b.usd_prices ? 'USD' : b.currency
  const first = data.staff.name.split(' ')[0]
  const own = data.services.filter((s) => !s.shared && !s.has_options)

  const openNew = (is_extra = false) => {
    setFormError(null)
    setEditing({ id: null, name: '', price: '', duration_min: is_extra ? 15 : 60, description: '', active: true, is_extra })
  }
  const openEdit = (s: PortalService) => {
    setFormError(null)
    setEditing({ id: s.id, name: s.name, price: String(s.price), duration_min: s.duration_min, description: s.description || '', active: s.active, is_extra: s.is_extra })
  }

  const saveService = async () => {
    if (!editing) return
    const price = Number(editing.price.replace(',', '.'))
    if (!editing.name.trim()) return setFormError('Escribe el nombre del servicio.')
    if (editing.price.trim() === '' || !(price >= 0)) return setFormError('Escribe el precio (puede ser 0).')
    setBusy(true)
    setFormError(null)
    const { error } = await supabase.rpc('staff_portal_save_service', {
      p_token: token, p_id: editing.id, p_name: editing.name.trim(), p_price: price, p_duration: editing.duration_min,
      p_description: editing.description.trim() || null, p_active: editing.active, p_is_extra: editing.is_extra,
    })
    setBusy(false)
    if (error) return setFormError(errorMessage(error))
    setEditing(null)
    flash('Guardado. Tus clientes ya lo ven así.')
    load()
  }

  const saveSchedule = async () => {
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('staff_portal_save_schedule', { p_token: token, p_days: custom ? days : [] })
    setBusy(false)
    if (error) return setError(errorMessage(error))
    flash(custom ? 'Horario guardado' : 'Ahora usas el horario del negocio')
    load()
  }

  const saveSpecialty = async () => {
    const v = specialty.trim()
    if (v === (data.staff.specialty || '')) return
    const { error } = await supabase.rpc('staff_portal_save_profile', { p_token: token, p_specialty: v })
    if (error) return setError(errorMessage(error))
    flash('Especialidad guardada')
    load()
  }

  const setDay = (w: number, patch: Partial<PortalDay>) => {
    setScheduleDirty(true)
    setDays((ds) => ds!.map((d) => (d.weekday === w ? { ...d, ...patch } : d)))
  }

  return (
    <div className="min-h-dvh pb-28">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur-lg">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-2.5">
          <BusinessAvatar name={b.name} logo={b.logo_url} size={36} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold leading-tight">{b.name}</p>
            <p className="truncate text-xs text-slate-500">Equipo · {data.staff.name}</p>
          </div>
          <BusinessAvatar name={data.staff.name} logo={data.staff.photo_url} size={36} />
        </div>
      </header>

      <nav className="sticky top-[57px] z-10 border-b border-slate-200 bg-white/90 backdrop-blur-lg">
        <div className="no-scrollbar scroll-fade-x mx-auto flex max-w-xl gap-1 overflow-x-auto px-3 py-2">
          {([['agenda', 'Agenda'], ['numeros', 'Números'], ['servicios', 'Servicios'], ['horario', 'Horario']] as const).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              aria-current={tab === k ? 'page' : undefined}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-bold transition ${tab === k ? 'bg-brand text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {l}
            </button>
          ))}
        </div>
      </nav>

      <main className="ui-page mx-auto max-w-xl space-y-6 px-4 py-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Hola, {first} 👋</h1>
          <p className="mt-1 text-slate-600">
            {tab === 'agenda' && 'Tus citas de la semana. Apunta aquí también las que te piden por WhatsApp.'}
            {tab === 'numeros' && 'Cómo te va: tus citas, tus clientes y lo que más te piden.'}
            {tab === 'servicios' && `Lo que guardes lo ven al momento los clientes de ${b.name}.`}
            {tab === 'horario' && 'Tus clientes solo pueden reservar contigo en estas horas.'}
            {' '}Este enlace es solo para ti: no lo compartas.
          </p>
        </div>

        {tab === 'agenda' && (
          <StaffAgenda
            token={token}
            tz={b.timezone}
            currency={currency}
            businessName={b.name}
            services={(data.bookable || []).filter((s) => !s.is_extra).map((s) => ({ id: s.id, name: s.name, active: true, shared: false }))}
          />
        )}
        {tab === 'numeros' && <StaffStats token={token} currency={currency} />}

        {tab === 'servicios' && (<>
        <section className="card">
          <Field label="Tu especialidad" hint={`En la página de ${b.name}, tus servicios salen agrupados con este título.`}>
            <input className="input" value={specialty} maxLength={40} placeholder="Ej. Uñas, Pestañas, Peluquería" onChange={(e) => setSpecialty(e.target.value)} onBlur={saveSpecialty} />
          </Field>
        </section>

        <section>
          <div className="mb-2 flex items-end justify-between gap-3 px-1">
            <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Tus servicios</h2>
            {!data.all_services && <Button size="sm" onClick={() => openNew()}>+ Añadir</Button>}
          </div>
          {data.all_services ? (
            <div className="card text-sm text-slate-600">
              Ahora mismo haces <b>todos los servicios</b> del negocio. Para tener tus propios servicios y precios, pídele al dueño que marque en <b>Equipo</b> cuáles haces tú.
            </div>
          ) : (
            <div className="card divide-y divide-slate-100 overflow-hidden p-0 sm:p-0">
              {data.services.map((s) => {
                const locked = s.shared || s.has_options
                return (
                  <button
                    key={s.id}
                    onClick={() => !locked && openEdit(s)}
                    disabled={locked}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition enabled:hover:bg-slate-50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate font-semibold ${s.active ? '' : 'text-slate-400 line-through'}`}>{s.is_extra ? '+ ' : ''}{s.name}</span>
                      <span className="block truncate text-sm text-slate-500">
                        {duration(s.duration_min)}
                        {!s.active && ' · oculto'}
                        {locked && (s.shared ? ' · compartido, lo cambia el dueño' : ' · con opciones, lo cambia el dueño')}
                      </span>
                    </span>
                    <span className="shrink-0 font-bold">{money(s.price, currency)}</span>
                  </button>
                )
              })}
              {data.services.length === 0 && <p className="px-4 py-3.5 text-sm text-slate-500">Todavía no tienes servicios.</p>}
            </div>
          )}
          {!data.all_services && own.length === 0 && data.services.length > 0 && (
            <p className="mt-2 px-1 text-sm text-slate-500">Todos tus servicios los compartes con otras personas del equipo. Puedes añadir los tuyos con "+ Añadir".</p>
          )}
          {!data.all_services && (
            <button onClick={() => openNew(true)} className="mt-2 px-1 text-sm font-semibold text-brand">+ Añadir un extra (algo que se suma a un servicio)</button>
          )}
        </section>

        </>)}

        {tab === 'horario' && (
        <section>
          <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Tu horario</h2>
          <div className="card space-y-3">
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm">
                <b>Horario propio</b>
                <br /><span className="text-slate-500">{custom ? 'Tus clientes solo pueden reservar contigo en estas horas.' : `Ahora usas el mismo horario que ${b.name}.`}</span>
              </span>
              <Toggle checked={custom} onChange={(v) => { setCustom(v); setScheduleDirty(true) }} label="Horario propio" />
            </label>
            {custom && days.map((d) => (
              <div key={d.weekday} className="rounded-xl bg-slate-50 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{WEEKDAYS[d.weekday]}</span>
                  <Toggle checked={d.is_open} onChange={(v) => setDay(d.weekday, { is_open: v })} label={`Trabajo el ${WEEKDAYS[d.weekday]}`} />
                </div>
                {d.is_open ? (
                  <div className="mt-2"><TimeChips value={d.slots} onChange={(slots) => setDay(d.weekday, { slots })} /></div>
                ) : (
                  <p className="mt-1 text-sm text-slate-400">No trabajo este día</p>
                )}
              </div>
            ))}
            {error && <Alert>{error}</Alert>}
          </div>
        </section>
        )}
      </main>

      {scheduleDirty && tab === 'horario' && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur safe-bottom">
          <div className="mx-auto max-w-xl">
            <Button block size="lg" onClick={saveSchedule} loading={busy}>Guardar horario</Button>
          </div>
        </div>
      )}

      {editing && (
        <Modal
          open
          onClose={() => setEditing(null)}
          title={editing.id ? 'Cambiar servicio' : editing.is_extra ? 'Nuevo extra' : 'Nuevo servicio'}
          footer={<Button block size="lg" onClick={saveService} loading={busy}>Guardar</Button>}
        >
          <div className="space-y-4">
            <Field label="Nombre">
              <input className="input" value={editing.name} maxLength={80} placeholder="Ej. Pestañas pelo a pelo" onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Precio (${currency})`}>
                <input className="input" inputMode="decimal" value={editing.price} placeholder="0" onChange={(e) => setEditing({ ...editing, price: e.target.value })} />
              </Field>
              <Field label="Duración">
                <select className="input" value={editing.duration_min} onChange={(e) => setEditing({ ...editing, duration_min: Number(e.target.value) })}>
                  {Array.from(new Set([...DURATIONS, editing.duration_min])).sort((x, y) => x - y).map((m) => <option key={m} value={m}>{duration(m)}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Descripción (opcional)">
              <textarea className="input min-h-[70px]" value={editing.description} maxLength={300} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </Field>
            <label className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
              <span className="text-sm"><b>Se ve en la página</b><br /><span className="text-slate-500">Si lo apagas, los clientes no pueden reservarlo.</span></span>
              <Toggle checked={editing.active} onChange={(v) => setEditing({ ...editing, active: v })} label="Se ve en la página" />
            </label>
            {formError && <Alert>{formError}</Alert>}
          </div>
        </Modal>
      )}
    </div>
  )
}
