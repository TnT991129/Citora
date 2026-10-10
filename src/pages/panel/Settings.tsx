import { Link } from 'react-router-dom'
import { useRef, useState } from 'react'
import { Alert, BusinessAvatar, Button, Field, flash } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { slugify } from '../../lib/format'
import { imageExt, resizeImage } from '../../lib/image'
import { supabase } from '../../lib/supabase'
import { BUSINESS_TYPES } from '../../lib/templates'
import { panelUrl, publicUrl } from '../../lib/url'
import { usePanel } from './context'

export default function Settings() {
  const { business, reloadBusiness, slugChanged, link } = usePanel()
  const [form, setForm] = useState({
    name: business.name,
    slug: business.slug,
    business_type: business.business_type,
    whatsapp: business.whatsapp,
    address: business.address || '',
    description: business.description || '',
    policies: business.policies || '',
  })
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))

  const save = async () => {
    if (form.name.trim().length < 2) return setError('Escribe el nombre del negocio.')
    setBusy(true)
    setError(null)
    if (form.slug !== business.slug) {
      const { data: ok } = await supabase.rpc('check_slug_available', { p_slug: form.slug })
      if (!ok) {
        setBusy(false)
        return setError('Ese enlace ya está en uso o no es válido.')
      }
    }
    const { error } = await supabase.from('businesses').update({
      name: form.name.trim(),
      slug: form.slug,
      business_type: form.business_type,
      whatsapp: form.whatsapp.replace(/\D/g, ''),
      address: form.address.trim() || null,
      description: form.description.trim() || null,
      policies: form.policies.trim() || null,
    }).eq('id', business.id)
    setBusy(false)
    if (error) return setError(errorMessage(error))
    flash('Guardado')
    if (form.slug !== business.slug) slugChanged(form.slug)
    reloadBusiness()
  }

  const uploadLogo = async (file: File) => {
    setUploading(true)
    setError(null)
    try {
      const blob = await resizeImage(file, 320)
      const path = `${business.id}/logo-${Date.now()}.${imageExt(blob)}`
      const { error: upErr } = await supabase.storage.from('logos').upload(path, blob, { contentType: blob.type })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('logos').getPublicUrl(path)
      const { error } = await supabase.from('businesses').update({ logo_url: data.publicUrl }).eq('id', business.id)
      if (error) throw error
      flash('Logo actualizado')
      reloadBusiness()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setUploading(false)
    }
  }

  const removeLogo = async () => {
    await supabase.from('businesses').update({ logo_url: null }).eq('id', business.id)
    reloadBusiness()
  }

  return (
    <div className="space-y-5 pb-10">
      <h1 className="text-2xl font-extrabold">Ajustes</h1>

      <section className="card space-y-4">
        <h2 className="font-bold">Logo</h2>
        <div className="flex items-center gap-4">
          <BusinessAvatar name={form.name} logo={business.logo_url} size={72} />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} loading={uploading}>
              {business.logo_url ? 'Cambiar logo' : 'Subir logo'}
            </Button>
            {business.logo_url && <Button variant="ghost" size="sm" onClick={removeLogo}>Quitar</Button>}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) uploadLogo(f)
              e.target.value = ''
            }}
          />
        </div>
        <p className="text-xs text-slate-500">Se reduce en tu móvil antes de subirse, para gastar pocos datos.</p>
      </section>

      <section className="card space-y-4">
        <h2 className="font-bold">Tu negocio</h2>
        <Field label="Nombre"><input className="input" value={form.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="Enlace" hint={<>Clientes: {publicUrl(form.slug).replace(/^https?:\/\//, '')}<br />Tu panel: {panelUrl(form.slug).replace(/^https?:\/\//, '')}</>}>
          <input className="input" value={form.slug} maxLength={40} onChange={(e) => set({ slug: slugify(e.target.value) })} />
        </Field>
        {form.slug !== business.slug && (
          <Alert kind="warning">Si cambias el enlace, el anterior dejará de funcionar. Tendrás que compartir el nuevo.</Alert>
        )}
        <Field label="Tipo de negocio">
          <select className="input" value={form.business_type} onChange={(e) => set({ business_type: e.target.value })}>
            {BUSINESS_TYPES.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
          </select>
        </Field>
        <Field label="WhatsApp" hint="Con código de país, ej. 53 5555 5555.">
          <input className="input" type="tel" inputMode="tel" value={form.whatsapp} onChange={(e) => set({ whatsapp: e.target.value })} />
        </Field>
        <Field label="Dirección"><input className="input" value={form.address} maxLength={120} onChange={(e) => set({ address: e.target.value })} /></Field>
        <Field label="Descripción corta" hint="Aparece debajo del nombre en tu web.">
          <input className="input" value={form.description} maxLength={140} onChange={(e) => set({ description: e.target.value })} placeholder="Ej. Uñas con amor en el centro de Matanzas" />
        </Field>
        <p className="text-sm text-slate-500">
          El color, los degradados, la portada y la letra están en <Link to={link('apariencia')} className="font-semibold text-brand">Apariencia</Link>.
        </p>
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold">Políticas</h2>
        <p className="text-sm text-slate-500">Lo que tus clientes aceptan al reservar: puntualidad, cancelaciones, etc.</p>
        <textarea className="input min-h-[120px]" value={form.policies} maxLength={1500} onChange={(e) => set({ policies: e.target.value })} />
      </section>

      {error && <Alert>{error}</Alert>}
      <Button block size="lg" onClick={save} loading={busy}>Guardar cambios</Button>

      <section className="card">
        <h2 className="font-bold">Cuenta</h2>
        <p className="mt-1 text-sm text-slate-500">Código de tu negocio: <b>{business.code}</b> (úsalo al pagar).</p>
        <Button variant="secondary" className="mt-3" onClick={() => supabase.auth.signOut()}>Cerrar sesión</Button>
      </section>
    </div>
  )
}
