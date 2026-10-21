import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Button, Empty, Field, Modal, PageLoader } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { addDays, dayTitle, money, MONTHS, todayKey } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import type { Expense } from '../../lib/types'
import { usePanel } from './context'
import { Locked, useModule } from './Locked'

const CATEGORIES = ['Materiales', 'Alquiler', 'Electricidad y agua', 'Salarios', 'Transporte', 'Publicidad', 'Impuestos', 'Otros']

type Editing = { id?: string; day: string; amount: string; category: string; note: string }

/** Primer y último día del mes "YYYY-MM" */
function monthRange(month: string): [string, string] {
  const [y, m] = month.split('-').map(Number)
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
  return [`${month}-01`, addDays(next, -1)]
}

function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return d.toISOString().slice(0, 7)
}

export default function Expenses() {
  const allowed = useModule('finanzas')
  const { business, link } = usePanel()
  const today = todayKey(business.timezone)
  const [month, setMonth] = useState(today.slice(0, 7))
  const [list, setList] = useState<Expense[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [from, to] = monthRange(month)

  const load = useCallback(async () => {
    setError(null)
    const { data, error } = await supabase.from('expenses').select('*').gte('day', from).lte('day', to)
      .order('day', { ascending: false }).order('created_at', { ascending: false })
    if (error) setError(errorMessage(error))
    else setList((data as Expense[]) || [])
  }, [from, to])

  useEffect(() => {
    if (!allowed) return
    setList(null)
    load()
  }, [allowed, load])

  if (!allowed) return <Locked module="finanzas" />

  const total = (list || []).reduce((a, e) => a + Number(e.amount), 0)
  const byCategory = Object.entries(
    (list || []).reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.category]: (acc[e.category] || 0) + Number(e.amount) }), {}),
  ).sort((a, b) => b[1] - a[1])
  const [y, m] = month.split('-').map(Number)

  const open = (e: Editing) => {
    setFormError(null)
    setEditing(e)
  }

  const save = async () => {
    if (!editing) return
    const amount = Number(editing.amount)
    if (!(amount > 0)) return setFormError('Escribe el importe del gasto.')
    if (!editing.day) return setFormError('Elige la fecha.')
    setBusy(true)
    setFormError(null)
    const payload = {
      day: editing.day,
      amount: Math.round(amount * 100) / 100,
      category: editing.category.trim() || 'Otros',
      note: editing.note.trim() || null,
    }
    const { error } = editing.id
      ? await supabase.from('expenses').update(payload).eq('id', editing.id)
      : await supabase.from('expenses').insert({ ...payload, business_id: business.id })
    setBusy(false)
    if (error) return setFormError(errorMessage(error))
    setEditing(null)
    if (payload.day.slice(0, 7) !== month) setMonth(payload.day.slice(0, 7))
    else load()
  }

  const remove = async () => {
    if (!editing?.id) return
    setBusy(true)
    const { error } = await supabase.from('expenses').delete().eq('id', editing.id)
    setBusy(false)
    if (error) return setFormError(errorMessage(error))
    setEditing(null)
    load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Gastos</h1>
        <Button size="sm" onClick={() => open({ day: today, amount: '', category: CATEGORIES[0], note: '' })}>+ Gasto</Button>
      </div>
      <p className="text-sm text-slate-500">
        Apunta lo que gastas en tu negocio. En <Link to={link('estadisticas')} className="font-semibold text-brand">Estadísticas</Link> verás tu ganancia: ingresos menos gastos.
      </p>

      <div className="flex items-center justify-between rounded-2xl bg-white p-2 shadow-sm ring-1 ring-slate-200">
        <button onClick={() => setMonth(shiftMonth(month, -1))} className="rounded-full p-2 text-slate-600 hover:bg-slate-100" aria-label="Mes anterior">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
        <span className="font-semibold capitalize">{MONTHS[m - 1]} {y}</span>
        <button onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= today.slice(0, 7)} className="rounded-full p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-30" aria-label="Mes siguiente">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 6l6 6-6 6" /></svg>
        </button>
      </div>

      {error && <Alert>{error}</Alert>}
      {!list && !error && <PageLoader />}
      {list && (
        <>
          <div className="card">
            <p className="text-sm text-slate-500">Total del mes</p>
            <p className="text-2xl font-extrabold">{money(total, business.currency)}</p>
            {byCategory.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm">
                {byCategory.map(([cat, sum]) => (
                  <li key={cat} className="flex justify-between gap-3">
                    <span className="text-slate-600">{cat}</span>
                    <span className="font-semibold">{money(sum, business.currency)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {list.length === 0 && <Empty title="Sin gastos este mes">Añade el primero con «+ Gasto».</Empty>}
          <div className="space-y-2">
            {list.map((e) => (
              <button
                key={e.id}
                onClick={() => open({ id: e.id, day: e.day, amount: String(e.amount), category: e.category, note: e.note || '' })}
                className="flex w-full items-center justify-between gap-3 rounded-2xl bg-white p-3 text-left shadow-sm ring-1 ring-slate-200"
              >
                <span className="min-w-0">
                  <span className="block font-semibold">{e.category}</span>
                  <span className="block truncate text-sm text-slate-500">{dayTitle(e.day)}{e.note ? ` · ${e.note}` : ''}</span>
                </span>
                <span className="shrink-0 font-bold">{money(e.amount, business.currency)}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {editing && (
        <Modal
          open
          onClose={() => setEditing(null)}
          title={editing.id ? 'Editar gasto' : 'Nuevo gasto'}
          footer={
            <div className="flex gap-2">
              {editing.id && <Button variant="danger" onClick={remove} disabled={busy}>Eliminar</Button>}
              <Button block onClick={save} loading={busy}>Guardar</Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Importe (${business.currency})`}>
                <input className="input" type="number" min={0} step="any" inputMode="decimal" autoFocus value={editing.amount} onChange={(e) => setEditing({ ...editing, amount: e.target.value })} />
              </Field>
              <Field label="Fecha">
                <input className="input" type="date" max={today} value={editing.day} onChange={(e) => setEditing({ ...editing, day: e.target.value })} />
              </Field>
            </div>
            <div>
              <span className="label">Categoría</span>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setEditing({ ...editing, category: c })}
                    className={`rounded-full px-3 py-1.5 text-sm font-semibold ${editing.category === c ? 'bg-brand text-white' : 'bg-white text-slate-700 ring-1 ring-slate-300'}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <Field label="Nota (opcional)">
              <input className="input" maxLength={200} placeholder="Ej. Tintes y champú" value={editing.note} onChange={(e) => setEditing({ ...editing, note: e.target.value })} />
            </Field>
            {formError && <Alert>{formError}</Alert>}
          </div>
        </Modal>
      )}
    </div>
  )
}
