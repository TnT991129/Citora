import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Field, LinkButton, Modal, PageLoader, Spinner, Toggle, WhatsAppIcon, flash } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { fullDateFromIso } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import type { SurveyAnswers, SurveyQuestion, SurveyQuestionType } from '../../lib/types'
import { panelUrl } from '../../lib/url'
import { waLink } from '../../lib/whatsapp'

const TZ = 'Etc/GMT+4'

interface SurveyBusiness { business_id: string; name: string; code: string; slug: string; whatsapp: string }

interface AdminSurvey {
  id: string
  title: string
  intro: string | null
  questions: SurveyQuestion[]
  active: boolean
  created_at: string
  /** null = para todos los negocios */
  business_ids: string[] | null
  answers: (SurveyBusiness & { answers: SurveyAnswers; created_at: string })[]
  pending: SurveyBusiness[]
}

/** Un negocio que puede recibir la encuesta (de admin_list_owners) */
interface Candidate { id: string; name: string; code: string; status: 'prueba' | 'activo'; comped: boolean }

const TYPE_LABEL: Record<SurveyQuestionType, string> = { estrellas: 'Estrellas (1 a 5)', si_no: 'Sí o No', texto: 'Texto libre' }

/** Lo que preguntas a los dueños sobre Citora y lo que te responden (ver owner_surveys en schema.sql) */
export default function Surveys() {
  const [list, setList] = useState<AdminSurvey[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_list_surveys')
    if (error) setError(errorMessage(error))
    else setList(data as AdminSurvey[])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (error && !list) return <Alert>{error}</Alert>
  if (!list) return <PageLoader />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">Encuestas a los dueños</h1>
          <p className="text-sm text-slate-500">Pregúntales qué les parece Citora. Les sale un aviso en su panel y responden en un minuto.</p>
        </div>
        <Button onClick={() => setCreating(true)}>Nueva encuesta</Button>
      </div>
      {error && <Alert>{error}</Alert>}
      {list.length === 0 && (
        <div className="card py-10 text-center">
          <p className="font-bold">Todavía no has preguntado nada</p>
          <p className="mt-1 text-sm text-slate-500">Crea tu primera encuesta: ya viene escrita con tres preguntas que puedes cambiar.</p>
        </div>
      )}
      {list.map((s) => <SurveyCard key={s.id} survey={s} onChange={load} />)}
      {creating && (
        <NewSurveyModal
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false)
            flash('Encuesta publicada: los dueños ya la ven en su panel')
            load()
          }}
        />
      )}
    </div>
  )
}

function SurveyCard({ survey: s, onChange }: { survey: AdminSurvey; onChange: () => void }) {
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [busy, setBusy] = useState(false)
  const total = s.answers.length

  const toggleActive = async () => {
    setBusy(true)
    const { error } = await supabase.rpc('admin_set_survey_active', { p_survey: s.id, p_active: !s.active })
    setBusy(false)
    if (error) return flash(errorMessage(error))
    flash(s.active ? 'Encuesta cerrada: los dueños ya no la ven' : 'Encuesta abierta otra vez')
    onChange()
  }

  const remove = async () => {
    setBusy(true)
    const { error } = await supabase.rpc('admin_delete_survey', { p_survey: s.id })
    setBusy(false)
    setDeleting(false)
    if (error) return flash(errorMessage(error))
    flash('Encuesta borrada')
    onChange()
  }

  const askMessage = (b: SurveyBusiness) =>
    `Hola, te escribo de Citora. ¿Me ayudas con ${s.questions.length === 1 ? 'una pregunta rápida' : `${s.questions.length} preguntas rápidas`} sobre la app para ${b.name}? Son menos de 2 minutos: ${panelUrl(b.slug)}#encuesta`

  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-extrabold tracking-tight">{s.title}</h2>
          <p className="text-sm text-slate-500">
            {fullDateFromIso(s.created_at, TZ)} · {s.business_ids ? `para ${s.business_ids.length} ${s.business_ids.length === 1 ? 'negocio' : 'negocios'}` : 'para todos'}
            {' · '}<b className="text-slate-700">{total}</b> {total === 1 ? 'respuesta' : 'respuestas'}
            {s.active && <> · {s.pending.length} sin responder</>}
          </p>
        </div>
        <span className={`chip text-xs ${s.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{s.active ? 'Abierta' : 'Cerrada'}</span>
      </div>

      <div className="space-y-4">
        {s.questions.map((q, i) => <Summary key={q.id} n={i + 1} q={q} survey={s} />)}
      </div>

      {open && (
        <div className="space-y-4 border-t border-slate-100 pt-4">
          <div>
            <h3 className="mb-2 text-sm font-bold">Respuestas de cada negocio</h3>
            {total === 0 && <p className="text-sm text-slate-500">Nadie ha respondido todavía.</p>}
            <ul className="space-y-2">
              {s.answers.map((a) => (
                <li key={a.business_id} className="rounded-xl bg-slate-50 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold">{a.name} <span className="font-mono text-xs font-normal text-slate-400">{a.code}</span></p>
                    <span className="text-xs text-slate-400">{fullDateFromIso(a.created_at, TZ)}</span>
                  </div>
                  <ul className="mt-1.5 space-y-1 text-slate-700">
                    {s.questions.map((q) => a.answers[q.id] !== undefined && (
                      <li key={q.id}><span className="text-slate-500">{q.text}</span> <b>{showAnswer(q, a.answers[q.id])}</b></li>
                    ))}
                  </ul>
                  {a.whatsapp && (
                    <LinkButton href={waLink(a.whatsapp, `Hola, te escribo de Citora. ¡Gracias por responder la encuesta sobre ${a.name}! `)} variant="whatsapp" size="sm" newTab className="mt-2">
                      <WhatsAppIcon className="h-4 w-4" /> Responderle
                    </LinkButton>
                  )}
                </li>
              ))}
            </ul>
          </div>
          {s.active && s.pending.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-bold">Faltan por responder ({s.pending.length})</h3>
              <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
                {s.pending.map((b) => (
                  <li key={b.business_id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate font-semibold">{b.name} <span className="font-mono text-xs font-normal text-slate-400">{b.code}</span></span>
                    {b.whatsapp && (
                      <LinkButton href={waLink(b.whatsapp, askMessage(b))} variant="whatsapp" size="sm" newTab>
                        <WhatsAppIcon className="h-4 w-4" /> Pedírsela
                      </LinkButton>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
        <Button size="sm" variant="secondary" onClick={() => setOpen((o) => !o)}>{open ? 'Ocultar detalle' : 'Ver cada respuesta'}</Button>
        <Button size="sm" variant="ghost" onClick={toggleActive} loading={busy && !deleting}>{s.active ? 'Cerrar encuesta' : 'Volver a abrir'}</Button>
        <Button size="sm" variant="ghost" className="ml-auto !text-red-600" onClick={() => setDeleting(true)}>Borrar</Button>
      </div>

      {deleting && (
        <Modal
          open
          onClose={() => setDeleting(false)}
          title="¿Borrar la encuesta?"
          footer={<Button block variant="danger" onClick={remove} loading={busy}>Sí, borrar con sus respuestas</Button>}
        >
          <p className="text-slate-600">Se borran «{s.title}» y sus {total} {total === 1 ? 'respuesta' : 'respuestas'}. No se puede deshacer. Si solo quieres que deje de salir, ciérrala.</p>
        </Modal>
      )}
    </section>
  )
}

function showAnswer(q: SurveyQuestion, v: number | boolean | string): string {
  if (q.type === 'estrellas') return `${'★'.repeat(Number(v))}${'☆'.repeat(5 - Number(v))}`
  if (q.type === 'si_no') return v ? 'Sí' : 'No'
  return `“${v}”`
}

/** Resultado de una pregunta: media y reparto de estrellas, % de Sí y No, o los comentarios */
function Summary({ n, q, survey }: { n: number; q: SurveyQuestion; survey: AdminSurvey }) {
  const values = survey.answers.map((a) => ({ a, v: a.answers[q.id] })).filter((x) => x.v !== undefined)
  const count = values.length
  const bar = (label: string, part: number, color: string) => (
    <div key={label} className="flex items-center gap-2 text-xs">
      <span className="w-9 shrink-0 text-slate-500">{label}</span>
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
        <span className={`block h-full rounded-full ${color}`} style={{ width: `${count ? (part / count) * 100 : 0}%` }} />
      </span>
      <span className="w-6 shrink-0 text-right font-semibold text-slate-600">{part}</span>
    </div>
  )

  return (
    <div>
      <p className="mb-2 text-sm font-semibold">{n}. {q.text}</p>
      {count === 0 && <p className="text-sm text-slate-400">Sin respuestas todavía.</p>}
      {count > 0 && q.type === 'estrellas' && (
        <div className="flex items-center gap-4">
          <div className="text-center">
            <p className="text-3xl font-extrabold tracking-tight">{(values.reduce((t, x) => t + Number(x.v), 0) / count).toFixed(1).replace('.', ',')}</p>
            <p className="text-amber-400">★</p>
          </div>
          <div className="flex-1 space-y-1">
            {[5, 4, 3, 2, 1].map((st) => bar(`${st} ★`, values.filter((x) => Number(x.v) === st).length, 'bg-amber-400'))}
          </div>
        </div>
      )}
      {count > 0 && q.type === 'si_no' && (
        <div className="space-y-1">
          {bar('Sí', values.filter((x) => x.v === true).length, 'bg-emerald-500')}
          {bar('No', values.filter((x) => x.v === false).length, 'bg-red-400')}
        </div>
      )}
      {count > 0 && q.type === 'texto' && (
        <ul className="space-y-1.5">
          {values.map(({ a, v }) => (
            <li key={a.business_id} className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
              “{String(v)}” <span className="text-xs text-slate-400">— {a.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

type PickerFilter = 'todos' | 'prueba' | 'activo'

/** Lista de negocios activos para marcar a quién va la encuesta, con buscador y filtros */
function BusinessPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const [all, setAll] = useState<Candidate[] | null>(null)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<PickerFilter>('todos')

  useEffect(() => {
    supabase.rpc('admin_list_owners').then(({ data }) => {
      // Solo los que pueden verla: con negocio y en prueba o pagando (a un negocio vencido no le sale su panel)
      const rows = ((data as (Omit<Candidate, 'status'> & { id: string | null; status: string })[]) || [])
        .filter((o): o is Candidate => !!o.id && (o.status === 'prueba' || o.status === 'activo'))
        .sort((a, b) => a.name.localeCompare(b.name, 'es'))
      setAll(rows)
    })
  }, [])

  if (!all) return <div className="flex justify-center py-4 text-slate-400"><Spinner /></div>
  if (all.length === 0) return <p className="text-sm text-slate-500">No hay negocios en prueba ni pagando.</p>

  const term = q.trim().toLowerCase()
  const shown = all.filter((b) =>
    (filter === 'todos' || b.status === filter) &&
    (!term || b.name.toLowerCase().includes(term) || b.code.toLowerCase().includes(term)),
  )
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])
  const allShown = shown.length > 0 && shown.every((b) => value.includes(b.id))
  const markShown = () => onChange(allShown
    ? value.filter((id) => !shown.some((b) => b.id === id))
    : Array.from(new Set([...value, ...shown.map((b) => b.id)])))

  return (
    <div className="space-y-2.5">
      <input className="input" placeholder="Buscar por nombre o código…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="flex flex-wrap items-center gap-1.5">
        {(['todos', 'prueba', 'activo'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${filter === f ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}
          >
            {f === 'todos' ? 'Todos' : f === 'prueba' ? 'En prueba' : 'Pagando'}
          </button>
        ))}
        <button type="button" onClick={markShown} disabled={shown.length === 0} className="ml-auto text-xs font-semibold text-brand disabled:opacity-40">
          {allShown ? 'Quitar estos' : 'Marcar estos'}
        </button>
      </div>
      <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto overscroll-contain rounded-xl ring-1 ring-slate-200">
        {shown.length === 0 && <li className="px-3 py-4 text-center text-sm text-slate-500">Ningún negocio con ese filtro.</li>}
        {shown.map((b) => (
          <li key={b.id}>
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-slate-50">
              <input type="checkbox" className="h-5 w-5 shrink-0" checked={value.includes(b.id)} onChange={() => toggle(b.id)} />
              <span className="min-w-0 flex-1 truncate font-semibold">{b.name} <span className="font-mono text-xs font-normal text-slate-400">{b.code}</span></span>
              <span className={`chip shrink-0 text-[11px] ${b.comped ? 'bg-violet-100 text-violet-700' : b.status === 'activo' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                {b.comped ? 'Cortesía' : b.status === 'activo' ? 'Pagando' : 'Prueba'}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <p className="text-xs font-semibold text-slate-600">{value.length} {value.length === 1 ? 'negocio elegido' : 'negocios elegidos'}</p>
    </div>
  )
}

// La primera encuesta ya viene escrita: lo que más interesa saber al principio
const TEMPLATE: { type: SurveyQuestionType; text: string }[] = [
  { type: 'estrellas', text: '¿Te está gustando Citora?' },
  { type: 'si_no', text: '¿Te resulta útil para tu negocio?' },
  { type: 'texto', text: '¿Qué cambiarías o qué te gustaría que tuviera Citora?' },
]

function NewSurveyModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [title, setTitle] = useState('¿Qué te parece Citora?')
  const [intro, setIntro] = useState('Queremos mejorar Citora para tu negocio. Son 3 preguntas rápidas.')
  const [questions, setQuestions] = useState(TEMPLATE)
  const [notify, setNotify] = useState(true)
  const [toAll, setToAll] = useState(true)
  const [picked, setPicked] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const edit = (i: number, patch: Partial<(typeof questions)[number]>) =>
    setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)))

  const publish = async () => {
    if (title.trim().length < 3) return setError('Ponle un título a la encuesta.')
    if (questions.some((q) => q.text.trim().length < 3)) return setError('Escribe todas las preguntas (o quita las vacías).')
    if (!toAll && picked.length === 0) return setError('Elige al menos un negocio.')
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('admin_create_survey', {
      p_title: title, p_intro: intro, p_questions: questions, p_notify: notify, p_business_ids: toAll ? null : picked,
    })
    setBusy(false)
    if (error) return setError(errorMessage(error))
    onDone()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Nueva encuesta"
      footer={
        <div className="space-y-2">
          {error && <Alert>{error}</Alert>}
          <Button block onClick={publish} loading={busy}>
            {toAll ? 'Publicar a todos los dueños' : `Publicar a ${picked.length} ${picked.length === 1 ? 'negocio' : 'negocios'}`}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <Field label="Título" hint="Lo ven en el aviso de su panel.">
          <input className="input" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Presentación (opcional)">
          <textarea className="input min-h-[64px]" value={intro} maxLength={300} onChange={(e) => setIntro(e.target.value)} />
        </Field>
        <div className="space-y-3">
          <span className="label">Preguntas</span>
          {questions.map((q, i) => (
            <div key={i} className="space-y-2 rounded-2xl bg-slate-50 p-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-500">{i + 1}.</span>
                <select className="input flex-1 py-2" value={q.type} onChange={(e) => edit(i, { type: e.target.value as SurveyQuestionType })} aria-label="Tipo de respuesta">
                  {(Object.keys(TYPE_LABEL) as SurveyQuestionType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                </select>
                {questions.length > 1 && (
                  <button type="button" onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))} className="rounded-full p-2 text-slate-400 hover:bg-slate-200 hover:text-red-600" aria-label="Quitar pregunta">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                )}
              </div>
              <input className="input" value={q.text} maxLength={200} onChange={(e) => edit(i, { text: e.target.value })} placeholder="Escribe la pregunta" />
            </div>
          ))}
          {questions.length < 10 && (
            <Button size="sm" variant="secondary" onClick={() => setQuestions((qs) => [...qs, { type: 'texto', text: '' }])}>Añadir pregunta</Button>
          )}
          <p className="text-xs text-slate-500">Las de estrellas y Sí/No son obligatorias; las de texto, opcionales. Una vez publicada no se pueden cambiar las preguntas.</p>
        </div>
        <div className="space-y-3">
          <span className="label">¿A quién se la envías?</span>
          <div className="grid grid-cols-2 gap-2">
            {([true, false] as const).map((v) => (
              <button
                key={String(v)}
                type="button"
                onClick={() => setToAll(v)}
                aria-pressed={toAll === v}
                className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${toAll === v ? 'bg-brand text-white shadow' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:ring-brand'}`}
              >
                {v ? 'A todos' : 'Solo a algunos'}
              </button>
            ))}
          </div>
          {toAll
            ? <p className="text-xs text-slate-500">La verán todos los negocios en prueba o pagando, también los que se registren mientras esté abierta.</p>
            : <BusinessPicker value={picked} onChange={setPicked} />}
        </div>
        <div className="flex items-center gap-3">
          <Toggle checked={notify} onChange={setNotify} label="Avisar con una notificación" />
          <span className="text-sm text-slate-700">Avisar con una notificación a los dueños que tienen los avisos activados</span>
        </div>
      </div>
    </Modal>
  )
}
