import { useCallback, useEffect, useState } from 'react'
import { Alert, PageLoader, WhatsAppIcon } from '../../components/ui'
import { buildMessage, fetchAppointments, servicesText } from '../../lib/appointments'
import { errorMessage } from '../../lib/errors'
import { addDays, dayTitle, timeOf, todayKey } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import type { Appointment } from '../../lib/types'
import { waLink } from '../../lib/whatsapp'
import { usePanel } from './context'
import { Locked, useModule } from './Locked'

export default function Reminders() {
  const allowed = useModule('recordatorios')
  const { business } = usePanel()
  const today = todayKey(business.timezone)
  const [day, setDay] = useState(() => addDays(today, 1))
  const [list, setList] = useState<Appointment[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const all = await fetchAppointments(business, day, day)
      setList(all.filter((a) => (a.status === 'pendiente' || a.status === 'confirmada') && a.customer_phone.length >= 8))
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [business, day])

  useEffect(() => {
    if (allowed) {
      setList(null)
      load()
    }
  }, [allowed, load])

  if (!allowed) return <Locked module="recordatorios" />

  const markSent = async (a: Appointment) => {
    const reminded_at = new Date().toISOString()
    setList((l) => l && l.map((x) => (x.id === a.id ? { ...x, reminded_at } : x)))
    const { error } = await supabase.from('appointments').update({ reminded_at }).eq('id', a.id)
    if (error) setError(errorMessage(error))
  }

  const pending = list?.filter((a) => !a.reminded_at).length ?? 0

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Recordatorios</h1>
        <p className="text-slate-600">Envía a cada cliente un recordatorio por WhatsApp con un toque. Así faltan menos.</p>
      </div>
      <div className="flex gap-1.5">
        {[0, 1, 2].map((n) => {
          const k = addDays(today, n)
          return (
            <button
              key={k}
              onClick={() => setDay(k)}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold ${day === k ? 'bg-slate-900 text-white' : 'bg-white ring-1 ring-slate-300'}`}
            >
              {n === 0 ? 'Hoy' : n === 1 ? 'Mañana' : 'Pasado mañana'}
            </button>
          )
        })}
      </div>
      {error && <Alert>{error}</Alert>}
      {!list ? (
        <PageLoader />
      ) : list.length === 0 ? (
        <div className="card text-center text-slate-600">No hay citas pendientes el {dayTitle(day).toLowerCase()}.</div>
      ) : (
        <>
          <p className="text-sm font-medium text-slate-600">
            {dayTitle(day)} · {pending === 0 ? '¡Todos avisados! ✅' : `${pending} por avisar de ${list.length}`}
          </p>
          <ul className="space-y-2">
            {list.map((a) => (
              <li key={a.id} className={`card flex items-center justify-between gap-3 ${a.reminded_at ? 'opacity-60' : ''}`}>
                <div className="min-w-0">
                  <p className="font-semibold">
                    <span className="text-brand">{timeOf(a.starts_at, business.timezone)}</span> · {a.customer_name}
                  </p>
                  <p className="truncate text-sm text-slate-500">{servicesText(a)}</p>
                  {a.reminded_at && <p className="text-xs text-emerald-700">Recordatorio enviado</p>}
                </div>
                <a
                  href={waLink(a.customer_phone, buildMessage('recordatorio', a, business))}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => markSent(a)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#25D366] px-3 py-2 text-sm font-semibold text-white"
                >
                  <WhatsAppIcon className="h-4 w-4" /> {a.reminded_at ? 'Otra vez' : 'Enviar'}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
