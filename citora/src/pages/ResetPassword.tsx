import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Alert, Button, CitoraLogo, Field } from '../components/ui'
import { setBrandColor } from '../lib/brand'
import { errorMessage } from '../lib/errors'
import { supabase } from '../lib/supabase'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setBrandColor(null), [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < 6) return setError('Mínimo 6 caracteres.')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) setError(errorMessage(error))
    else navigate('/panel', { replace: true })
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Link to="/"><CitoraLogo className="text-2xl" /></Link>
      <form onSubmit={submit} className="card mt-6 w-full max-w-sm space-y-4">
        <h1 className="text-xl font-bold">Nueva contraseña</h1>
        <Field label="Contraseña nueva" hint="Mínimo 6 caracteres.">
          <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" block loading={busy}>Guardar y entrar</Button>
      </form>
    </div>
  )
}
