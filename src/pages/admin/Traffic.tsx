import { useEffect, useState } from 'react'
import { BarChart, RankBars } from '../../components/BarChart'
import { Alert, Spinner } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { fullDateFromIso, MONTHS, time12 } from '../../lib/format'
import { supabase } from '../../lib/supabase'

interface TrafficData {
  days: number
  since: string | null
  visitors: number
  sessions: number
  signups: number
  funnel: { portada: number; crear: number; pasos: number[]; creados: number }
  by_day: { day: string; visitors: number; signups: number }[]
  by_hour: number[]
  sources: { source: string; visitors: number }[]
  devices: Partial<Record<'movil' | 'ordenador', number>>
  business_totals: { visitors: number; bookings: number }
  business_pages: { slug: string; name: string | null; visitors: number; bookings: number }[]
}

const TZ = 'America/Havana'
// Periodos: "Hoy" es el día de hoy (hora de Cuba) y "Hoy y ayer", los dos últimos días
const RANGES = [
  { days: 1, label: 'Hoy' },
  { days: 2, label: 'Hoy y ayer' },
  { days: 7, label: '7 días' },
  { days: 30, label: '30 días' },
  { days: 90, label: '90 días' },
] as const
// Los pasos del asistente de crear la app (ver STEPS en pages/Create.tsx)
const STEP_NAMES = ['Tipo de negocio', 'Datos del negocio', 'Moneda', 'Servicios', 'Horario', 'Crear la cuenta']
const SOURCE_NAMES: Record<string, string> = {
  directo: 'Directo / enlace compartido', instagram: 'Instagram', facebook: 'Facebook', whatsapp: 'WhatsApp',
  google: 'Google', tiktok: 'TikTok', x: 'X (Twitter)', 'otra web': 'Otra web',
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)
/** 0 → "12a", 13 → "1p" (corto, para el eje del gráfico) */
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'a' : 'p'}`

/** Visitas a la portada, cuántos crean su app y dónde abandonan (ver admin_traffic en schema.sql) */
export function Traffic() {
  const [days, setDays] = useState<number>(30)
  const [t, setT] = useState<TrafficData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setError(null)
    supabase.rpc('admin_traffic', { p_days: days }).then(({ data, error }) => {
      if (!alive) return
      if (error) setError(errorMessage(error))
      else setT(data as TrafficData)
    })
    return () => {
      alive = false
    }
  }, [days])

  return (
    <section className="card space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold tracking-tight">Visitas y registros</h2>
          <p className="text-sm text-slate-500">
            Personas distintas en la portada de Citora y cuántas crean su app.
            {t?.since && <> Se mide desde el {fullDateFromIso(t.since, TZ)}.</>}
          </p>
        </div>
        <div className="-mx-1 flex max-w-full overflow-x-auto px-1">
          <div className="flex shrink-0 rounded-full bg-slate-100 p-1">
            {RANGES.map((r) => (
              <button
                key={r.days}
                onClick={() => setDays(r.days)}
                aria-pressed={days === r.days}
                className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${days === r.days ? 'bg-white text-slate-900 shadow' : 'text-slate-500 hover:text-slate-800'}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <Alert>{error}</Alert>}
      {!t && !error && <div className="flex justify-center py-10 text-brand"><Spinner /></div>}
      {t && <TrafficBody t={t} />}
    </section>
  )
}

function TrafficBody({ t }: { t: TrafficData }) {
  const conversion = pct(t.signups, t.visitors)
  const bookingRate = pct(t.business_totals.bookings, t.business_totals.visitors)
  const mobile = t.devices.movil || 0
  const desktop = t.devices.ordenador || 0
  const labelEvery = t.by_day.length > 31 ? 7 : t.by_day.length > 10 ? 3 : 1
  const dayLabel = (d: string) => String(Number(d.slice(8, 10)))
  const dayTip = (d: string) => `${Number(d.slice(8, 10))} de ${MONTHS[Number(d.slice(5, 7)) - 1]}`

  // Embudo: portada → crear → cada paso → app creada (personas distintas en cada punto)
  const funnel = [
    { label: 'Vieron la portada', value: t.funnel.portada },
    { label: 'Entraron a crear su app', value: t.funnel.crear },
    ...t.funnel.pasos.map((v, i) => ({ label: `Paso ${i + 1}: ${STEP_NAMES[i]}`, value: v })),
    { label: 'Crearon su app', value: t.funnel.creados },
  ]
  // El salto donde más gente se va (de un punto al siguiente), para fijarse en él
  let worst = -1
  let worstLoss = 0
  funnel.forEach((f, i) => {
    if (i === 0) return
    const prev = funnel[i - 1].value
    const loss = prev > 0 ? (prev - f.value) / prev : 0
    if (prev >= 3 && loss > worstLoss) {
      worstLoss = loss
      worst = i
    }
  })
  const top = Math.max(1, funnel[0].value, ...funnel.map((f) => f.value))

  return (
    <div className="space-y-7">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Visitantes de la portada" value={t.visitors} hint={`${t.sessions} visitas`} />
        <Kpi label="Apps creadas" value={t.signups} hint="sin contar cortesías" />
        <Kpi label="Conversión" value={`${conversion}%`} hint="visitantes que crean su app" accent />
        <Kpi label="Clientes en webs de negocios" value={t.business_totals.visitors} hint={`${t.business_totals.bookings} reservas · ${bookingRate}%`} />
      </div>

      {t.days <= 2 ? (
        // Con uno o dos días, un gráfico por días tendría una o dos barras: mejor por horas
        <div>
          <h3 className="font-bold">Visitantes por hora</h3>
          <BarChart
            bars={(t.by_hour || []).map((v, h) => ({ label: hourLabel(h), value: v, tip: `${time12(`${h}:00`)} – ${time12(`${(h + 1) % 24}:00`)} · ${v} ${v === 1 ? 'visitante' : 'visitantes'}` }))}
            labelEvery={3}
            barClass="bg-gradient-to-t from-rose-400 to-orange-300"
          />
        </div>
      ) : (
        <div>
          <h3 className="font-bold">Visitantes por día</h3>
          <BarChart
            bars={t.by_day.map((d) => ({ label: dayLabel(d.day), value: d.visitors, tip: `${dayTip(d.day)} · ${d.visitors} visitantes · ${d.signups} apps creadas` }))}
            labelEvery={labelEvery}
            barClass="bg-gradient-to-t from-rose-400 to-orange-300"
          />
        </div>
      )}

      <div>
        <h3 className="font-bold">¿Dónde se quedan?</h3>
        <p className="text-sm text-slate-500">De cada 100 personas que ven la portada, cuántas llegan a cada punto.</p>
        <ol className="mt-3 space-y-2">
          {funnel.map((f, i) => (
            <li key={f.label}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className={`min-w-0 truncate font-medium ${i === worst ? 'text-red-600' : 'text-slate-700'}`}>{f.label}</span>
                <span className="shrink-0 text-slate-600">
                  <b className="text-slate-900">{f.value}</b>
                  {i > 0 && <span className="text-slate-400"> · {pct(f.value, t.funnel.portada)}%</span>}
                </span>
              </div>
              <div className="mt-1 h-2.5 rounded-full bg-slate-100">
                <div
                  className={`h-2.5 rounded-full transition-all duration-700 ${i === worst ? 'bg-red-400' : 'bg-gradient-to-r from-rose-400 to-orange-400'}`}
                  style={{ width: `${f.value > 0 ? Math.max(2, (f.value / top) * 100) : 0}%` }}
                />
              </div>
            </li>
          ))}
        </ol>
        {worst > 0 && (
          <p className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-800 ring-1 ring-red-200">
            El mayor abandono está en <b>"{funnel[worst].label}"</b>: ahí se va el {Math.round(worstLoss * 100)}% de los que llegan al punto anterior.
          </p>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="mb-2 font-bold">De dónde vienen</h3>
          {t.sources.length === 0 ? (
            <p className="text-sm text-slate-500">Todavía no hay visitas en este periodo.</p>
          ) : (
            <RankBars items={t.sources.map((s) => ({ label: SOURCE_NAMES[s.source] || s.source, value: s.visitors }))} barClass="bg-gradient-to-r from-rose-400 to-orange-400" />
          )}
          <p className="mt-2 text-xs text-slate-400">
            Consejo: comparte tus enlaces con <code>?utm_source=nombre</code> (ej. <code>?utm_source=estado</code>) para saber qué publicación te trae más gente.
          </p>
        </div>
        <div>
          <h3 className="mb-2 font-bold">Desde qué dispositivo</h3>
          <RankBars
            items={[{ label: 'Móvil', value: mobile }, { label: 'Ordenador', value: desktop }]}
            format={(n) => `${n} · ${pct(n, mobile + desktop)}%`}
            barClass="bg-gradient-to-r from-rose-400 to-orange-400"
          />
        </div>
      </div>

      <div>
        <h3 className="font-bold">Webs de los negocios</h3>
        <p className="text-sm text-slate-500">Clientes que visitan la web de cada negocio y cuántos reservan desde ella.</p>
        {t.business_pages.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Todavía no hay visitas en este periodo.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {t.business_pages.map((b) => (
              <li key={b.slug} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0 truncate font-semibold">{b.name || b.slug}</span>
                <span className="shrink-0 text-slate-600">
                  {b.visitors} {b.visitors === 1 ? 'visitante' : 'visitantes'} · <b className="text-slate-900">{b.bookings} {b.bookings === 1 ? 'reserva' : 'reservas'}</b>
                  {b.visitors > 0 && <span className="text-slate-400"> · {pct(b.bookings, b.visitors)}%</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Kpi({ label, value, hint, accent }: { label: string; value: number | string; hint?: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl p-3.5 ring-1 ${accent ? 'bg-brand/5 ring-brand/30' : 'bg-slate-50 ring-slate-200'}`}>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold tracking-tight ${accent ? 'text-brand' : ''}`}>{value}</p>
      {hint && <p className="truncate text-xs text-slate-400">{hint}</p>}
    </div>
  )
}
