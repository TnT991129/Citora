import { describe, expect, it } from 'vitest'
import { waLink } from '../../lib/whatsapp'
import { parseWaLink } from './WaBusiness'

describe('dos WhatsApp: copiar número y mensaje', () => {
  it('saca el número y el mensaje del enlace de WhatsApp', () => {
    expect(parseWaLink(waLink('+53 5 555-1234', 'Hola, ¿qué tal?\nTe espero'))).toEqual({ phone: '5355551234', text: 'Hola, ¿qué tal?\nTe espero' })
  })
  it('no toca los enlaces sin número ni otros enlaces', () => {
    expect(parseWaLink('https://wa.me/?text=Hola')).toBeNull()
    expect(parseWaLink('https://citora-app.com/x')).toBeNull()
  })
})
