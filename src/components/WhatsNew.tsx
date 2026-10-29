import { Icon } from '../pages/panel/Panel'
import { APP_VERSION, RELEASE_NOTES, RELEASE_TIP } from '../lib/version'
import { Button, Modal } from './ui'

/** Ventana de novedades de la versión (ver lib/version.ts) */
export function WhatsNew({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={`Novedades de Citora ${APP_VERSION}`} footer={<Button block size="lg" onClick={onClose}>¡Entendido!</Button>}>
      <div className="space-y-5">
        <div className="relative overflow-hidden rounded-2xl bg-brand bg-btn-grad p-5 text-white">
          <span aria-hidden className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/10" />
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/80">Versión {APP_VERSION}</p>
          <p className="mt-1 text-xl font-extrabold leading-tight">Citora se ve y funciona mejor que nunca 🎉</p>
          <p className="mt-1 text-sm text-white/85">Esto es lo nuevo para ti y para tus clientes:</p>
        </div>
        {RELEASE_NOTES.map((s) => (
          <section key={s.title} className="flex gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <Icon name={s.icon} className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h3 className="font-extrabold tracking-tight">{s.title}</h3>
              <ul className="mt-1 space-y-1 text-sm text-slate-600">
                {s.points.map((p) => (
                  <li key={p} className="flex gap-2">
                    <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand/60" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ))}
        <p className="rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <b>Consejo:</b> {RELEASE_TIP}
        </p>
      </div>
    </Modal>
  )
}
