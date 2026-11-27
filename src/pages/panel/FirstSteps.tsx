// Tarjeta "Primeros pasos" de Hoy: lo que tiene que hacer el dueño hasta recibir su primera reserva
// de un cliente. Cuando llega, dice "¡Todo listo!" una vez y desaparece.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FIRST_STEPS, pricesUnreviewed, stepsDone, type StepId } from '../../lib/onboarding'
import { publicUrl } from '../../lib/url'
import { shareLink } from '../../lib/whatsapp'
import { usePanel } from './context'
import { Icon } from './Panel'
import { t } from '../../lib/i18n'

/** Los negocios creados antes de esta versión que ya reciben reservas no ven la tarjeta */
const SINCE = '2026-11-16T00:00:00Z'

export function useFirstStepsVisible(): boolean {
  const { business, onboarding, progress } = usePanel()
  if (!progress) return false
  const done = stepsDone(onboarding, progress)
  if (!done.primera) return true
  if (onboarding.all_done || business.created_at < SINCE) return false
  return true
}

export function FirstSteps() {
  const { business, onboarding, progress, markStep, updateOnboarding, link } = usePanel()
  const navigate = useNavigate()
  const [open, setOpen] = useState(true)
  const visible = useFirstStepsVisible()
  if (!visible || !progress) return null

  const done = stepsDone(onboarding, progress)
  const count = FIRST_STEPS.filter((s) => done[s.id]).length
  const url = publicUrl(business.slug)

  if (done.primera) {
    return (
      <div className="card flex items-center gap-3">
        <span className="text-2xl" aria-hidden>🏆</span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">{t('¡Todo listo!')}</p>
          <p className="text-sm text-slate-500">{t('Ya recibiste tu primera reserva de un cliente. Esta tarjeta ya no saldrá más.')}</p>
        </div>
        <button onClick={() => updateOnboarding({ all_done: new Date().toISOString() })} className="shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-brand hover:bg-brand/10">{t('Cerrar')}</button>
      </div>
    )
  }

  const warnPrices = pricesUnreviewed(onboarding)
  // Lo mismo que los avisos push de los días 3 y 6 (ver _trial_nudges), para quien no los tiene activados
  const days = Math.floor((Date.now() - new Date(business.created_at).getTime()) / 86400000)
  const tip = days >= 6
    ? t('Aún no te han reservado por la web. Manda tu enlace por WhatsApp a tus clientes de siempre y pídeles que reserven su próxima cita desde ahí: así se acostumbran.')
    : days >= 3 && progress.visits_7d === 0
      ? t('Nadie ha abierto tu enlace todavía. Ponlo en tu estado de WhatsApp: toca «Comparte tu enlace en WhatsApp» y el mensaje ya sale escrito.')
      : null
  const act = (id: StepId) => {
    if (id === 'precios') navigate(link('servicios'))
    else if (id === 'avisos') navigate(link('ajustes'))
    else if (id === 'ver') {
      window.open(url, '_blank', 'noopener')
      markStep('ver')
    } else if (id === 'prueba') {
      window.open(publicUrl(business.slug, 'reservar'), '_blank', 'noopener')
      markStep('prueba')
    } else if (id === 'compartir') {
      window.open(shareLink(t('¡Reserva tu cita en {name} desde aquí! {url}', { name: business.name, url })), '_blank', 'noopener')
      markStep('compartir')
    }
  }

  return (
    <section className="card overflow-hidden p-0 sm:p-0">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 p-4 text-left" aria-expanded={open}>
        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center">
          <svg viewBox="0 0 36 36" className="h-11 w-11 -rotate-90" aria-hidden>
            <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="4" className="text-slate-200" />
            <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="text-brand transition-all duration-500" strokeDasharray={`${(count / FIRST_STEPS.length) * 94.2} 94.2`} />
          </svg>
          <span className="absolute text-xs font-bold">{count}/{FIRST_STEPS.length}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">{t('Primeros pasos')}</span>
          <span className="block text-sm text-slate-500">{t('Hasta tu primera reserva de un cliente')}</span>
        </span>
        <Icon name="chevron" className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="space-y-1 border-t border-slate-100 p-2">
          {tip && (
            <p className="flex gap-2 rounded-xl bg-sky-50 p-3 text-sm text-sky-900 ring-1 ring-sky-100">
              <span aria-hidden>💡</span>
              <span>{tip}</span>
            </p>
          )}
          {FIRST_STEPS.map((s) => {
            const ok = done[s.id]
            const warn = s.id === 'precios' && warnPrices
            const auto = s.id === 'primera'
            return (
              <button
                key={s.id}
                onClick={() => !ok && !auto && act(s.id)}
                disabled={ok || auto}
                className={`flex w-full items-start gap-3 rounded-xl p-2.5 text-left transition enabled:hover:bg-slate-50 ${warn ? 'bg-amber-50 ring-1 ring-amber-200' : ''}`}
              >
                <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${ok ? 'bg-emerald-500 text-white' : warn ? 'border-2 border-amber-400 text-amber-500' : 'border-2 border-slate-300'}`}>
                  {ok ? <Icon name="check" className="h-3.5 w-3.5" /> : warn ? '!' : ''}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block font-semibold ${ok ? 'text-slate-400 line-through' : ''}`}>{s.title}</span>
                  {!ok && (
                    <span className={`block text-sm ${warn ? 'text-amber-800' : 'text-slate-500'}`}>
                      {warn ? t('Tus clientes verán los precios de ejemplo. Revísalos antes de compartir.') : s.desc}
                    </span>
                  )}
                </span>
                {!ok && !auto && <Icon name="chevron" className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />}
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
