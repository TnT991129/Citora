import { useEffect, useState } from 'react'
import { Alert, Button, flash } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { money } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import { usePanel } from './context'

/** Tasa del dólar del día, para los negocios con precios en USD y su cambio en CUP */
export function RateCard() {
  const { business, reloadBusiness } = usePanel()
  const [value, setValue] = useState(business.usd_rate ? String(business.usd_rate) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setValue(business.usd_rate ? String(business.usd_rate) : ''), [business.usd_rate])

  if (!business.usd_prices) return null

  const rate = Number(value)
  const changed = rate > 0 && rate !== Number(business.usd_rate)

  const save = async () => {
    if (!(rate > 0)) return setError('Escribe cuántos CUP vale 1 USD.')
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('businesses').update({ usd_rate: Math.round(rate * 100) / 100 }).eq('id', business.id)
    setBusy(false)
    if (error) return setError(errorMessage(error))
    flash('Tasa actualizada')
    reloadBusiness()
  }

  return (
    <section className="card space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-bold">Tasa del dólar</h2>
        {business.usd_rate && <span className="text-sm text-slate-500">Ahora: 1 USD = {money(business.usd_rate, 'CUP')}</span>}
      </div>
      <div className="flex items-center gap-2">
        <span className="shrink-0 font-semibold text-slate-600">1 USD =</span>
        <input
          className="input"
          type="number"
          min={1}
          step="any"
          inputMode="decimal"
          placeholder="Ej. 300"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && changed && save()}
          aria-label="CUP por 1 USD"
        />
        <span className="shrink-0 font-semibold text-slate-600">CUP</span>
        <Button size="sm" onClick={save} loading={busy} disabled={!changed}>Guardar</Button>
      </div>
      <p className="text-xs text-slate-500">Tus clientes ven tus precios en USD y su cambio en CUP con esta tasa. Las citas ya reservadas mantienen la suya.</p>
      {error && <Alert>{error}</Alert>}
    </section>
  )
}
