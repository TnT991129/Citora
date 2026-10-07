import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, PageLoader, flash } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { dateKey, shortDate } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import type { Review } from '../../lib/types'
import { publicUrl } from '../../lib/url'
import { Stars } from '../public/shared'
import { usePanel } from './context'
import { Locked, useModule } from './Locked'

export default function Reviews() {
  const allowed = useModule('opiniones')
  const { business } = usePanel()
  const [list, setList] = useState<Review[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('reviews').select('*').order('created_at', { ascending: false })
    if (error) setError(errorMessage(error))
    else setList(data as Review[])
  }, [])

  useEffect(() => {
    if (allowed) load()
  }, [allowed, load])

  if (!allowed) return <Locked module="opiniones" />
  if (error) return <Alert>{error}</Alert>
  if (!list) return <PageLoader />

  const visible = list.filter((r) => !r.hidden)
  const avg = visible.length ? visible.reduce((s, r) => s + r.rating, 0) / visible.length : 0
  const counts = [5, 4, 3, 2, 1].map((n) => ({ n, c: visible.filter((r) => r.rating === n).length }))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Opiniones</h1>
        <p className="text-slate-600">Tus clientes pueden opinar desde el enlace de su cita, después de ir.</p>
      </div>

      {list.length === 0 ? (
        <div className="card text-center text-slate-600">
          Todavía no hay opiniones. Después de cada cita, envía el mensaje "Gracias por venir" con el enlace de la cita para que te dejen una.
        </div>
      ) : (
        <section className="card flex flex-wrap items-center gap-6">
          <div className="text-center">
            <p className="text-4xl font-extrabold">{avg.toFixed(1)}</p>
            <Stars value={avg} size={18} />
            <p className="text-sm text-slate-500">{visible.length} {visible.length === 1 ? 'opinión' : 'opiniones'} visibles</p>
          </div>
          <div className="min-w-[180px] flex-1 space-y-1">
            {counts.map(({ n, c }) => (
              <div key={n} className="flex items-center gap-2 text-sm">
                <span className="w-4 text-slate-500">{n}</span>
                <div className="h-2 flex-1 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-amber-400" style={{ width: `${visible.length ? (c / visible.length) * 100 : 0}%` }} />
                </div>
                <span className="w-6 text-right text-slate-500">{c}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <ul className="space-y-3">
        {list.map((r) => <ReviewItem key={r.id} review={r} tz={business.timezone} onChange={load} />)}
      </ul>

      {list.length > 0 && (
        <a href={`${publicUrl(business.slug)}#opiniones`} target="_blank" rel="noreferrer" className="inline-block text-sm font-semibold text-brand">
          Ver cómo se ven en tu web →
        </a>
      )}
    </div>
  )
}

function ReviewItem({ review: r, tz, onChange }: { review: Review; tz: string; onChange: () => void }) {
  const [reply, setReply] = useState(r.reply || '')
  const [replying, setReplying] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const update = async (patch: Partial<Pick<Review, 'hidden' | 'reply'>>, msg: string) => {
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('reviews').update(patch).eq('id', r.id)
    setBusy(false)
    if (error) return setError(errorMessage(error))
    flash(msg)
    setReplying(false)
    onChange()
  }

  return (
    <li className={`card ${r.hidden ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-semibold">{r.customer_name}</span>
          <span className="ml-2 text-sm text-slate-400">{shortDate(dateKey(r.created_at, tz))}</span>
          {r.hidden && <span className="chip ml-2 bg-slate-200 text-xs text-slate-700">Oculta</span>}
        </div>
        <Stars value={r.rating} size={16} />
      </div>
      {r.comment ? <p className="mt-2 text-slate-700">{r.comment}</p> : <p className="mt-2 text-sm italic text-slate-400">Sin comentario</p>}

      {r.reply && !replying && (
        <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600"><b>Tu respuesta:</b> {r.reply}</p>
      )}
      {replying && (
        <div className="mt-2 space-y-2">
          <textarea className="input min-h-[70px]" maxLength={500} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Escribe una respuesta pública" />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => update({ reply: reply.trim() || null }, 'Respuesta guardada')} loading={busy}>Publicar respuesta</Button>
            <Button size="sm" variant="ghost" onClick={() => setReplying(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      {!replying && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => setReplying(true)}>{r.reply ? 'Editar respuesta' : 'Responder'}</Button>
          <Button size="sm" variant="ghost" onClick={() => update({ hidden: !r.hidden }, r.hidden ? 'Visible en tu web' : 'Ocultada')} loading={busy}>
            {r.hidden ? 'Mostrar en mi web' : 'Ocultar'}
          </Button>
        </div>
      )}
      {error && <div className="mt-2"><Alert>{error}</Alert></div>}
    </li>
  )
}
