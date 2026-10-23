// Genera un par de claves VAPID para las notificaciones push (Web Push). No necesita ninguna
// cuenta ni conexión a internet: es solo criptografía local. Ejecuta: node scripts/generate-vapid-keys.mjs
import { generateKeyPairSync } from 'node:crypto'

function b64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const pubJwk = publicKey.export({ format: 'jwk' })
const privJwk = privateKey.export({ format: 'jwk' })

const x = Buffer.from(pubJwk.x, 'base64url')
const y = Buffer.from(pubJwk.y, 'base64url')
const d = Buffer.from(privJwk.d, 'base64url')
const publicKeyRaw = b64url(Buffer.concat([Buffer.from([0x04]), x, y]))
const privateKeyRaw = b64url(d)

console.log('Clave pública VAPID (va en el frontend y también en la función):')
console.log('  ' + publicKeyRaw)
console.log('')
console.log('Clave privada VAPID (va SOLO en los secretos de la función, nunca en el frontend):')
console.log('  ' + privateKeyRaw)
console.log('')
console.log('Guárdalas así:')
console.log('  - GitHub Secrets: VITE_VAPID_PUBLIC_KEY = ' + publicKeyRaw)
console.log('  - Supabase (supabase secrets set):')
console.log('      VAPID_PUBLIC_KEY=' + publicKeyRaw)
console.log('      VAPID_PRIVATE_KEY=' + privateKeyRaw)
