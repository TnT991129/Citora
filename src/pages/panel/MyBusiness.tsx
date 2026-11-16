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

const DAY_LETTER = ['D', 'L', 'M', 'X', 'J', 'V', 'S']

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
      flash('Enlace copiado')
    } catch {
      flash('No se pudo copiar')
    }
  }

  const days = openDays === null ? 'Cargando…'
    : openDays.length === 0 ? 'Sin días abiertos'
      : openDays.length === 7 ? 'Todos los días'
        : [1, 2, 3, 4, 5, 6, 0].filter((d) => openDays.includes(d)).map((d) => DAY_LETTER[d]).join(' · ')

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold tracking-tight">Mi negocio</h1>

      <section className="card">
        <p className="text-sm font-semibold text-slate-500">Tu página de reservas</p>
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
            <WhatsAppIcon className="h-4 w-4" /> Compartir
          </a>
          <button onClick={copy} className="rounded-xl px-3 text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50" aria-label="Copiar enlace" title="Copiar enlace">
            <Icon name="copy" className="h-[18px] w-[18px]" />
          </button>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            onClick={() => markStep('ver')}
            className="flex items-center rounded-xl px-3 text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50"
            aria-label="Ver mi página"
            title="Ver mi página"
          >
            <Icon name="eye" className="h-[18px] w-[18px]" />
          </a>
        </div>
        <p className="mt-3 text-sm text-slate-500">
          Ponlo en tu estado de WhatsApp y en tu Instagram.
          {typeof visits === 'number' && (
            <> Esta semana {visits === 0 ? 'no lo ha abierto nadie todavía' : <>lo {visits === 1 ? 'abrió' : 'abrieron'} <b className="text-slate-700">{visits} {visits === 1 ? 'persona' : 'personas'}</b></>}.</>
          )}
        </p>
      </section>

      <div>
        <SectionTitle>Lo que ven tus clientes</SectionTitle>
        <RowList>
          <Row
            icon="scissors"
            title="Servicios"
            sub={`${main} ${main === 1 ? 'servicio' : 'servicios'}${extras ? ` · ${extras} ${extras === 1 ? 'extra' : 'extras'}` : ''}`}
            to={link('servicios')}
            right={pricesUnreviewed(onboarding) ? <Chip>Revisar</Chip> : undefined}
          />
          <Row icon="clock" title="Horario" sub={days} to={link('horario')} />
          <Row icon="palette" title="Apariencia" sub="Color, logo, foto de portada y textos" to={link('apariencia')} />
        </RowList>
      </div>

      <div>
        <SectionTitle>Cómo trabajas</SectionTitle>
        <RowList>
          <Row
            icon="users"
            title="Equipo"
            sub={!hasModule(status.effective_plan, 'empleados') ? 'Varias personas, cada una con sus servicios' : team ? `${team} ${team === 1 ? 'profesional' : 'profesionales'}` : 'Solo tú · añade a quien trabaje contigo'}
            to={link('equipo')}
            right={!hasModule(status.effective_plan, 'empleados') ? <Chip tone="brand">Plan Equipo</Chip> : staff.some((s) => s.active && !s.own_services) ? <Chip>Reparte servicios</Chip> : undefined}
          />
          <Row icon="scroll" title="Reglas de reserva" sub="Cancelaciones, antelación, depósito y lo que leen tus clientes" to={link('politicas')} />
        </RowList>
      </div>
    </div>
  )
}
