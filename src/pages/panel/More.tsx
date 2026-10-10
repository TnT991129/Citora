import { Link } from 'react-router-dom'
import { InstallButton } from '../../components/InstallButton'
import { hasModule, type ModuleKey } from '../../lib/plans'
import { publicUrl } from '../../lib/url'
import { usePanel } from './context'

const ITEMS: { to: string; label: string; desc: string; emoji: string; module?: ModuleKey }[] = [
  { to: 'apariencia', label: 'Apariencia', desc: 'Portada, letra, botones, textos y redes', emoji: '🎨' },
  { to: 'equipo', label: 'Equipo', desc: 'Tus profesionales, cada uno con su agenda', emoji: '👥', module: 'empleados' },
  { to: 'recordatorios', label: 'Recordatorios', desc: 'Avisa por WhatsApp a los clientes de mañana', emoji: '🔔', module: 'recordatorios' },
  { to: 'estadisticas', label: 'Estadísticas', desc: 'Ingresos, asistencia y lo más pedido', emoji: '📊', module: 'finanzas' },
  { to: 'espera', label: 'Lista de espera', desc: 'Clientes que quieren un hueco', emoji: '⏳', module: 'espera' },
  { to: 'cupones', label: 'Cupones', desc: 'Códigos de descuento', emoji: '🎁', module: 'descuentos' },
  { to: 'opiniones', label: 'Opiniones', desc: 'Lo que dicen tus clientes', emoji: '⭐', module: 'opiniones' },
  { to: 'galeria', label: 'Galería', desc: 'Fotos de tus trabajos', emoji: '📷', module: 'galeria' },
  { to: 'respaldo', label: 'Respaldo', desc: 'Descarga tus datos en Excel', emoji: '💾', module: 'respaldo' },
  { to: 'horario', label: 'Horario', desc: 'Turnos, días cerrados y reglas', emoji: '🕒' },
  { to: 'ajustes', label: 'Ajustes', desc: 'Logo, color, enlace y políticas', emoji: '⚙️' },
  { to: 'plan', label: 'Mensualidad', desc: 'Hasta cuándo está pagado y cómo pagar', emoji: '💳' },
]

export default function More() {
  const { business, status, link } = usePanel()
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">Más</h1>
      <ul className="grid gap-3 sm:grid-cols-2">
        {ITEMS.map((it) => {
          const locked = it.module && !hasModule(status.effective_plan, it.module)
          return (
            <li key={it.to}>
              <Link to={link(it.to)} className="card flex items-center gap-3 hover:ring-slate-300">
                <span className="text-2xl" aria-hidden>{it.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{it.label}</span>
                  <span className="block truncate text-sm text-slate-500">{it.desc}</span>
                </span>
                {locked && <span className="chip bg-slate-100 text-xs text-slate-600">🔒</span>}
              </Link>
            </li>
          )
        })}
      </ul>
      <a href={publicUrl(business.slug)} target="_blank" rel="noreferrer" className="card flex items-center justify-between font-semibold">
        <span>🌐 Ver mi web de reservas</span>
        <span className="text-brand">→</span>
      </a>
      <InstallButton appName="tu panel" label="Instalar el panel en este móvil" block />
    </div>
  )
}
