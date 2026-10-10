import { useEffect, useState } from 'react'
import { COLOR_GROUPS, isLightColor } from '../lib/brand'

/** Paleta por familias + color libre. Avisa si el texto blanco no se leería sobre el color. */
export function ColorPicker({ value, onChange, size = 36 }: { value: string; onChange: (hex: string) => void; size?: number }) {
  const [hex, setHex] = useState(value)
  useEffect(() => setHex(value), [value])
  const known = COLOR_GROUPS.some((g) => g.colors.includes(value.toLowerCase()))

  return (
    <div className="space-y-3">
      {COLOR_GROUPS.map((g) => (
        <div key={g.name}>
          <p className="mb-1 text-xs font-medium text-slate-500">{g.name}</p>
          <div className="flex flex-wrap gap-2">
            {g.colors.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onChange(c)}
                className={`rounded-full transition ${value.toLowerCase() === c ? 'ring-4 ring-offset-2' : 'hover:scale-110'}`}
                style={{ background: c, width: size, height: size, ['--tw-ring-color' as string]: c }}
                aria-label={`Color ${c}`}
                aria-pressed={value.toLowerCase() === c}
              />
            ))}
          </div>
        </div>
      ))}

      <div className="flex items-center gap-3">
        <label
          className={`relative flex shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full ring-1 ring-slate-300 ${!known ? 'ring-4 ring-offset-2' : ''}`}
          style={{ width: size, height: size, background: known ? 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' : value, ['--tw-ring-color' as string]: value }}
          title="Elegir cualquier color"
        >
          <input type="color" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Elegir cualquier color" />
        </label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">Otro:</span>
          <input
            className="input w-28 py-1.5 font-mono text-sm uppercase"
            value={hex}
            maxLength={7}
            onChange={(e) => {
              const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`
              setHex(v)
              if (/^#[0-9a-f]{6}$/i.test(v)) onChange(v.toLowerCase())
            }}
            aria-label="Código del color"
          />
        </div>
      </div>
      {isLightColor(value) && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Este color es muy claro: el texto blanco de los botones casi no se leerá. Elige uno más oscuro.
        </p>
      )}
    </div>
  )
}
