import { afterEach, describe, expect, it, vi } from 'vitest'
import { waLink } from './whatsapp'

describe('WhatsApp Business', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('en Android abre WhatsApp Business, con el enlace normal de respaldo', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/130' })
    const l = waLink('+53 5 555-1234', 'Hola', 'business')
    expect(l.startsWith('intent://send/?phone=5355551234&text=Hola#Intent;scheme=whatsapp;package=com.whatsapp.w4b;')).toBe(true)
    expect(l).toContain('S.browser_fallback_url=' + encodeURIComponent('https://wa.me/5355551234?text=Hola'))
  })

  it('en iPhone (o con el normal) usa el enlace de siempre', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' })
    expect(waLink('5355551234', 'Hola', 'business')).toBe('https://wa.me/5355551234?text=Hola')
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 14)' })
    expect(waLink('5355551234', 'Hola', 'normal')).toBe('https://wa.me/5355551234?text=Hola')
  })
})
