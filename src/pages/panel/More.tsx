import { Link } from 'react-router-dom'
import { InstallButton } from '../../components/InstallButton'
import { hasModule, type ModuleKey } from '../../lib/plans'
import { publicUrl } from '../../lib/url'
import { APP_VERSION } from '../../lib/version'
import { usePanel } from './context'
import { Icon } from './Panel'

export interface MoreItem { to: string; label: string; desc: string; icon: string; module?: ModuleKey }

// Agrupadas por tema (también las usa el menú lateral del panel en ordenador)
export const MORE_GROUPS: { title: string; items: MoreItem[] }[] = [
  {
    title: 'Tu negocio',
    items: [
      { to: 'apariencia', label: 'Apariencia', desc: 'Portada, letra, botones, textos y redes', icon: 'palette' },
      { to: 'equipo', label: 'Equipo', desc: 'Tus profesionales, cada uno con su agenda', icon: 'users', module: 'empleados' },
      { to: 'horario', label: 'Horario', desc: 'Turnos y días cerrados', icon: 'clock' },
      { to: 'horario#clientes-por-turno', label: 'Clientes por turno', desc: 'Cuántos clientes reservan a la misma hora', icon: 'seats' },
      { to: 'politicas', label: 'Políticas', desc: 'Reglas de reserva y lo que leen tus clientas', icon: 'scroll' },
      { to: 'ajustes', label: 'Ajustes', desc: 'Logo, color, enlace, moneda y avisos', icon: 'gear' },
    ],
  },
  {
    title: 'Clientes y ventas',
    items: [
      { to: 'recordatorios', label: 'Recordatorios', desc: 'Avisa por WhatsApp a los clientes de mañana', icon: 'bell', module: 'recordatorios' },
      { to: 'espera', label: 'Lista de espera', desc: 'Clientes que quieren un hueco', icon: 'hourglass', module: 'espera' },
      { to: 'cupones', label: 'Cupones', desc: 'Códigos de descuento', icon: 'gift', module: 'descuentos' },
      { to: 'bonos', label: 'Bonos', desc: 'Paquetes de sesiones prepagadas', icon: 'ticket', module: 'clientes' },
      { to: 'opiniones', label: 'Opiniones', desc: 'Lo que dicen tus clientes', icon: 'star', module: 'opiniones' },
      { to: 'galeria', label: 'Galería', desc: 'Fotos de tus trabajos', icon: 'image', module: 'galeria' },
    ],
  },
  {
    title: 'Números',
    items: [
      { to: 'estadisticas', label: 'Estadísticas', desc: 'Ingresos, asistencia y lo más pedido', icon: 'chart', module: 'finanzas' },
      { to: 'gastos', label: 'Gastos', desc: 'Apunta tus gastos y mira tu ganancia', icon: 'receipt', module: 'finanzas' },
      { to: 'respaldo', label: 'Respaldo', desc: 'Descarga tus datos en Excel', icon: 'download', module: 'respaldo' },
    ],
  },
  {
    title: 'Tu cuenta',
    items: [{ to: 'plan', label: 'Mensualidad', desc: 'Hasta cuándo está pagado y cómo pagar', icon: 'card' }],
  },
]

export default function More() {
  const { business, status, link, showTour, showNews } = usePanel()
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold tracking-tight">Más</h1>
      <button onClick={showTour} className="flex w-full items-center gap-3 rounded-2xl bg-brand bg-btn-grad p-4 text-left text-white shadow-lg shadow-brand/25 transition active:scale-[0.99]">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20"><Icon name="compass" className="h-6 w-6" /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">¿Cómo funciona tu panel?</span>
          <span className="block truncate text-sm text-white/80">Un recorrido rápido por las secciones principales</span>
        </span>
        <Icon name="chevron" className="h-5 w-5 shrink-0 text-white/80" />
      </button>

      {MORE_GROUPS.map((g) => (
        <section key={g.title}>
          <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{g.title}</h2>
          <ul className="card divide-y divide-slate-100 overflow-hidden p-0 sm:p-0">
            {g.items.map((it) => {
              const locked = it.module && !hasModule(status.effective_plan, it.module)
              return (
                <li key={it.to}>
                  <Link to={link(it.to)} className="flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50 active:bg-slate-100">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand"><Icon name={it.icon} className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{it.label}</span>
                      <span className="block truncate text-sm text-slate-500">{it.desc}</span>
                    </span>
                    {locked ? <span className="chip bg-slate-100 text-xs text-slate-600">🔒</span> : <Icon name="chevron" className="h-4 w-4 shrink-0 text-slate-400" />}
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      <a href={publicUrl(business.slug)} target="_blank" rel="noreferrer" className="card flex items-center gap-3 font-semibold transition hover:bg-slate-50">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand"><Icon name="globe" className="h-5 w-5" /></span>
        <span className="flex-1">Ver mi web de reservas</span>
        <Icon name="external" className="h-4 w-4 text-slate-400" />
      </a>
      <InstallButton appName="tu panel" label="Instalar el panel en este móvil" block />
      <button onClick={showNews} className="mx-auto flex items-center gap-1.5 text-sm font-semibold text-brand">
        <Icon name="sparkles" className="h-4 w-4" /> Novedades de la versión {APP_VERSION}
      </button>
      <p className="-mt-3 text-center text-xs text-slate-400">Citora v{APP_VERSION}</p>
    </div>
  )
}
