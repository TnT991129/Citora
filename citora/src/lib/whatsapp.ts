import { cleanPhone } from './format'

/** Abre WhatsApp con un mensaje ya escrito */
export function waLink(phone: string, text: string): string {
  const p = cleanPhone(phone)
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`
}

export function shareLink(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}
