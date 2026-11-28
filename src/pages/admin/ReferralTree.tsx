// Árbol de invitaciones de la pestaña Números: qué negocio invitó a cuál, como un árbol genealógico.
// Arriba, quien trajo a otros sin venir invitado; debajo, sus invitados (y los invitados de estos).
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { referralTree, type AdminOwner, type ReferralNode } from './adminData'
import { Kpi, StateChip } from './adminUi'

export function ReferralTree() {
  const [owners, setOwners] = useState<AdminOwner[] | null>(null)
  useEffect(() => {
    supabase.rpc('admin_list_owners').then(({ data }) => setOwners((data as AdminOwner[]) || []))
  }, [])
  if (!owners) return null
  const tree = referralTree(owners)
  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Vinieron invitados" value={String(tree.invited)} hint="con un enlace de invitación" />
        <Kpi label="Ya pagaron" value={String(tree.rewarded)} hint="y ganaron su mes los dos" />
        <Kpi label="Invitaron" value={String(tree.inviters)} hint="a al menos un negocio" />
      </div>
      <div className="card mt-3">
        <h3 className="font-bold">Quién invitó a quién</h3>
        {tree.roots.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Todavía nadie ha creado su app con un enlace de invitación.</p>
        ) : (
          <>
            <ul className="mt-3 space-y-4">
              {tree.roots.map((n) => <Branch key={n.owner.id} node={n} root />)}
            </ul>
            <p className="mt-4 text-xs text-slate-500">
              ✓ Mes gratis: el invitado pagó su primer mes y los dos recibieron un mes más. «Aún no paga»: el mes gratis llega cuando apruebes su primer pago.
            </p>
          </>
        )}
      </div>
    </>
  )
}

function Branch({ node, root }: { node: ReferralNode; root?: boolean }) {
  const o = node.owner
  const invited = node.children.length
  return (
    <li
      className={root ? '' : 'relative before:absolute before:-left-4 before:top-5 before:h-px before:w-4 before:bg-slate-300'}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${root ? 'bg-citora-600 text-white' : 'bg-slate-100 text-slate-600'}`}
          aria-hidden
        >
          {o.name.trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate font-semibold">{o.name}</span>
            <StateChip owner={o} />
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {o.code}
            {invited > 0 && <> · invitó a <b>{invited}</b>{node.descendants > invited && <> ({node.descendants} en total con los de sus invitados)</>}</>}
            {o.referred_by && (o.referral_rewarded
              ? <span className="ml-2 font-semibold text-emerald-600">✓ Mes gratis</span>
              : <span className="ml-2 text-amber-600">Aún no paga</span>)}
          </p>
        </div>
      </div>
      {invited > 0 && (
        <ul className="ml-5 mt-3 space-y-3 border-l border-slate-300 pl-4">
          {node.children.map((c) => <Branch key={c.owner.id} node={c} />)}
        </ul>
      )}
    </li>
  )
}
