import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ColorPicker } from '../../components/ColorPicker'
import { Alert, Button, Field, Toggle, flash } from '../../components/ui'
import { GRADIENT_PRESETS } from '../../lib/brand'
import { BUTTON_SHAPES, FONTS, GRADIENT_ANGLES, PAGE_BACKGROUNDS, gradientCss, loadFont, pageBackground, shows, type Appearance as Look, type ButtonShape, type FontKey } from '../../lib/appearance'
import { errorMessage } from '../../lib/errors'
import { imageExt, shrinkImage } from '../../lib/image'
import { supabase } from '../../lib/supabase'
import { publicUrl } from '../../lib/url'
import { Announcement, BusinessHero } from '../public/shared'
import { usePanel } from './context'

/** Personalización de la web del negocio, con vista previa en vivo */
export default function Appearance() {
  const { business, reloadBusiness, link } = usePanel()
  const [look, setLook] = useState<Look>(business.appearance || {})
  const [color, setColor] = useState(business.color_primary)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const set = (patch: Partial<Look>) => setLook((l) => ({ ...l, ...patch }))
  const font: FontKey = look.font || 'inter'
  const buttons: ButtonShape = look.buttons || 'rounded'


  // Descarga todas las letras para que se vean en los botones de elección
  useEffect(() => {
    ;(Object.keys(FONTS) as FontKey[]).forEach(loadFont)
  }, [])

  const save = async () => {
    setBusy(true)
    setError(null)
    const { data, error } = await supabase
      .from('businesses')
      .update({ appearance: look, color_primary: color })
      .eq('id', business.id)
      .select('appearance, color_primary')
      .single()
    setBusy(false)
    if (error) return setError(errorMessage(error))
    // El servidor devuelve la versión limpia: el formulario queda igual a lo guardado
    const saved = data as { appearance: Look; color_primary: string }
    setLook(saved.appearance || {})
    setColor(saved.color_primary)
    flash('Apariencia guardada')
    reloadBusiness()
  }

  const uploadCover = async (file: File) => {
    setUploading(true)
    setError(null)
    try {
      const blob = await shrinkImage(file, 1600)
      const path = `${business.id}/cover-${Date.now()}.${imageExt(blob)}`
      const { error: upErr } = await supabase.storage.from('logos').upload(path, blob, { contentType: blob.type })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('logos').getPublicUrl(path)
      // La foto queda puesta como fondo de la portada ya mismo (sin tocar lo demás que estés editando)
      const { error } = await supabase
        .from('businesses')
        .update({ cover_url: data.publicUrl, appearance: { ...(business.appearance || {}), cover_style: 'image' } })
        .eq('id', business.id)
      if (error) throw error
      set({ cover_style: 'image' })
      flash('Portada actualizada')
      reloadBusiness()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setUploading(false)
    }
  }

  const removeCover = async () => {
    await supabase.from('businesses').update({ cover_url: null }).eq('id', business.id)
    reloadBusiness()
  }

  const previewStyle = {
    fontFamily: FONTS[font].family,
    '--btn-radius': BUTTON_SHAPES[buttons].radius,
    '--brand-rgb': hexToRgb(color),
    '--btn-gradient': (look.gradient_buttons && gradientCss(look)) || 'none',
    background: pageBackground(look) || '#f8fafc',
  } as CSSProperties
  const changed = color !== business.color_primary || JSON.stringify(look) !== JSON.stringify(business.appearance || {})
  const coverValue = business.cover_url && (look.cover_style === 'image' || !look.cover_style)
    ? 'image' : look.cover_style === 'gradient' && look.color2 ? 'gradient' : 'color'
  const coverOptions = [
    ...(business.cover_url ? [{ value: 'image', label: 'Mi foto' }] : []),
    { value: 'color', label: 'Mi color' },
    ...(look.color2 ? [{ value: 'gradient', label: 'Degradado' }] : []),
  ]

  return (
    <div className="space-y-5 pb-24">
      <div>
        <h1 className="text-2xl font-extrabold">Apariencia</h1>
        <p className="text-slate-600">
          Cómo se ve tu web para tus clientes. El color, el logo y la descripción están en <Link to={link('ajustes')} className="font-semibold text-brand">Ajustes</Link>.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-[1fr_320px] md:items-start">
        <div className="space-y-5">
          <Section title="Colores" hint="El color principal se usa en botones, portada y detalles de tu web.">
            <ColorPicker value={color} onChange={setColor} />
          </Section>

          <Section title="Degradado" hint="Mezcla tu color con un segundo color. Se puede usar en la portada y en los botones.">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {GRADIENT_PRESETS.map(([name, c1, c2]) => {
                const on = color === c1 && look.color2 === c2
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => {
                      setColor(c1)
                      set({ color2: c2, cover_style: coverValue === 'image' ? 'image' : 'gradient' })
                    }}
                    className={`overflow-hidden rounded-xl text-left text-xs font-semibold ${on ? 'ring-2 ring-slate-900' : 'ring-1 ring-slate-200'}`}
                  >
                    <span className="block h-10" style={{ backgroundImage: `linear-gradient(${look.gradient_angle || 135}deg, ${c1}, ${c2})` }} />
                    <span className="block bg-white px-2 py-1">{name}</span>
                  </button>
                )
              })}
            </div>
            {look.color2 ? (
              <div className="space-y-4 border-t border-slate-100 pt-3">
                <div>
                  <p className="mb-2 text-sm font-medium text-slate-700">Segundo color</p>
                  <ColorPicker value={look.color2} onChange={(c) => set({ color2: c })} size={30} />
                </div>
                <div>
                  <p className="mb-1 text-sm font-medium text-slate-700">Dirección</p>
                  <div className="flex gap-2">
                    {GRADIENT_ANGLES.map((g) => (
                      <button
                        key={g.value}
                        type="button"
                        onClick={() => set({ gradient_angle: g.value })}
                        className={`h-11 w-11 rounded-xl text-lg font-bold text-white ${(look.gradient_angle || 135) === g.value ? 'ring-2 ring-slate-900 ring-offset-2' : ''}`}
                        style={{ backgroundImage: `linear-gradient(${g.value}deg, ${color}, ${look.color2})` }}
                        aria-label={`Dirección ${g.label}`}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                </div>
                <ToggleRow checked={Boolean(look.gradient_buttons)} onChange={(v) => set({ gradient_buttons: v })} label="Botones con degradado" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => set({ color2: undefined, gradient_buttons: false, cover_style: look.cover_style === 'gradient' ? 'color' : look.cover_style })}
                >
                  Quitar degradado
                </Button>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Elige una combinación para empezar. Después puedes cambiar cada color.</p>
            )}
          </Section>

          <Section title="Fondo de la página">
            <Choices
              value={look.page_bg || 'gray'}
              onChange={(v) => set({ page_bg: v as Look['page_bg'] })}
              options={(Object.keys(PAGE_BACKGROUNDS) as (keyof typeof PAGE_BACKGROUNDS)[]).map((k) => ({ value: k, label: PAGE_BACKGROUNDS[k] }))}
            />
          </Section>

          <Section title="Portada" hint="Una foto de tu local o de tu trabajo, en horizontal. Se oscurece un poco para que el nombre se lea bien.">
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} loading={uploading}>
                {business.cover_url ? 'Cambiar foto' : 'Subir foto de portada'}
              </Button>
              {business.cover_url && <Button variant="ghost" size="sm" onClick={removeCover}>Quitar foto</Button>}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) uploadCover(f)
                e.target.value = ''
              }}
            />
            {coverOptions.length > 1 && (
              <div>
                <p className="mb-1 text-sm font-medium text-slate-700">Fondo de la portada</p>
                <Choices value={coverValue} onChange={(v) => set({ cover_style: v as Look['cover_style'] })} options={coverOptions} />
              </div>
            )}
          </Section>

          <Section title="Tipo de letra">
            <div className="grid gap-2 sm:grid-cols-2">
              {(Object.keys(FONTS) as FontKey[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => set({ font: k })}
                  className={`rounded-xl p-3 text-left transition ${font === k ? 'bg-brand/10 ring-2 ring-brand' : 'bg-white ring-1 ring-slate-200 hover:ring-slate-300'}`}
                  style={{ fontFamily: FONTS[k].family }}
                >
                  <span className="block text-lg font-bold">{FONTS[k].name}</span>
                  <span className="block text-sm text-slate-500">{FONTS[k].style}</span>
                </button>
              ))}
            </div>
          </Section>

          <Section title="Forma de los botones">
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(BUTTON_SHAPES) as ButtonShape[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => set({ buttons: k })}
                  className={`flex flex-col items-center gap-2 rounded-xl p-3 text-sm font-semibold ${buttons === k ? 'bg-brand/10 ring-2 ring-brand' : 'bg-white ring-1 ring-slate-200'}`}
                >
                  <span className="block h-7 w-full bg-brand" style={{ borderRadius: BUTTON_SHAPES[k].radius }} />
                  {BUTTON_SHAPES[k].name}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Textos">
            <Field label="Frase bajo el nombre" hint="Corta. Ej. «Barbería clásica desde 2015».">
              <input className="input" maxLength={80} value={look.tagline || ''} onChange={(e) => set({ tagline: e.target.value })} />
            </Field>
            <Field label="Aviso destacado" hint="Sale arriba de todo. Déjalo vacío para quitarlo. Ej. «Esta semana 20% en tintes».">
              <input className="input" maxLength={160} value={look.announcement || ''} onChange={(e) => set({ announcement: e.target.value })} />
            </Field>
            <Field label="Texto del botón de reservar" hint="Por defecto: «Reservar cita».">
              <input className="input" maxLength={30} value={look.book_label || ''} placeholder="Reservar cita" onChange={(e) => set({ book_label: e.target.value })} />
            </Field>
            <Field label="Mensaje después de reservar" hint="Lo ve el cliente al terminar su reserva. Ej. «¡Gracias! Te esperamos con un café».">
              <textarea className="input min-h-[70px]" maxLength={300} value={look.thanks_message || ''} onChange={(e) => set({ thanks_message: e.target.value })} />
            </Field>
          </Section>

          <Section title="Redes y ubicación" hint="Salen como botones en tu portada.">
            <Field label="Instagram"><AtInput value={look.instagram} onChange={(v) => set({ instagram: v })} placeholder="tu_negocio" /></Field>
            <Field label="Facebook"><AtInput value={look.facebook} onChange={(v) => set({ facebook: v })} placeholder="tu.negocio" /></Field>
            <Field label="TikTok"><AtInput value={look.tiktok} onChange={(v) => set({ tiktok: v })} placeholder="tu_negocio" /></Field>
            <Field label="Enlace de Google Maps" hint="En Google Maps: busca tu local → Compartir → Copiar enlace.">
              <input className="input" type="url" inputMode="url" value={look.maps_url || ''} placeholder="https://maps.app.goo.gl/…" onChange={(e) => set({ maps_url: e.target.value.trim() })} />
            </Field>
            {look.maps_url && !look.maps_url.startsWith('https://') && <Alert kind="warning">El enlace debe empezar por https://</Alert>}
          </Section>

          <Section title="Qué mostrar en tu web">
            <div className="space-y-3">
              <ToggleRow checked={shows(look, 'show_prices')} onChange={(v) => set({ show_prices: v })} label="Precios de los servicios" />
              <ToggleRow checked={shows(look, 'show_durations')} onChange={(v) => set({ show_durations: v })} label="Duración de los servicios" />
              <ToggleRow checked={shows(look, 'show_hours')} onChange={(v) => set({ show_hours: v })} label="Días que abres" />
              <ToggleRow checked={shows(look, 'show_gallery')} onChange={(v) => set({ show_gallery: v })} label="Galería de trabajos" />
              <ToggleRow checked={shows(look, 'show_reviews')} onChange={(v) => set({ show_reviews: v })} label="Opiniones y estrellas" />
            </div>
            {!shows(look, 'show_prices') && <p className="text-sm text-slate-500">El precio sí se muestra al cliente al confirmar su reserva.</p>}
          </Section>
        </div>

        {/* Vista previa */}
        <div className="md:sticky md:top-20">
          <p className="mb-2 text-sm font-semibold text-slate-500">Vista previa</p>
          <div className="overflow-hidden rounded-3xl shadow-lg ring-1 ring-slate-200" style={previewStyle}>
            <BusinessHero preview business={{ ...business, appearance: look }} />
            <div className="space-y-3 p-3">
              <Announcement text={look.announcement} />
              <div className="rounded-xl bg-white p-3 text-sm shadow-sm ring-1 ring-slate-200">
                <p className="font-bold">Servicios</p>
                <div className="mt-1 flex justify-between">
                  <span>
                    Servicio de ejemplo
                    {shows(look, 'show_durations') && <span className="block text-xs text-slate-500">45 min</span>}
                  </span>
                  {shows(look, 'show_prices') && <span className="font-semibold">500 {business.currency}</span>}
                </div>
              </div>
              <div className="rounded-btn bg-brand bg-btn-grad py-3 text-center font-bold text-white">{look.book_label || 'Reservar cita'}</div>
            </div>
          </div>
          <a href={publicUrl(business.slug)} target="_blank" rel="noreferrer" className="mt-3 block text-center text-sm font-semibold text-brand">
            Ver mi web de verdad →
          </a>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-16 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:bottom-0">
        {error && <div className="mx-auto mb-2 max-w-4xl"><Alert>{error}</Alert></div>}
        <div className="mx-auto flex max-w-4xl items-center justify-end gap-3">
          {changed && <span className="text-sm text-slate-500">Tienes cambios sin guardar</span>}
          <Button onClick={save} loading={busy} disabled={!changed}>Guardar apariencia</Button>
        </div>
      </div>
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="card space-y-3">
      <div>
        <h2 className="font-bold">{title}</h2>
        {hint && <p className="text-sm text-slate-500">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

function Choices({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-full px-3 py-1.5 text-sm font-semibold ${value === o.value ? 'bg-brand text-white' : 'bg-white ring-1 ring-slate-300'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Campo de usuario de red social: escribe el nombre sin la @ ni el enlace */
function AtInput({ value, onChange, placeholder }: { value?: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="flex items-center overflow-hidden rounded-xl border border-slate-300 bg-white focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
      <span className="pl-3.5 text-slate-400">@</span>
      <input
        className="w-full bg-transparent px-1.5 py-2.5 text-base outline-none"
        value={value || ''}
        placeholder={placeholder}
        maxLength={50}
        onChange={(e) =>
          onChange(
            e.target.value
              .trim()
              .replace(/^https?:\/\/(www\.)?(instagram|facebook|tiktok)\.com\/@?/i, '')
              .replace(/^@/, '')
              .replace(/[/?#].*$/, ''),
          )
        }
      />
    </div>
  )
}

function ToggleRow({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-700">{label}</span>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </div>
  )
}

/** "#5243e5" → "82 67 229" (formato de la variable --brand-rgb) */
function hexToRgb(hex: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  return m ? `${parseInt(m[1], 16)} ${parseInt(m[2], 16)} ${parseInt(m[3], 16)}` : '82 67 229'
}
