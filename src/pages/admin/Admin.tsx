import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Alert, Button, CitoraLogo, Field, LinkButton, Modal, PageLoader, StatusBadge, WhatsAppIcon, flash } from '../../components/ui'
import { useSession } from '../../lib/auth'
import { CITORA_COLOR, setBrandColor } from '../../lib/brand'
import { setAppManifest } from '../../lib/pwa'
import { errorMessage } from '../../lib/errors'
import { daysLeft, fullDateFromIso, money } from '../../lib/format'
import { PLAN_LABEL, SINGLE_PLAN } from '../../lib/plans'
import { supabase } from '../../lib/supabase'
import { businessType } from '../../lib/templates'
import type { BusinessStatus, PlanKey } from '../../lib/types'
import { publicUrl } from '../../lib/url'
import { waLink } from '../../lib/whatsapp'
import AdminStats from './AdminStats'

// Una cuenta de dueño. Los campos del negocio son null si se registró pero no terminó de crearlo.
interface AdminOwner {
  user_id: string
  email: string | null
  signed_up_at: string
  last_sign_in_at: string | null
  id: string | null
  name: string | null
  slug: string | null
  code: string | null
  business_type: string | null
  whatsapp: string | null
  plan: PlanKey | null
  trial_ends_at: string | null
  paid_until: string | null
  created_at: string | null
  status: BusinessStatus | 'sin_negocio'
}

type OwnerWithBusiness = AdminOwner & { id: string; name: string; code: string }

interface Settings {
  card_number: string
  card_holder: string
  admin_whatsapp: string
  price_basico: number
  price_plus: number
  price_ultra: number
  trial_days: number
}

export default function Admin() {
  const session = useSession()
  const [isAdmin, setIsAdmin] = useState<boolean | undefined>(undefined)
  const [tab, setTab] = useState<'duenos' | 'estadisticas' | 'ajustes'>('duenos')

  useEffect(() => {
    setBrandColor(null)
    document.title = 'Administración · Citora'
    setAppManifest({ name: 'Citora Admin', path: 'admin', color: CITORA_COLOR })
  }, [])

  useEffect(() => {
    if (!session) return
    supabase.rpc('is_platform_admin').then(({ data }) => setIsAdmin(Boolean(data)))
  }, [session])

  if (session === null) return <Navigate to="/entrar?next=%2Fadmin" replace />
  if (session === undefined || isAdmin === undefined) return <PageLoader />
  if (!isAdmin) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <CitoraLogo className="text-xl" />
        <h1 className="text-xl font-bold">Esta cuenta no es de administrador</h1>
        <p className="text-slate-600">
          Estás conectado como <b>{session.user.email}</b>, que es la cuenta de un negocio. Para ver tu panel de administrador entra con tu correo de administrador.
        </p>
        <Button block onClick={() => supabase.auth.signOut()}>Entrar con otra cuenta</Button>
      </div>
    )
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <CitoraLogo className="text-lg" />
            <span className="chip bg-slate-900 text-white">Admin</span>
          </div>
          <div className="flex items-center gap-1">
            {(['duenos', 'estadisticas', 'ajustes'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === t ? 'bg-citora-100 text-citora-700' : 'text-slate-600 hover:bg-slate-100'}`}>
                {t === 'duenos' ? 'Dueños' : t === 'estadisticas' ? 'Estadísticas' : 'Ajustes'}
              </button>
            ))}
            <button onClick={() => supabase.auth.signOut()} className="ml-1 rounded-lg px-2 py-1.5 text-sm text-slate-500 hover:bg-slate-100">Salir</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-5">{tab === 'duenos' ? <Owners /> : tab === 'estadisticas' ? <AdminStats /> : <SettingsForm />}</main>
    </div>
  )
}

type Filter = 'todos' | BusinessStatus | 'sin_negocio'
type Sort = 'recientes' | 'pago'

const FILTER_LABEL: Record<Filter, string> = {
  todos: 'Todos', activo: 'Pagando', prueba: 'En prueba', vencido: 'Vencidos', sin_negocio: 'Sin negocio',
}

function Owners() {
  const [list, setList] = useState<AdminOwner[] | null>(null)
  const [prices, setPrices] = useState({ basico: 1500, plus: 2000, ultra: 2500 })
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('todos')
  const [sort, setSort] = useState<Sort>('recientes')
  const [q, setQ] = useState('')
  const [activating, setActivating] = useState<OwnerWithBusiness | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_list_owners')
    if (error) setError(errorMessage(error))
    else setList(data as AdminOwner[])
    const { data: p } = await supabase.rpc('get_public_prices')
    if (p) setPrices(p as typeof prices)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Fecha en la que le toca pagar: fin del plan pagado o fin de la prueba
  const dueDate = (o: AdminOwner) => (o.status === 'activo' ? o.paid_until : o.status === 'prueba' ? o.trial_ends_at : null)

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    const out = (list || []).filter((o) =>
      (filter === 'todos' || o.status === filter) &&
      (!term || [o.email, o.name, o.code, o.slug, o.whatsapp].some((x) => (x || '').toLowerCase().includes(term))),
    )
    if (sort === 'pago') {
      // Primero los que pagan antes; los que no tienen fecha, al final
      out.sort((a, b) => (dueDate(a) || '9999').localeCompare(dueDate(b) || '9999'))
    }
    return out
  }, [list, filter, q, sort])

  if (error) return <Alert>{error}</Alert>
  if (!list) return <PageLoader />

  const count = (f: Filter) => (f === 'todos' ? list.length : list.filter((o) => o.status === f).length)
  const monthly = list
    .filter((o) => o.status === 'activo' && o.plan)
    .reduce((s) => s + prices.basico, 0)
  const thisMonth = new Date().toISOString().slice(0, 7)
  const newThisMonth = list.filter((o) => o.signed_up_at.slice(0, 7) === thisMonth).length

  const act = async (fn: 'admin_extend_trial' | 'admin_deactivate_business', o: AdminOwner, msg: string) => {
    const { error } = await supabase.rpc(fn, fn === 'admin_extend_trial' ? { p_business: o.id, p_days: 3 } : { p_business: o.id })
    if (error) setError(errorMessage(error))
    else {
      flash(msg)
      load()
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Dueños registrados" value={String(list.length)} hint={`${newThisMonth} nuevos este mes`} />
        <Stat label="Pagando" value={String(count('activo'))} />
        <Stat label="En prueba gratis" value={String(count('prueba'))} />
        <Stat label="Ingreso mensual" value={money(monthly, 'CUP')} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input className="input sm:max-w-xs" placeholder="Buscar por correo, negocio o código…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-auto" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Ordenar">
          <option value="recientes">Más recientes primero</option>
          <option value="pago">Próximo pago primero</option>
        </select>
      </div>
      <div className="flex flex-wrap gap-1">
        {(['todos', 'activo', 'prueba', 'vencido', 'sin_negocio'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${filter === f ? 'bg-slate-900 text-white' : 'bg-white ring-1 ring-slate-300'}`}>
            {FILTER_LABEL[f]} ({count(f)})
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && <p className="py-6 text-center text-slate-500">No hay dueños con ese filtro.</p>}
        {filtered.map((o) => (
          <div key={o.user_id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-bold">{o.email}</p>
                <p className="text-sm text-slate-500">
                  Se registró el {fullDateFromIso(o.signed_up_at, TZ)}
                  {o.last_sign_in_at && <> · último acceso {fullDateFromIso(o.last_sign_in_at, TZ)}</>}
                </p>
                {o.id ? (
                  <p className="mt-1 text-sm">
                    {businessType(o.business_type).emoji} <b>{o.name}</b> <span className="font-mono text-slate-500">{o.code}</span>
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-amber-700">Se registró pero no terminó de crear su negocio.</p>
                )}
              </div>
              {o.status === 'sin_negocio' ? <span className="chip bg-slate-100 text-xs text-slate-600">Sin negocio</span> : <StatusBadge status={o.status} />}
            </div>

            {o.id && (
              <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-sm">
                {o.status === 'activo' && <>💳 Pagando · próximo pago el <b>{fullDateFromIso(o.paid_until!, TZ)}</b> ({daysLeft(o.paid_until!)} días) · {money(prices.basico, 'CUP')}/mes</>}
                {o.status === 'prueba' && <>🎁 Prueba gratis · termina el <b>{fullDateFromIso(o.trial_ends_at!, TZ)}</b> ({daysLeft(o.trial_ends_at!)} días)</>}
                {o.status === 'vencido' && <>⛔ Sin pagar{o.paid_until ? <> desde el {fullDateFromIso(o.paid_until, TZ)}</> : <> desde que terminó la prueba</>}</>}
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              {o.id && <Button size="sm" onClick={() => setActivating(o as OwnerWithBusiness)}>Registrar pago</Button>}
              {o.whatsapp && (
                <LinkButton href={waLink(o.whatsapp, `Hola, te escribo de Citora sobre ${o.name}.`)} variant="whatsapp" size="sm" newTab>
                  <WhatsAppIcon className="h-4 w-4" /> WhatsApp
                </LinkButton>
              )}
              {o.slug && <LinkButton href={publicUrl(o.slug)} variant="secondary" size="sm" newTab>Ver su web</LinkButton>}
              {o.id && <Button size="sm" variant="ghost" onClick={() => act('admin_extend_trial', o, '3 días más de prueba')}>+3 días prueba</Button>}
              {o.id && o.status !== 'vencido' && (
                <Button size="sm" variant="ghost" className="text-red-600" onClick={() => act('admin_deactivate_business', o, 'Inhabilitado')}>Inhabilitar</Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {activating && (
        <ActivateModal
          business={activating}
          prices={prices}
          onClose={() => setActivating(null)}
          onDone={() => {
            setActivating(null)
            load()
          }}
        />
      )}
    </div>
  )
}

const TZ = 'America/Havana'

function ActivateModal({ business, prices, onClose, onDone }: {
  business: { id: string; name: string; code: string; plan: PlanKey | null }
  prices: Record<PlanKey, number>
  onClose: () => void
  onDone: () => void
}) {
  const [months, setMonths] = useState(1)
  const [amount, setAmount] = useState<number>(prices.basico)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setAmount(prices.basico * months), [months, prices])

  const activate = async () => {
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.rpc('admin_activate_plan', {
      p_business: business.id,
      p_plan: SINGLE_PLAN,
      p_months: months,
      p_amount: amount,
      p_note: note,
    })
    setBusy(false)
    if (error) return setError(errorMessage(error))
    flash(`Activo hasta el ${fullDateFromIso(data as string, 'America/Havana')}`)
    onDone()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Activar · ${business.name}`}
      footer={<Button block onClick={activate} loading={busy}>Confirmar pago y activar</Button>}
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">Código <b className="font-mono">{business.code}</b>. Comprueba que el pago llegó a tu tarjeta antes de activar.</p>
        <Field label="Meses">
          <select className="input" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 6, 12].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="Importe recibido (CUP)">
          <input className="input" type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        </Field>
        <Field label="Nota (opcional)">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. Transfermóvil 14:32" />
        </Field>
        <p className="text-xs text-slate-500">Si todavía tiene meses pagados, los nuevos se suman al final.</p>
        {error && <Alert>{error}</Alert>}
      </div>
    </Modal>
  )
}

function SettingsForm() {
  const [s, setS] = useState<Settings | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('platform_settings').select('*').eq('id', 1).single().then(({ data, error }) => (error ? setError(errorMessage(error)) : setS(data as Settings)))
  }, [])

  if (error && !s) return <Alert>{error}</Alert>
  if (!s) return <PageLoader />

  const save = async () => {
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('platform_settings').update({ ...s, updated_at: new Date().toISOString() }).eq('id', 1)
    setBusy(false)
    if (error) setError(errorMessage(error))
    else flash('Ajustes guardados')
  }

  return (
    <div className="max-w-lg space-y-5">
      <section className="card space-y-4">
        <h2 className="font-bold">Cobro</h2>
        <Field label="Número de tarjeta" hint="Se muestra a los dueños al pagar.">
          <input className="input font-mono" value={s.card_number} onChange={(e) => setS({ ...s, card_number: e.target.value })} placeholder="9200 0000 0000 0000" />
        </Field>
        <Field label="Titular (opcional)">
          <input className="input" value={s.card_holder} onChange={(e) => setS({ ...s, card_holder: e.target.value })} />
        </Field>
        <Field label="Tu WhatsApp" hint="Aquí te mandan las capturas. Con código de país.">
          <input className="input" value={s.admin_whatsapp} onChange={(e) => setS({ ...s, admin_whatsapp: e.target.value.replace(/[^\d]/g, '') })} placeholder="5355555555" />
        </Field>
      </section>
      <section className="card space-y-4">
        <h2 className="font-bold">Precio</h2>
        <Field label={`${PLAN_LABEL}: precio mensual (CUP)`} hint="Un solo plan con todo incluido. Lo ven los dueños al pagar y en la página principal.">
          <input
            className="input"
            type="number"
            min={0}
            value={s.price_basico}
            onChange={(e) => {
              const v = Number(e.target.value)
              setS({ ...s, price_basico: v, price_plus: v, price_ultra: v })
            }}
          />
        </Field>
        <Field label="Días de prueba gratis" hint="Para los negocios nuevos.">
          <input className="input" type="number" min={0} max={60} value={s.trial_days} onChange={(e) => setS({ ...s, trial_days: Number(e.target.value) })} />
        </Field>
      </section>
      {error && <Alert>{error}</Alert>}
      <Button block size="lg" onClick={save} loading={busy}>Guardar</Button>
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 truncate text-xl font-extrabold">{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-slate-400">{hint}</p>}
    </div>
  )
}
