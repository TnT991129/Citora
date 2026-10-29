import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthShell } from '../components/AuthShell'
import { Alert, Button, Field } from '../components/ui'
import { useSession } from '../lib/auth'
import { setBrandColor } from '../lib/brand'
import { errorMessage } from '../lib/errors'
import { supabase } from '../lib/supabase'
import { panelPath } from '../lib/url'

export default function Login() {
  const session = useSession()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  // Página a la que volver después de entrar (solo rutas internas)
  const next = (params.get('next') || '').startsWith('/') && !(params.get('next') || '').startsWith('//') ? params.get('next') : null
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [justSignedIn, setJustSignedIn] = useState(false)

  useEffect(() => {
    setBrandColor(null)
    document.title = 'Entrar · Citora'
  }, [])

  // El administrador va a su panel; el dueño, al panel de su negocio
  const goToPanel = async () => {
    if (next) return navigate(next, { replace: true })
    const { data: isAdmin } = await supabase.rpc('is_platform_admin')
    if (isAdmin) return navigate('/admin', { replace: true })
    const { data: biz } = await supabase.from('businesses').select('slug').maybeSingle()
    navigate(biz ? panelPath((biz as { slug: string }).slug) : '/panel', { replace: true })
  }

  // Al entrar: el administrador va a su panel, el dueño al suyo
  useEffect(() => {
    if (session && justSignedIn) goToPanel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, justSignedIn])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setError(errorMessage(error))
    else setJustSignedIn(true)
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
    <AuthShell
      title={session && !justSignedIn ? 'Ya tienes la sesión abierta' : 'Bienvenido de nuevo'}
      subtitle={session && !justSignedIn ? undefined : 'Entra a tu panel para ver tu agenda.'}
      footer={<>¿No tienes app todavía? <Link to="/crear" className="font-semibold text-brand">Créala gratis</Link></>}
    >
      {session && !justSignedIn ? (
        <div className="card space-y-3 text-center">
          <p className="text-slate-600">Estás conectado como <b>{session.user.email}</b>.</p>
          <Button block onClick={goToPanel}>Ir a mi panel</Button>
          <Button block variant="secondary" onClick={() => supabase.auth.signOut()}>Entrar con otra cuenta</Button>
        </div>
      ) : (
      <form onSubmit={submit} className="card space-y-4">
        <Field label="Correo electrónico">
          <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Contraseña">
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        {error && <Alert>{error}</Alert>}
        {info && <Alert kind="success">{info}</Alert>}
        <Button type="submit" block size="lg" loading={busy}>Entrar</Button>
        <button type="button" onClick={forgot} className="w-full text-center text-sm font-medium text-slate-500 hover:text-slate-700">
          Olvidé mi contraseña
        </button>
      </form>
      )}
    </AuthShell>
  )
}
