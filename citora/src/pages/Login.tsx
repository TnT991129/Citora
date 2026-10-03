import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Alert, Button, CitoraLogo, Field } from '../components/ui'
import { useSession } from '../lib/auth'
import { setBrandColor } from '../lib/brand'
import { errorMessage } from '../lib/errors'
import { supabase } from '../lib/supabase'

export default function Login() {
  const session = useSession()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  useEffect(() => {
    setBrandColor(null)
    document.title = 'Entrar · Citora'
  }, [])

  // Con sesión: el administrador va a su panel, el dueño al suyo
  useEffect(() => {
    if (!session) return
    supabase.rpc('is_platform_admin').then(({ data }) => navigate(data ? '/admin' : '/panel', { replace: true }))
  }, [session, navigate])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setError(errorMessage(error))
  }

  const forgot = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Escribe tu correo arriba y vuelve a pulsar.')
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}restablecer`,
    })
    setBusy(false)
    if (error) setError(errorMessage(error))
    else setInfo('Te enviamos un correo con un enlace para crear una contraseña nueva.')
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Link to="/"><CitoraLogo className="text-2xl" /></Link>
      <form onSubmit={submit} className="card mt-6 w-full max-w-sm space-y-4">
        <h1 className="text-xl font-bold">Entrar a tu panel</h1>
        <Field label="Correo electrónico">
          <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Contraseña">
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        {error && <Alert>{error}</Alert>}
        {info && <Alert kind="success">{info}</Alert>}
        <Button type="submit" block loading={busy}>Entrar</Button>
        <button type="button" onClick={forgot} className="w-full text-center text-sm font-medium text-slate-500 hover:text-slate-700">
          Olvidé mi contraseña
        </button>
      </form>
      <p className="mt-6 text-sm text-slate-600">
        ¿No tienes app todavía? <Link to="/crear" className="font-semibold text-brand">Créala gratis</Link>
      </p>
    </div>
  )
}
