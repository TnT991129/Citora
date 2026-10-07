import { useState } from 'react'
import { Alert, Button, Toggle, flash } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import type { Staff } from '../../lib/types'
import { usePanel } from './context'
import { Locked, useModule } from './Locked'

const MAX = 20

/** Profesionales del negocio: cada uno tiene su propia agenda */
export default function Team() {
  const allowed = useModule('empleados')
  const { business, staff, reloadStaff } = usePanel()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    </div>
  )
}

function StaffRow({ s, first, last, onMove, onRename, onToggle, onRemove }: {
  s: Staff
  first: boolean
  last: boolean
  onMove: (dir: -1 | 1) => void
  onRename: (name: string) => void
  onToggle: (active: boolean) => void
  onRemove: () => void
}) {
  const [confirm, setConfirm] = useState(false)
  return (
    <li className={`card flex flex-wrap items-center gap-3 ${s.active ? '' : 'opacity-60'}`}>
      <div className="flex flex-col">
        <ArrowBtn label="Subir" disabled={first} onClick={() => onMove(-1)} d="M6 15l6-6 6 6" />
        <ArrowBtn label="Bajar" disabled={last} onClick={() => onMove(1)} d="M6 9l6 6 6-6" />
      </div>
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
