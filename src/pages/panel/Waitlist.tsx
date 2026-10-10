import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, LinkButton, PageLoader, WhatsAppIcon } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { dayTitle, todayKey } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import type { WaitlistEntry } from '../../lib/types'
import { publicUrl } from '../../lib/url'
import { waLink } from '../../lib/whatsapp'
import { usePanel } from './context'
import { Locked, useModule } from './Locked'

export default function Waitlist() {
  const allowed = useModule('espera')
  const { business } = usePanel()
  const [list, setList] = useState<WaitlistEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const today = todayKey(business.timezone)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('waitlist')
      .select('*')
      .gte('day', today)
      .neq('status', 'descartado')
      .order('day')
      .order('created_at')
    if (error) setError(errorMessage(error))
    else setList(data as WaitlistEntry[])
  }, [today])

  useEffect(() => {
    if (allowed) load()
  }, [allowed, load])

  if (!allowed) return <Locked module="espera" />
  if (error && !list) return <Alert>{error}</Alert>
  if (!list) return <PageLoader />

  const setStatus = async (e: WaitlistEntry, status: WaitlistEntry['status']) => {
    const { error } = await supabase.from('waitlist').update({ status }).eq('id', e.id)
    if (error) return setError(errorMessage(error))
    load()
  }

  const days = [...new Set(list.map((e) => e.day))]

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Lista de espera</h1>
        <p className="text-slate-600">Clientes que quieren un hueco en un día que estaba lleno. Si alguien cancela, avísales.</p>
      </div>
      {error && <Alert>{error}</Alert>}
      {list.length === 0 && (
        <div className="card text-center text-slate-600">
          Nadie en espera. Cuando un día se llene, tus clientes podrán apuntarse desde tu web.
        </div>
      )}

      {days.map((day) => (
        <section key={day} className="space-y-2">
          <h2 className="font-bold">{dayTitle(day)}</h2>
          <ul className="space-y-2">
            {list.filter((e) => e.day === day).map((e) => {
              const first = e.customer_name.split(' ')[0]
              const msg = `Hola ${first}, te escribo de ${business.name}. Se liberó un hueco el ${dayTitle(day).toLowerCase()}. Si lo quieres, resérvalo aquí antes de que lo coja otra persona: ${publicUrl(business.slug, 'reservar')}`
              return (
                <li key={e.id} className="card">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">{e.customer_name}</p>
                      <p className="font-mono text-sm text-slate-500">+{e.customer_phone}</p>
                      {e.note && <p className="mt-1 text-sm text-slate-700">“{e.note}”</p>}
                    </div>
                    {e.status === 'avisado' && <span className="chip bg-emerald-100 text-xs text-emerald-800">Avisado</span>}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <LinkButton href={waLink(e.customer_phone, msg)} variant="whatsapp" size="sm" newTab>
                      <WhatsAppIcon className="h-4 w-4" /> Avisar
                    </LinkButton>
                    {e.status !== 'avisado' && <Button size="sm" variant="secondary" onClick={() => setStatus(e, 'avisado')}>Marcar avisado</Button>}
                    <Button size="sm" variant="ghost" onClick={() => setStatus(e, 'descartado')}>Quitar</Button>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

