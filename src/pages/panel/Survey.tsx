import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Alert, Button, Modal, flash } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { load, save } from '../../lib/storage'
import { supabase } from '../../lib/supabase'
import type { OwnerSurvey, SurveyAnswers, SurveyQuestion } from '../../lib/types'
import { Icon } from './Panel'

// "Ahora no": la encuesta se vuelve a ofrecer a los 3 días
const LATER_MS = 3 * 24 * 3600 * 1000
const laterKey = (id: string) => `citora:encuesta-luego:${id}`

/** Aviso arriba del panel cuando Citora pregunta algo al dueño (ver Admin → Encuestas). Con el enlace
 *  #encuesta (el que manda el administrador por WhatsApp) se abre directamente. */
export function SurveyBanner() {
  const { hash } = useLocation()
  const [survey, setSurvey] = useState<OwnerSurvey | null>(null)
  const [open, setOpen] = useState(false)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    supabase.rpc('get_my_survey').then(({ data }) => {
      const s = (data as OwnerSurvey | null) || null
      setSurvey(s)
      if (!s) return
      if (hash === '#encuesta') setOpen(true)
      else if (Date.now() - load<number>(laterKey(s.id), 0) < LATER_MS) setHidden(true)
    })
  }, [hash])

  if (!survey || hidden) return null

  const later = () => {
    save(laterKey(survey.id), Date.now())
    setHidden(true)
  }

  return (
    <>
      <div className="mx-auto max-w-4xl px-4 pt-4 lg:px-8 lg:pt-6">
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <Icon name="star" className="h-5 w-5 shrink-0" />
          <span className="min-w-0 flex-1"><b>Citora quiere saber tu opinión.</b> {survey.title} · menos de 2 minutos.</span>
          <div className="flex items-center gap-1">
            <button onClick={later} className="rounded-full px-3 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-100">Ahora no</button>
            <button onClick={() => setOpen(true)} className="rounded-full bg-sky-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-sky-700">Responder</button>
          </div>
        </div>
      </div>
      {open && (
        <SurveyModal
          survey={survey}
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false)
            setSurvey(null)
            flash('¡Gracias por tu opinión!')
          }}
        />
      )}
    </>
  )
}

function SurveyModal({ survey, onClose, onDone }: { survey: OwnerSurvey; onClose: () => void; onDone: () => void }) {
  const [answers, setAnswers] = useState<SurveyAnswers>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (id: string, v: number | boolean | string) => setAnswers((a) => ({ ...a, [id]: v }))
  const missing = survey.questions.filter((q) => q.type !== 'texto' && answers[q.id] === undefined).length

  const send = async () => {
    if (missing > 0) return setError(missing === 1 ? 'Te falta 1 pregunta por responder.' : `Te faltan ${missing} preguntas por responder.`)
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('submit_survey_answer', { p_survey: survey.id, p_answers: answers })
    setBusy(false)
    if (error) return setError(errorMessage(error))
    onDone()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={survey.title}
      footer={
        <div className="space-y-2">
          {error && <Alert>{error}</Alert>}
          <Button block onClick={send} loading={busy}>Enviar mi opinión</Button>
        </div>
      }
    >
      <div className="space-y-6">
        <p className="text-sm text-slate-600">{survey.intro || 'Tu opinión nos ayuda a mejorar Citora para tu negocio.'} Solo la ve el equipo de Citora.</p>
        {survey.questions.map((q, i) => (
          <Question key={q.id} n={i + 1} q={q} value={answers[q.id]} onChange={(v) => set(q.id, v)} />
        ))}
      </div>
    </Modal>
  )
}

function Question({ n, q, value, onChange }: { n: number; q: SurveyQuestion; value: number | boolean | string | undefined; onChange: (v: number | boolean | string) => void }) {
  return (
    <fieldset className="space-y-2.5">
      <legend className="mb-2.5 font-bold">
        {n}. {q.text}
        {q.type === 'texto' && <span className="font-normal text-slate-500"> (opcional)</span>}
      </legend>
      {q.type === 'estrellas' && <Stars value={typeof value === 'number' ? value : 0} onChange={onChange} />}
      {q.type === 'si_no' && (
        <div className="grid grid-cols-2 gap-2">
          {([true, false] as const).map((v) => (
            <button
              key={String(v)}
              type="button"
              onClick={() => onChange(v)}
              aria-pressed={value === v}
              className={`rounded-xl py-3 font-semibold transition ${value === v ? 'bg-brand text-white shadow' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:ring-brand'}`}
            >
              {v ? 'Sí' : 'No'}
            </button>
          ))}
        </div>
      )}
      {q.type === 'texto' && (
        <textarea
          className="input min-h-[96px]"
          maxLength={1000}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Escribe lo que quieras…"
        />
      )}
    </fieldset>
  )
}

const STAR_LABELS = ['Nada', 'Poco', 'Regular', 'Bastante', 'Mucho']

function Stars({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((v) => (
          <button key={v} type="button" onClick={() => onChange(v)} aria-label={`${v} de 5`} aria-pressed={value === v} className="rounded-lg p-1 transition active:scale-90">
            <svg viewBox="0 0 24 24" className={`h-9 w-9 ${v <= value ? 'fill-amber-400 text-amber-400' : 'fill-none text-slate-300'}`} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
              <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" />
            </svg>
          </button>
        ))}
      </div>
      <p className="mt-1 h-4 text-xs text-slate-500">{value ? STAR_LABELS[value - 1] : ''}</p>
    </div>
  )
}
