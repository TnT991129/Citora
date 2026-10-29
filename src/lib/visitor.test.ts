import { describe, expect, it } from 'vitest'
import { detectSource, isBot } from './visitor'

const HOST = 'tnt991129.github.io'
const CHROME = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'

describe('de dónde viene el visitante', () => {
  it('respeta ?utm_source= y ?ref=', () => {
    expect(detectSource('?utm_source=Estado-WhatsApp', '', CHROME, HOST)).toBe('estado-whatsapp')
    expect(detectSource('?ref=volante', '', CHROME, HOST)).toBe('volante')
  })

  it('reconoce el navegador de Instagram y Facebook aunque no haya web anterior', () => {
    expect(detectSource('', '', CHROME + ' Instagram 300.0', HOST)).toBe('instagram')
    expect(detectSource('', '', CHROME + ' [FBAN/FB4A;FBAV/440.0]', HOST)).toBe('facebook')
  })

  it('reconoce la web anterior', () => {
    expect(detectSource('', 'https://www.google.com/', CHROME, HOST)).toBe('google')
    expect(detectSource('', 'https://l.instagram.com/?u=x', CHROME, HOST)).toBe('instagram')
    expect(detectSource('', 'https://web.whatsapp.com/', CHROME, HOST)).toBe('whatsapp')
    expect(detectSource('', 'https://t.co/abc', CHROME, HOST)).toBe('x')
    expect(detectSource('', 'https://un-blog.com/post', CHROME, HOST)).toBe('otra web')
  })

  it('sin pistas, o desde la propia web, es "directo"', () => {
    expect(detectSource('', '', CHROME, HOST)).toBe('directo')
    expect(detectSource('', `https://${HOST}/Citora/crear`, CHROME, HOST)).toBe('directo')
  })
})

describe('robots', () => {
  it('no cuenta robots ni vistas previas de enlaces', () => {
    expect(isBot('Googlebot/2.1', false)).toBe(true)
    expect(isBot('facebookexternalhit/1.1', false)).toBe(true)
    expect(isBot('WhatsApp/2.23.20 A', false)).toBe(true)
    expect(isBot(CHROME, true)).toBe(true)
  })

  it('sí cuenta a una persona, también dentro de Instagram o WhatsApp', () => {
    expect(isBot(CHROME, false)).toBe(false)
    expect(isBot(CHROME + ' Instagram 300.0', false)).toBe(false)
  })
})
