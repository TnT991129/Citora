import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Alert, Button, CitoraLogo, Field, LinkButton, Modal, PageLoader, StatusBadge, WhatsAppIcon, flash } from '../../components/ui'
import { useSession } from '../../lib/auth'
import { setBrandColor } from '../../lib/brand'
import { errorMessage } from '../../lib/errors'
import { daysLeft, fullDateFromIso, money } from '../../lib/format'
import { PLAN_NAMES, PLAN_ORDER } from '../../lib/plans'
import { supabase } from '../../lib/supabase'
import { businessType } from '../../lib/templates'
import type { BusinessStatus, PlanKey } from '../../lib/types'
import { publicUrl } from '../../lib/url'
import { waLink } from '../../lib/whatsapp'
import AdminStats from './AdminStats'

interface AdminBusiness {
  id: string
  name: string
  slug: string
  code: string
  business_type: string
  whatsapp: string
  plan: PlanKey | null
  trial_ends_at: string
  paid_until: string | null
  created_at: string
  status: BusinessStatus
  owner_email: string | null
  appointments_count: number
}

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
  const [tab, setTab] = useState<'negocios' | 'estadisticas' | 'ajustes'>('negocios')

  useEffect(() => {
    setBrandColor(null)
    document.title = 'Administración · Citora'
  }, [])

  useEffect(() => {
    if (!session) return
    supabase.rpc('is_platform_admin').then(({ data }) => setIsAdmin(Boolean(data)))
  }, [session])

  if (session === null) return <Navigate to="/entrar" replace />
  if (session === undefined || isAdmin === undefined) return <PageLoader />
  if (!isAdmin) return <Navigate to="/panel" replace />

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <CitoraLogo className="text-lg" />
            <span className="chip bg-slate-900 text-white">Admin</span>
          </div>
          <div className="flex items-center gap-1">
            {(['negocios', 'estadisticas', 'ajustes'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === t ? 'bg-citora-100 text-citora-700' : 'text-slate-600 hover:bg-slate-100'}`}>
                {t === 'negocios' ? 'Negocios' : t === 'estadisticas' ? 'Estadísticas' : 'Ajustes'}
              </button>
            ))}
            <button onClick={() => supabase.auth.signOut()} className="ml-1 rounded-lg px-2 py-1.5 text-sm text-slate-500 hover:bg-slate-100">Salir</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-5">{tab === 'negocios' ? <Businesses /> : tab === 'estadisticas' ? <AdminStats /> : <SettingsForm />}</main>
    </div>
  )
}

function Businesses() {
  const [list, setList] = useState<AdminBusiness[] | null>(null)
  const [prices, setPrices] = useState({ basico: 1500, plus: 2000, ultra: 2500 })
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'todos' | BusinessStatus>('todos')
  const [q, setQ] = useState('')
  const [activating, setActivating] = useState<AdminBusiness | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_list_businesses')
    if (error) setError(errorMessage(error))
    else setList(data as AdminBusiness[])
    const { data: p } = await supabase.rpc('get_public_prices')
    if (p) setPrices(p as typeof prices)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return (list || []).filter((b) =>
      (filter === 'todos' || b.status === filter) &&
      (!term || [b.name, b.code, b.slug, b.whatsapp, b.owner_email || ''].some((x) => x.toLowerCase().includes(term))),
    )
  }, [list, filter, q])

  if (error) return <Alert>{error}</Alert>
  if (!list) return <PageLoader />

  const counts = {
    todos: list.length,
    prueba: list.filter((b) => b.status === 'prueba').length,
    activo: list.filter((b) => b.status === 'activo').length,
    vencido: list.filter((b) => b.status === 'vencido').length,
  }
  const monthly = list
    .filter((b) => b.status === 'activo' && b.plan)
    .reduce((s, b) => s + prices[b.plan!], 0)

  const extendTrial = async (b: AdminBusiness) => {
    const { error } = await supabase.rpc('admin_extend_trial', { p_business: b.id, p_days: 3 })
    if (error) setError(errorMessage(error))
    else {
      flash('3 días más de prueba')
      load()
    }
  }

  const deactivate = async (b: AdminBusiness) => {
    const { error } = await supabase.rpc('admin_deactivate_business', { p_business: b.id })
    if (error) setError(errorMessage(error))
    else {
      flash('Inhabilitado')
      load()
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Negocios" value={String(counts.todos)} />
        <Stat label="En prueba" value={String(counts.prueba)} />
        <Stat label="Pagando" value={String(counts.activo)} />
        <Stat label="Ingreso mensual" value={money(monthly, 'CUP')} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input className="input sm:max-w-xs" placeholder="Buscar por nombre, código, correo…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex flex-wrap gap-1">
          {(['todos', 'prueba', 'activo', 'vencido'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${filter === f ? 'bg-slate-900 text-white' : 'bg-white ring-1 ring-slate-300'}`}>
              {f === 'todos' ? 'Todos' : f === 'prueba' ? 'Prueba' : f === 'activo' ? 'Activos' : 'Vencidos'} ({counts[f]})
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && <p className="py-6 text-center text-slate-500">No hay negocios con ese filtro.</p>}
        {filtered.map((b) => (
          <div key={b.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold">{businessType(b.business_type).emoji} {b.name} <span className="font-mono text-sm font-semibold text-slate-500">{b.code}</span></p>
                <p className="text-sm text-slate-500">{b.owner_email} · {b.appointments_count} {b.appointments_count === 1 ? 'cita' : 'citas'} · alta {fullDateFromIso(b.created_at, 'America/Havana')}</p>
                <p className="mt-1 text-sm">
                  {b.status === 'prueba' && <>Prueba: quedan {daysLeft(b.trial_ends_at)} días</>}
                  {b.status === 'activo' && <>Plan {PLAN_NAMES[b.plan!]} hasta {fullDateFromIso(b.paid_until!, 'America/Havana')} ({daysLeft(b.paid_until!)} días)</>}
                  {b.status === 'vencido' && <>Sin plan activo{b.plan ? ` · último plan: ${PLAN_NAMES[b.plan]}` : ''}</>}
                </p>
              </div>
              <StatusBadge status={b.status} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setActivating(b)}>Activar plan</Button>
              {b.whatsapp && (
                <LinkButton href={waLink(b.whatsapp, `Hola, te escribo de Citora sobre ${b.name}.`)} variant="whatsapp" size="sm" newTab>
                  <WhatsAppIcon className="h-4 w-4" /> WhatsApp
                </LinkButton>
              )}
              <LinkButton href={publicUrl(b.slug)} variant="secondary" size="sm" newTab>Ver web</LinkButton>
              <Button size="sm" variant="ghost" onClick={() => extendTrial(b)}>+3 días prueba</Button>
              {b.status !== 'vencido' && <Button size="sm" variant="ghost" className="text-red-600" onClick={() => deactivate(b)}>Inhabilitar</Button>}
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

function ActivateModal({ business, prices, onClose, onDone }: {
  business: AdminBusiness
  prices: Record<PlanKey, number>
  onClose: () => void
  onDone: () => void
}) {
  const [plan, setPlan] = useState<PlanKey>(business.plan || 'plus')
  const [months, setMonths] = useState(1)
  const [amount, setAmount] = useState<number>(prices[business.plan || 'plus'])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setAmount(prices[plan] * months), [plan, months, prices])

  const activate = async () => {
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.rpc('admin_activate_plan', {
      p_business: business.id,
      p_plan: plan,
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
        <div className="grid grid-cols-3 gap-2">
          {PLAN_ORDER.map((p) => (
            <button key={p} onClick={() => setPlan(p)} className={`rounded-xl py-2.5 font-semibold ${plan === p ? 'bg-citora-600 text-white' : 'bg-white ring-1 ring-slate-300'}`}>
              {PLAN_NAMES[p]}
            </button>
          ))}
        </div>
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
        <h2 className="font-bold">Precios (CUP/mes)</h2>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Básico"><input className="input" type="number" value={s.price_basico} onChange={(e) => setS({ ...s, price_basico: Number(e.target.value) })} /></Field>
          <Field label="Plus"><input className="input" type="number" value={s.price_plus} onChange={(e) => setS({ ...s, price_plus: Number(e.target.value) })} /></Field>
          <Field label="Ultra"><input className="input" type="number" value={s.price_ultra} onChange={(e) => setS({ ...s, price_ultra: Number(e.target.value) })} /></Field>
        </div>
        <Field label="Días de prueba gratis" hint="Para los negocios nuevos.">
          <input className="input" type="number" min={0} max={60} value={s.trial_days} onChange={(e) => setS({ ...s, trial_days: Number(e.target.value) })} />
        </Field>
      </section>
      {error && <Alert>{error}</Alert>}
      <Button block size="lg" onClick={save} loading={busy}>Guardar</Button>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 truncate text-xl font-extrabold">{value}</p>
    </div>
  )
}
