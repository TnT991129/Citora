import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthShell } from '../components/AuthShell'
import { Alert, Button, Field } from '../components/ui'
import { setBrandColor } from '../lib/brand'
import { errorMessage } from '../lib/errors'
import { supabase } from '../lib/supabase'
import { t } from '../lib/i18n'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setBrandColor(null), [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < 6) return setError(t('Mínimo 6 caracteres.'))
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) setError(errorMessage(error))
    else navigate('/panel', { replace: true })
  }

  return (
    <AuthShell title={t('Nueva contraseña')} subtitle={t('Elige una contraseña nueva para entrar a tu panel.')}>
      <form onSubmit={submit} className="card space-y-4">
        <Field label={t('Contraseña nueva')} hint={t('Mínimo 6 caracteres.')}>
          <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" block size="lg" loading={busy}>{t('Guardar y entrar')}</Button>
      </form>
    </AuthShell>
  )
}
