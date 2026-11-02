import { describe, expect, it } from 'vitest'
import { errorMessage } from './errors'

describe('mensajes de error', () => {
  it('no confunde un código con otro que lo contiene', () => {
    expect(errorMessage({ message: 'OPINION_FUERA_DE_PLAZO' })).toBe('Ya pasó el plazo para opinar sobre esta cita.')
    expect(errorMessage({ message: 'FUERA_DE_PLAZO' })).toMatch(/Ya no se puede cambiar ni cancelar/)
    expect(errorMessage({ message: 'ENLACE_NO_DISPONIBLE' })).toMatch(/enlace ya está en uso/)
    expect(errorMessage({ message: 'NO_DISPONIBLE' })).toBe('Tu plan actual no incluye esta función.')
    expect(errorMessage({ message: 'ENCUESTA_SIN_DESTINO' })).toBe('Elige al menos un negocio para la encuesta.')
  })

  it('deja pasar los mensajes que no conoce', () => {
    expect(errorMessage('algo raro')).toBe('algo raro')
    expect(errorMessage({ message: 'Failed to fetch' })).toMatch(/Sin conexión/)
  })
})
