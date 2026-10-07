import { useState } from 'react'
import { useInstall } from '../lib/pwa'
import { Button, Modal } from './ui'

/** "Instalar app": abre el aviso del sistema en Android/Chrome o explica los pasos en iPhone */
export function InstallButton({ label = 'Instalar app', appName, block, variant = 'secondary' }: {
  label?: string
  appName: string
  block?: boolean
  variant?: 'primary' | 'secondary' | 'ghost'
}) {
  const { mode, install } = useInstall()
  const [help, setHelp] = useState(false)
  if (!mode) return null

  return (
    <>
      <Button variant={variant} block={block} onClick={() => (mode === 'prompt' ? install() : setHelp(true))}>
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
        </svg>
        {label}
      </Button>
      <Modal open={help} onClose={() => setHelp(false)} title={`Instalar ${appName}`} footer={<Button block onClick={() => setHelp(false)}>Entendido</Button>}>
        <ol className="space-y-3 text-slate-700">
          <li>
            <b>1.</b> Abre esta página en <b>Safari</b>.
          </li>
          <li className="flex flex-wrap items-center gap-1">
            <b>2.</b> Pulsa el botón <b>Compartir</b>
            <svg viewBox="0 0 24 24" className="inline h-5 w-5 text-sky-600" fill="none" stroke="currentColor" strokeWidth="2" aria-label="icono compartir">
              <path d="M12 3v12M8 7l4-4 4 4M5 12v8h14v-8" />
            </svg>
            abajo en la pantalla.
          </li>
          <li>
            <b>3.</b> Elige <b>"Añadir a pantalla de inicio"</b> y pulsa <b>Añadir</b>.
          </li>
        </ol>
        <p className="mt-4 text-sm text-slate-500">Aparecerá el icono de {appName} en tu móvil, como cualquier otra app.</p>
      </Modal>
    </>
  )
}
