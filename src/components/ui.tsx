import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'whatsapp'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:brightness-110 shadow-sm',
  secondary: 'bg-white text-slate-800 border border-slate-300 hover:bg-slate-50',
  ghost: 'text-slate-700 hover:bg-slate-100',
  danger: 'bg-white text-red-600 border border-red-200 hover:bg-red-50',
  whatsapp: 'bg-[#25D366] text-white hover:brightness-105 shadow-sm',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  loading?: boolean
  block?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export function Button({ variant = 'primary', loading, block, size = 'md', className = '', children, disabled, ...rest }: ButtonProps) {
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2.5 text-[15px]', lg: 'px-5 py-3.5 text-base' }
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-btn font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${sizes[size]} ${VARIANTS[variant]} ${block ? 'w-full' : ''} ${className}`}
    >
      {loading && <Spinner small />}
      {children}
    </button>
  )
}

export function LinkButton({ href, variant = 'primary', block, size = 'md', className = '', children, newTab }: {
  href: string
  variant?: Variant
  block?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
  children: ReactNode
  newTab?: boolean
}) {
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2.5 text-[15px]', lg: 'px-5 py-3.5 text-base' }
  return (
    <a
      href={href}
      target={newTab ? '_blank' : undefined}
      rel={newTab ? 'noopener noreferrer' : undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-btn font-semibold transition active:scale-[0.98] ${sizes[size]} ${VARIANTS[variant]} ${block ? 'w-full' : ''} ${className}`}
    >
      {children}
    </a>
  )
}

export function Spinner({ small }: { small?: boolean }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${small ? 'h-4 w-4' : 'h-6 w-6'}`}
      aria-label="Cargando"
    />
  )
}

export function PageLoader({ text = 'Cargando…' }: { text?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-slate-500">
      <Spinner />
      <span className="text-sm">{text}</span>
    </div>
  )
}

export function Field({ label, hint, children, error }: { label: string; hint?: ReactNode; children: ReactNode; error?: string | null }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs font-medium text-red-600">{error}</span>}
    </label>
  )
}

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'success' | 'info' | 'warning'; children: ReactNode }) {
  const styles = {
    error: 'bg-red-50 text-red-800 border-red-200',
    success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    info: 'bg-sky-50 text-sky-800 border-sky-200',
    warning: 'bg-amber-50 text-amber-900 border-amber-200',
  }
  return <div className={`rounded-xl border px-3.5 py-2.5 text-sm ${styles[kind]}`}>{children}</div>
}

export function Modal({ open, onClose, title, children, footer }: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-white shadow-xl sm:max-w-lg sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Cerrar">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="safe-bottom border-t border-slate-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-4 py-8 text-center">
      <p className="font-semibold text-slate-700">{title}</p>
      {children && <div className="mt-1 text-sm text-slate-500">{children}</div>}
    </div>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition ${checked ? 'bg-brand' : 'bg-slate-300'}`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )
}

export function CopyButton({ text, label = 'Copiar' }: { text: string; label?: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      flash('Copiado')
    } catch {
      flash('No se pudo copiar')
    }
  }
  return (
    <Button type="button" variant="secondary" size="sm" onClick={copy}>
      {label}
    </Button>
  )
}

// Aviso breve en pantalla (sin librerías)
export function flash(text: string) {
  const el = document.createElement('div')
  el.textContent = text
  el.className =
    'fixed left-1/2 top-4 z-[100] -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg transition-opacity'
  document.body.appendChild(el)
  setTimeout(() => (el.style.opacity = '0'), 1600)
  setTimeout(() => el.remove(), 2000)
}

export function BusinessAvatar({ name, logo, size = 56, inverted }: { name: string; logo?: string | null; size?: number; inverted?: boolean }) {
  if (logo) {
    return <img src={logo} alt={name} width={size} height={size} className={`rounded-2xl bg-white object-cover shadow-sm ${inverted ? 'ring-4 ring-white/30' : ''}`} style={{ width: size, height: size }} />
  }
  return (
    <div
      className={`flex items-center justify-center rounded-2xl font-bold shadow-sm ${inverted ? 'bg-white text-brand ring-4 ring-white/30' : 'bg-brand text-white'}`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {name.trim().charAt(0).toUpperCase() || '·'}
    </div>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    pendiente: ['Pendiente', 'bg-amber-100 text-amber-800'],
    confirmada: ['Confirmada', 'bg-sky-100 text-sky-800'],
    completada: ['Completada', 'bg-emerald-100 text-emerald-800'],
    no_asistio: ['No asistió', 'bg-slate-200 text-slate-700'],
    cancelada: ['Cancelada', 'bg-red-100 text-red-700'],
    prueba: ['En prueba', 'bg-violet-100 text-violet-800'],
    activo: ['Activo', 'bg-emerald-100 text-emerald-800'],
    vencido: ['Vencido', 'bg-red-100 text-red-700'],
  }
  const [label, cls] = map[status] || [status, 'bg-slate-100 text-slate-700']
  return <span className={`chip ${cls}`}>{label}</span>
}

export function CitoraLogo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-extrabold tracking-tight ${className}`}>
      <svg viewBox="0 0 64 64" className="h-7 w-7" aria-hidden="true">
        <rect width="64" height="64" rx="16" fill="#5243e5" />
        <circle cx="32" cy="32" r="17" fill="none" stroke="#fff" strokeWidth="5" />
        <path d="M32 22v10l7 5" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>Citora</span>
    </span>
  )
}

export function WhatsAppIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.8.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3 2.4 1 2.9.8 3.4.7.5-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3zM12 21.8c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4c-1-1.6-1.5-3.4-1.5-5.2C2.2 6.6 6.6 2.2 12 2.2c2.6 0 5.1 1 6.9 2.9 1.8 1.8 2.9 4.3 2.9 6.9 0 5.4-4.4 9.8-9.8 9.8zm8.3-18.1C18.1 1.5 15.1.3 12 .3 5.5.3.3 5.5.3 12c0 2.1.5 4.1 1.6 5.9L.2 23.8l6-1.6c1.7.9 3.7 1.4 5.7 1.4 6.4 0 11.7-5.2 11.7-11.7 0-3.1-1.2-6.1-3.4-8.3z" />
    </svg>
  )
}
