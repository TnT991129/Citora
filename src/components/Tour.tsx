import { useState } from 'react'
import { load, save } from '../lib/storage'
import { Button, Modal } from './ui'

export interface TourStep {
  emoji: string
  title: string
  text: string
}

/**
 * Recorrido guiado de unos pasos, en un cuadro. Se muestra solo (open) la primera vez que lo monta
 * un componente (si nadie lo ha cerrado antes en este dispositivo, según storageKey). Con el botón
 * "¿Cómo funciona esto?" (ver useTour) se puede volver a abrir cuando se quiera.
 */
export function Tour({ steps, open, onClose }: { steps: TourStep[]; open: boolean; onClose: () => void }) {
  const [i, setI] = useState(0)

  const close = () => {
    setI(0)
    onClose()
  }

  if (!open || steps.length === 0) return null
  const step = steps[i]
  const last = i === steps.length - 1

  return (
    <Modal
      open
      onClose={close}
      title={step.title}
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-1">
            {steps.map((_, k) => (
              <span key={k} className={`h-1.5 w-1.5 rounded-full ${k === i ? 'bg-brand' : 'bg-slate-200'}`} />
            ))}
          </div>
          <div className="flex gap-2">
            {i > 0 && <Button variant="ghost" size="sm" onClick={() => setI((n) => n - 1)}>Atrás</Button>}
            <Button size="sm" onClick={() => (last ? close() : setI((n) => n + 1))}>{last ? 'Entendido' : 'Siguiente'}</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-2 text-center">
        <p className="text-4xl">{step.emoji}</p>
        <p className="text-slate-700">{step.text}</p>
      </div>
      {i === 0 && (
        <button onClick={close} className="mx-auto mt-3 block text-sm font-medium text-slate-400 underline">
          Saltar
        </button>
      )}
    </Modal>
  )
}

/** Abre el recorrido solo (una vez) la primera vez que se usa esta clave en este dispositivo */
export function useTour(storageKey: string): { open: boolean; close: () => void; relaunch: () => void } {
  const key = `citora:tour:${storageKey}`
  const [open, setOpen] = useState(() => !load(key, false))

  const close = () => {
    save(key, true)
    setOpen(false)
  }
  const relaunch = () => setOpen(true)

  return { open, close, relaunch }
}
