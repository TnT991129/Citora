import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Field, LinkButton, Modal, PageLoader, StatusBadge, WhatsAppIcon, flash } from '../../components/ui'
import { servicesText } from '../../lib/appointments'
import { dateKey, fullDateFromIso, money, shortDate, timeOf } from '../../lib/format'
import { errorMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import type { Appointment, Business, CustomerPackage, CustomerSummary, Package } from '../../lib/types'
import { publicUrl } from '../../lib/url'
import { waLink } from '../../lib/whatsapp'
import { usePanel } from './context'
import { Locked, useModule } from './Locked'

type Sort = 'recientes' | 'visitas' | 'gasto' | 'nombre' | 'inactivos'
const INACTIVE_DAYS = 45
const TAGS = ['VIP', 'Frecuente', 'Nuevo', 'Puntual', 'Llega tarde', 'No viene']

export default function Customers() {
  const allowed = useModule('clientes')
  const { business } = usePanel()
  const [list, setList] = useState<CustomerSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<Sort>('recientes')
  const [open, setOpen] = useState<CustomerSummary | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('owner_customers')
    if (error) setError(errorMessage(error))
    else setList(data as CustomerSummary[])
  }, [])

  useEffect(() => {
    if (allowed) load()
  }, [allowed, load])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    const digits = term.replace(/\D/g, '')
    const out = (list || []).filter((c) =>
      !term ||
      c.name.toLowerCase().includes(term) ||
      (digits.length >= 3 && c.phone.includes(digits)) ||
      c.tags.some((t) => t.toLowerCase().includes(term)),
    )
    const by: Record<Sort, (a: CustomerSummary, b: CustomerSummary) => number> = {
      recientes: () => 0, // ya vienen ordenados por actividad
      visitas: (a, b) => b.visits - a.visits,
      gasto: (a, b) => Number(b.spent) - Number(a.spent),
      nombre: (a, b) => a.name.localeCompare(b.name, 'es'),
      // Primero quien tiene más tiempo sin venir (sin ninguna visita, al final)
      inactivos: (a, b) => (a.last_visit || '9999').localeCompare(b.last_visit || '9999'),
    }
    return [...out].sort(by[sort])
  }, [list, q, sort])

  if (!allowed) return <Locked module="clientes" />
  if (error) return <Alert>{error}</Alert>
  if (!list) return <PageLoader />

  const returning = list.filter((c) => c.visits >= 2).length

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Clientes</h1>
        <p className="text-slate-600">
          {list.length} {list.length === 1 ? 'cliente' : 'clientes'} · {returning} han vuelto más de una vez
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <input className="input sm:max-w-xs" placeholder="Buscar por nombre, teléfono o etiqueta…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-auto" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Ordenar">
          <option value="recientes">Más recientes</option>
          <option value="visitas">Más visitas</option>
          <option value="gasto">Más gasto</option>
          <option value="nombre">Nombre (A-Z)</option>
          <option value="inactivos">Más tiempo sin venir</option>
        </select>
      </div>

      {list.length === 0 && (
        <div className="card text-center text-slate-600">
          Cuando tus clientes reserven, aparecerán aquí con su historial.
        </div>
      )}

      <ul className="space-y-2">
        {filtered.map((c) => {
          const daysSince = c.last_visit ? Math.floor((Date.now() - new Date(c.last_visit).getTime()) / 86400000) : null
          const inactive = !c.next_at && daysSince !== null && daysSince >= INACTIVE_DAYS
          return (
          <li key={c.phone}>
            <button onClick={() => setOpen(c)} className="card flex w-full items-center justify-between gap-3 text-left hover:ring-slate-300">
              <div className="min-w-0">
                <p className="truncate font-semibold">
                  {c.name}
                  {c.tags.map((t) => <span key={t} className="chip ml-1.5 bg-slate-100 text-xs text-slate-600">{t}</span>)}
                </p>
                <p className="text-sm text-slate-500">
                  {c.visits} {c.visits === 1 ? 'visita' : 'visitas'}
                  {c.last_visit && <> · última {shortDate(dateKey(c.last_visit, business.timezone))}</>}
                  {c.no_shows > 0 && <span className="text-red-600"> · {c.no_shows} sin venir</span>}
                </p>
                {c.next_at && <p className="text-sm font-medium text-brand">Próxima: {shortDate(dateKey(c.next_at, business.timezone))} · {timeOf(c.next_at, business.timezone)}</p>}
                {inactive && <p className="text-sm font-medium text-amber-700">⏰ {daysSince} días sin venir</p>}
              </div>
              <span className="shrink-0 font-semibold">{money(c.spent, business.currency)}</span>
            </button>
          </li>
          )
        })}
        {list.length > 0 && filtered.length === 0 && <p className="py-6 text-center text-slate-500">Nadie coincide con la búsqueda.</p>}
      </ul>

      {open && (
        <CustomerModal
          customer={open}
          business={business}
          onClose={() => setOpen(null)}
          onSaved={() => {
            setOpen(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function CustomerModal({ customer: c, business, onClose, onSaved }: {
  customer: CustomerSummary
  business: Business
  onClose: () => void
  onSaved: () => void
}) {
  const [history, setHistory] = useState<Appointment[] | null>(null)
  const [note, setNote] = useState(c.note || '')
  const [tags, setTags] = useState<string[]>(c.tags)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('appointments')
      .select('*, appointment_services(name, price, duration_min)')
      .eq('customer_phone', c.phone)
      .order('starts_at', { ascending: false })
      .limit(50)
      .then(({ data, error }) => (error ? setError(errorMessage(error)) : setHistory((data as Appointment[]) || [])))
  }, [c.phone])

  const save = async () => {
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('customer_notes').upsert({
      business_id: business.id,
      phone: c.phone,
      note: note.trim() || null,
      tags,
      updated_at: new Date().toISOString(),
    })
    setBusy(false)
    if (error) return setError(errorMessage(error))
    flash('Ficha guardada')
    onSaved()
  }

  const toggle = (t: string) => setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))
  const first = c.name.split(' ')[0]
  const tz = business.timezone

  return (
    <Modal open onClose={onClose} title={c.name} footer={<Button block onClick={save} loading={busy}>Guardar ficha</Button>}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <a href={`tel:+${c.phone}`} className="font-mono text-slate-700">+{c.phone}</a>
          <LinkButton href={waLink(c.phone, `Hola ${first}, te escribo de ${business.name}. `)} variant="whatsapp" size="sm" newTab>
            <WhatsAppIcon className="h-4 w-4" /> WhatsApp
          </LinkButton>
          <LinkButton
            href={waLink(c.phone, `Hola ${first}, hace tiempo que no te vemos por ${business.name}. ¿Te reservo una cita? Puedes elegir día y hora aquí: ${publicUrl(business.slug)}`)}
            variant="secondary"
            size="sm"
            newTab
          >
            Invitar a volver
          </LinkButton>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <Mini label="Visitas" value={String(c.visits)} />
          <Mini label="Gastado" value={money(c.spent, business.currency)} />
          <Mini label="Sin venir" value={String(c.no_shows)} warn={c.no_shows > 0} />
        </div>
        <p className="text-sm text-slate-500">
          Cliente desde el {fullDateFromIso(c.first_at, tz)} · {c.bookings} {c.bookings === 1 ? 'reserva' : 'reservas'}
          {c.cancelled > 0 && <> · {c.cancelled} {c.cancelled === 1 ? 'cancelada' : 'canceladas'}</>}
        </p>

        <Field label="Etiquetas">
          <div className="flex flex-wrap gap-1.5">
            {TAGS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggle(t)}
                className={`rounded-full px-3 py-1 text-sm font-medium ${tags.includes(t) ? 'bg-brand text-white' : 'bg-white ring-1 ring-slate-300'}`}
              >
                {t}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Notas privadas" hint="Solo las ves tú. Ej. preferencias, alergias, cómo le gusta el corte.">
          <textarea className="input min-h-[80px]" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>

        <BonosSection phone={c.phone} business={business} />

        <div>
          <p className="mb-1 text-sm font-semibold text-slate-700">Historial</p>
          {!history ? (
            <PageLoader />
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
              {history.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium">{shortDate(dateKey(a.starts_at, tz))} · {timeOf(a.starts_at, tz)}</span>
                    <span className="block truncate text-slate-500">{servicesText(a)} · {money(a.total, business.currency)}</span>
                  </span>
                  <StatusBadge status={a.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
        {error && <Alert>{error}</Alert>}
      </div>
    </Modal>
  )
}

function BonosSection({ phone, business }: { phone: string; business: Business }) {
  const [list, setList] = useState<CustomerPackage[] | null>(null)
  const [types, setTypes] = useState<Package[]>([])
  const [selling, setSelling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('customer_packages').select('*').eq('customer_phone', phone).order('sold_at', { ascending: false })
    if (error) setError(errorMessage(error))
    else setList((data as CustomerPackage[]) || [])
  }, [phone])

  useEffect(() => {
    load()
    supabase.from('packages').select('*').eq('active', true).then(({ data }) => setTypes((data as Package[]) || []))
  }, [load])

  const useSession = async (cp: CustomerPackage) => {
    if (cp.sessions_left <= 0) return
    const { error } = await supabase.from('customer_packages').update({ sessions_left: cp.sessions_left - 1 }).eq('id', cp.id)
    if (error) return setError(errorMessage(error))
    load()
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700">Bonos</p>
        <button onClick={() => setSelling(true)} className="text-sm font-semibold text-brand">Vender bono</button>
      </div>
      {!list ? null : list.length === 0 ? (
        <p className="text-sm text-slate-400">No tiene ningún bono.</p>
      ) : (
        <ul className="space-y-1.5">
          {list.map((cp) => (
            <li key={cp.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm">
              <span className="min-w-0 truncate"><b>{cp.package_name}</b> · {cp.sessions_left} de {cp.sessions_total}</span>
              <Button size="sm" variant="secondary" disabled={cp.sessions_left <= 0} onClick={() => useSession(cp)}>Usar 1 sesión</Button>
            </li>
          ))}
        </ul>
      )}
      {error && <div className="mt-2"><Alert>{error}</Alert></div>}
      {selling && (
        <SellPackage
          phone={phone}
          business={business}
          types={types}
          onClose={() => setSelling(false)}
          onDone={() => {
            setSelling(false)
            load()
          }}
        />
      )}
    </div>
  )
}

function SellPackage({ phone, business, types, onClose, onDone }: {
  phone: string
  business: Business
  types: Package[]
  onClose: () => void
  onDone: () => void
}) {
  const [packageId, setPackageId] = useState(types[0]?.id || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (types.length === 0) {
    return (
      <Modal open onClose={onClose} title="Vender bono">
        <p className="text-sm text-slate-600">
          Todavía no tienes ningún bono creado. Ve a Más → Bonos para crear uno primero (ej. "5 cortes").
        </p>
      </Modal>
    )
  }

  const sell = async () => {
    const pkg = types.find((t) => t.id === packageId)
    if (!pkg) return setError('Elige un bono.')
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('customer_packages').insert({
      business_id: business.id, package_id: pkg.id, customer_phone: phone,
      package_name: pkg.name, sessions_total: pkg.sessions, sessions_left: pkg.sessions,
    })
    setBusy(false)
    if (error) return setError(errorMessage(error))
    flash('Bono vendido')
    onDone()
  }

  return (
    <Modal open onClose={onClose} title="Vender bono" footer={<Button block onClick={sell} loading={busy}>Confirmar venta</Button>}>
      <div className="space-y-4">
        <Field label="Bono">
          <select className="input" value={packageId} onChange={(e) => setPackageId(e.target.value)}>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.sessions} sesiones · {money(t.price, business.currency)}</option>)}
          </select>
        </Field>
        <p className="text-xs text-slate-500">Cobra el bono por tu cuenta (Transfermóvil, efectivo...) antes de confirmar.</p>
        {error && <Alert>{error}</Alert>}
      </div>
    </Modal>
  )
}

function Mini({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-50 p-2">
      <p className={`truncate font-extrabold ${warn ? 'text-red-600' : ''}`}>{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  )
}
