// Dueños con dos WhatsApp (el personal y WhatsApp Business) en el mismo móvil: el enlace normal (wa.me)
// abre el que el móvil elija (en iPhone, el personal) y no hay forma de pedir el otro. Con esta opción
// (se guarda en ese móvil), al tocar cualquier botón de WhatsApp del panel sale una ventana para copiar
// el número de la clienta y el mensaje, y abrir el menú de compartir del móvil para elegir WhatsApp Business.
import { useEffect, useState } from 'react'
import { Button, CopyButton, Modal, Toggle, WhatsAppIcon, flash } from '../../components/ui'
import { load, remove, save } from '../../lib/storage'
import { t } from '../../lib/i18n'

const KEY = 'citora.wa-business'

export function waBusinessOn(): boolean {
  return load<boolean>(KEY, false) === true
}

/** "https://wa.me/5355551234?text=..." → número y mensaje. Los enlaces sin número (compartir) no cuentan. */
export function parseWaLink(href: string): { phone: string; text: string } | null {
  const m = /^https:\/\/wa\.me\/(\d{6,})(?:\?text=([^#]*))?$/.exec(href)
  if (!m) return null
  let text = ''
  try {
    text = m[2] ? decodeURIComponent(m[2]) : ''
  } catch {
    return null
  }
  return { phone: m[1], text }
}

/** En el panel: si la opción está activada, los botones de WhatsApp abren la ventana de copiar en vez de WhatsApp */
export function WaBusinessCatcher() {
  const [msg, setMsg] = useState<{ phone: string; text: string; href: string } | null>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || !waBusinessOn()) return
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a) return
      const parsed = parseWaLink(a.href)
      if (!parsed) return
      // Solo se cambia a dónde lleva el enlace: lo que hace el botón (p. ej. marcar el recordatorio como enviado) sigue igual
      e.preventDefault()
      setMsg({ ...parsed, href: a.href })
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  const share = async () => {
    if (!msg) return
    try {
      await navigator.share({ text: msg.text })
    } catch {
      /* cerró el menú sin elegir */
    }
  }
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  return (
    <Modal open={!!msg} onClose={() => setMsg(null)} title={t('Escribir por WhatsApp Business')}>
      {msg && (
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">{t('1. Número de la clienta')}</p>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="font-mono text-lg font-bold">+{msg.phone}</span>
              <CopyButton text={`+${msg.phone}`} label={t('Copiar número')} />
            </div>
          </div>
          {msg.text && (
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase text-slate-500">{t('2. Mensaje')}</p>
                <CopyButton text={msg.text} label={t('Copiar mensaje')} />
              </div>
              <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-sm text-slate-700">{msg.text}</p>
            </div>
          )}
          <p className="text-sm text-slate-600">
            {t('Abre WhatsApp Business, toca el botón de chat nuevo, pega el número para encontrarla y pega el mensaje.')}
          </p>
          {canShare && (
            <Button variant="whatsapp" block onClick={share}>
              <WhatsAppIcon className="h-5 w-5" /> {t('Compartir el mensaje (elige WhatsApp Business)')}
            </Button>
          )}
          <a href={msg.href} target="_blank" rel="noreferrer" onClick={() => setMsg(null)} className="block text-center text-sm font-semibold text-slate-500 underline">
            {t('Abrir con el WhatsApp de siempre')}
          </a>
        </div>
      )}
    </Modal>
  )
}

/** Ajustes: activar la ventana de copiar (solo para quien tiene dos WhatsApp en este móvil) */
export function WaBusinessSetting() {
  const [on, setOn] = useState(waBusinessOn)
  const toggle = (v: boolean) => {
    if (v) save(KEY, true)
    else remove(KEY)
    setOn(v)
    flash(v ? t('Listo: al escribir a una clienta podrás copiar su número y el mensaje') : t('Los mensajes se abren en WhatsApp como siempre'))
  }
  return (
    <section className="card">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-bold">{t('¿Tienes dos WhatsApp en este móvil?')}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {t('Si los mensajes a tus clientas se abren en tu WhatsApp personal y quieres mandarlos desde WhatsApp Business, actívalo. Al tocar WhatsApp podrás copiar el número de la clienta y el mensaje para pegarlos en WhatsApp Business.')}
          </p>
        </div>
        <Toggle checked={on} onChange={toggle} label={t('¿Tienes dos WhatsApp en este móvil?')} />
      </div>
    </section>
  )
}
