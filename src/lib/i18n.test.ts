import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EN } from './i18n.en'

/** Todos los archivos .ts/.tsx de src */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    // i18n.ts se salta: sus comentarios traen ejemplos de t()
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) && !/\.test\./.test(f) && f !== 'i18n.ts' ? [p] : []
  })
}

/** Textos que se pasan a t() y tn() en el código */
function keys(): Set<string> {
  const out = new Set<string>()
  const str = String.raw`'((?:[^'\\]|\\.)*)'`
  const tRe = new RegExp(String.raw`\bt\(\s*` + str, 'g')
  const tnRe = new RegExp(String.raw`\btn\([^,]+,\s*` + str + String.raw`\s*,\s*` + str, 'g')
  const unescape = (s: string) => s.replace(/\\'/g, "'").replace(/\\\\/g, '\\')
  for (const f of files(join(__dirname, '..'))) {
    const src = readFileSync(f, 'utf8')
    for (const m of src.matchAll(tRe)) out.add(unescape(m[1]))
    for (const m of src.matchAll(tnRe)) {
      out.add(unescape(m[1]))
      out.add(unescape(m[2]))
    }
  }
  return out
}

describe('traducción al inglés', () => {
  it('todos los textos que pasan por t() tienen su traducción', () => {
    const missing = [...keys()].filter((k) => !(k in EN))
    expect(missing).toEqual([])
  })
  it('las traducciones conservan los mismos {datos}', () => {
    const vars = (s: string) => (s.match(/\{\w+\}/g) || []).sort().join(',')
    const wrong = Object.entries(EN).filter(([es, en]) => vars(es) !== vars(en)).map(([es]) => es)
    expect(wrong).toEqual([])
  })
})
