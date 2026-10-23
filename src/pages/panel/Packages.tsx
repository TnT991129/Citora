import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Field, Modal, PageLoader, Toggle, flash } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { money } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import type { Package } from '../../lib/types'
import { usePanel } from './context'
import { Locked, useModule } from './Locked'

export default function Packages() {
  const allowed = useModule('clientes')
  const { business } = usePanel()
  const [list, setList] = useState<Package[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('packages').select('*').order('created_at', { ascending: false })
    if (error) setError(errorMessage(error))
    else setList(data as Package[])
  }, [])

  useEffect(() => {
    if (allowed) load()
  }, [allowed, load])

  if (!allowed) return <Locked module="clientes" />
  if (error && !list) return <Alert>{error}</Alert>
  if (!list) return <PageLoader />

  const toggle = async (p: Package, active: boolean) => {
    const { error } = await supabase.from('packages').update({ active }).eq('id', p.id)
    if (error) return setError(errorMessage(error))
    load()
  }

  const remove = async (p: Package) => {
    const { error } = await supabase.from('packages').delete().eq('id', p.id)
    if (error) return setError(errorMessage(error))
    flash('Bono borrado')
    load()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Bonos</h1>
          <p className="text-slate-600">
            Paquetes de sesiones prepagadas (ej. "5 cortes por el precio de 4"). No hay pasarela de pago: tú cobras por tu
            cuenta y lo vendes desde la ficha de cada clienta, en Clientes.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>Nuevo bono</Button>
      </div>
      {error && <Alert>{error}</Alert>}

      {list.length === 0 && (
        <div className="card text-center text-slate-600">
          Crea un bono, por ejemplo "5 cortes" con su precio, y ya podrás vendérselo a tus clientas.
        </div>
      )}

      <ul className="space-y-2">
        {list.map((p) => (
          <li key={p.id} className={`card flex items-center justify-between gap-3 ${p.active ? '' : 'opacity-60'}`}>
            <div className="min-w-0">
              <p className="font-bold">{p.name}</p>
              <p className="text-sm text-slate-500">{p.sessions} sesiones · {money(p.price, business.currency)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Toggle checked={p.active} onChange={(v) => toggle(p, v)} label="Activo" />
              <button onClick={() => remove(p)} className="rounded-lg px-2 py-1 text-sm font-medium text-red-600 hover:bg-red-50">Borrar</button>
            </div>
          </li>
        ))}
      </ul>

      {creating && (
        <NewPackage
          businessId={business.id}
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false)
            load()
          }}
        />
      )}
    </div>
  )
}

function NewPackage({ businessId, onClose, onDone }: { businessId: string; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('')
  const [sessions, setSessions] = useState(5)
  const [price, setPrice] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (name.trim().length < 2) return setError('Escribe un nombre para el bono.')
    if (!(sessions >= 2)) return setError('El bono debe tener al menos 2 sesiones.')
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('packages').insert({
      business_id: businessId, name: name.trim(), sessions: Math.round(sessions), price: Math.max(0, Number(price) || 0),
    })
    setBusy(false)
    if (error) return setError(errorMessage(error))
    flash('Bono creado')
    onDone()
  }

  return (
    <Modal open onClose={onClose} title="Nuevo bono" footer={<Button block onClick={save} loading={busy}>Crear bono</Button>}>
      <div className="space-y-4">
        <Field label="Nombre" hint="Lo que ve tu clienta. Ej. 5 cortes">
          <input className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sesiones">
            <input className="input" type="number" min={2} max={100} value={sessions} onChange={(e) => setSessions(Number(e.target.value))} />
          </Field>
          <Field label="Precio">
            <input className="input" type="number" min={0} step="any" inputMode="decimal" value={price} onChange={(e) => setPrice(Number(e.target.value))} />
          </Field>
        </div>
        {error && <Alert>{error}</Alert>}
      </div>
    </Modal>
  )
}
