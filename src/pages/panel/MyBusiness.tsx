// "Mi negocio": el enlace para compartir y todo lo que ven los clientes (servicios, horario,
// apariencia) y cómo trabaja el negocio (equipo, reglas de reserva).
import { useEffect, useState } from 'react'
import { flash, WhatsAppIcon } from '../../components/ui'
import { pricesUnreviewed } from '../../lib/onboarding'
import { hasModule } from '../../lib/plans'
import { supabase } from '../../lib/supabase'
import { publicUrl } from '../../lib/url'
import { shareLink } from '../../lib/whatsapp'
import { usePanel } from './context'
import { Icon } from './Panel'
import { Chip, Row, RowList, SectionTitle } from './rows'
import { t, tn } from '../../lib/i18n'

const DAY_LETTER = [t('D'), t('L'), t('M'), t('X'), t('J'), t('V'), t('S')]

export default function MyBusiness() {
  const { business, status, services, staff, link, onboarding, progress, markStep, tutorial } = usePanel()
  const url = publicUrl(business.slug)
  const [openDays, setOpenDays] = useState<number[] | null>(null)

  useEffect(() => {
    supabase
      .from('schedule_days')
      .select('weekday, is_open')
      .then(({ data }) => setOpenDays(((data as { weekday: number; is_open: boolean }[]) || []).filter((d) => d.is_open).map((d) => d.weekday)))
  }, [])

  const main = services.filter((s) => s.active && !s.is_extra).length
  const extras = services.filter((s) => s.active && s.is_extra).length
  const team = staff.filter((s) => s.active).length
  const visits = progress?.visits_7d

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      flash(t('Enlace copiado'))
    } catch {
      flash(t('No se pudo copiar'))
    }
  }

  const days = openDays === null ? t('Cargando…')
    : openDays.length === 0 ? t('Sin días abiertos')
      : openDays.length === 7 ? t('Todos los días')
        : [1, 2, 3, 4, 5, 6, 0].filter((d) => openDays.includes(d)).map((d) => DAY_LETTER[d]).join(' · ')

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold tracking-tight">{t('Mi negocio')}</h1>

      <section className="card">
        <p className="text-sm font-semibold text-slate-500">{t('Tu página de reservas')}</p>
        <div className="mt-2 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
          <Icon name="link" className="h-4 w-4 shrink-0 text-brand" />
          <span className="truncate font-mono text-[15px] font-semibold text-brand">{url.replace(/^https?:\/\//, '')}</span>
        </div>
        <div className="mt-3 grid grid-cols-[1fr_auto_auto] gap-2">
          <a
            href={shareLink(`¡Reserva tu cita en ${business.name} desde aquí! ${url}`)}
            target="_blank"
            rel="noreferrer"
            data-tour="compartir"
            onClick={(e) => {
              // En el tutorial no se abre WhatsApp de verdad
              if (tutorial.active) e.preventDefault()
              else markStep('compartir')
            }}
            className="inline-flex items-center justify-center gap-2 rounded-btn bg-[#25D366] px-4 py-2.5 font-semibold text-white shadow-sm transition active:scale-[0.98]"
          >
            <WhatsAppIcon className="h-4 w-4" /> {t('Compartir')}
          </a>
          <button onClick={copy} className="rounded-xl px-3 text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50" aria-label={t('Copiar enlace')} title={t('Copiar enlace')}>
            <Icon name="copy" className="h-[18px] w-[18px]" />
          </button>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            onClick={() => markStep('ver')}
            className="flex items-center rounded-xl px-3 text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50"
            aria-label={t('Ver mi página')}
            title={t('Ver mi página')}
          >
            <Icon name="eye" className="h-[18px] w-[18px]" />
          </a>
        </div>
        <p className="mt-3 text-sm text-slate-500">
          {t('Ponlo en tu estado de WhatsApp y en tu Instagram.')}
          {typeof visits === 'number' && (
            <> {t('Esta semana')}{' '}{visits === 0 ? t('no lo ha abierto nadie todavía') : <>{t('lo')}{' '}{visits === 1 ? t('abrió') : 'abrieron'} <b className="text-slate-700">{visits} {visits === 1 ? t('persona') : t('personas')}</b></>}.</>
          )}
        </p>
      </section>

      <div>
        <SectionTitle>{t('Lo que ven tus clientes')}</SectionTitle>
        <RowList>
          <Row
            icon="scissors"
            title={t('Servicios')}
            sub={`${tn(main, '{n} servicio', '{n} servicios')}${extras ? ` · ${tn(extras, '{n} extra', '{n} extras')}` : ''}`}
            to={link('servicios')}
            right={pricesUnreviewed(onboarding) ? <Chip>{t('Revisar')}</Chip> : undefined}
          />
          <Row icon="clock" title={t('Horario')} sub={days} to={link('horario')} />
          <Row icon="palette" title={t('Apariencia')} sub={t('Color, logo, foto de portada y textos')} to={link('apariencia')} />
        </RowList>
      </div>

      <div>
        <SectionTitle>{t('Cómo trabajas')}</SectionTitle>
        <RowList>
          <Row
            icon="users"
            title={t('Equipo')}
            sub={!hasModule(status.effective_plan, 'empleados') ? t('Varias personas, cada una con sus servicios') : team ? tn(team, '{n} profesional', '{n} profesionales') : t('Solo tú · añade a quien trabaje contigo')}
            to={link('equipo')}
            right={!hasModule(status.effective_plan, 'empleados') ? <Chip tone="brand">{t('Plan Equipo')}</Chip> : staff.some((s) => s.active && !s.own_services) ? <Chip>{t('Reparte servicios')}</Chip> : undefined}
          />
          <Row icon="scroll" title={t('Reglas de reserva')} sub={t('Cancelaciones, antelación, depósito y lo que leen tus clientes')} to={link('politicas')} />
        </RowList>
      </div>
    </div>
  )
}
