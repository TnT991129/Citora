import { useState } from 'react'
import { Alert, Button } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { dateKey, timeOf, todayKey } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import type { Appointment, Business, CustomerSummary, Service } from '../../lib/types'
import { usePanel } from './context'
import { Locked, useModule } from './Locked'

const STATUS: Record<string, string> = {
  pendiente: 'Pendiente', confirmada: 'Confirmada', completada: 'Completada', no_asistio: 'No vino', cancelada: 'Cancelada',
}

/** CSV con ";" y BOM: Excel en español lo abre bien, con acentos */
function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n')
}

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const num = (n: number | string | null | undefined) => String(Number(n ?? 0)).replace('.', ',')

async function allAppointments(): Promise<Appointment[]> {
  const out: Appointment[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('appointments')
      .select('*, appointment_services(name, price, duration_min)')
      .order('starts_at')
      .range(from, from + 999)
    if (error) throw error
    out.push(...((data as Appointment[]) || []))
    if (!data || data.length < 1000) return out
  }
}

function appointmentsCsv(list: Appointment[], b: Business): string {
  return toCsv([
    ['Fecha', 'Hora', 'Cliente', 'Teléfono', 'Servicios', 'Total', 'Descuento', 'Cupón', 'Estado', 'Origen', 'Nota del cliente', 'Nota interna', 'Reservada el'],
    ...list.map((a) => [
      dateKey(a.starts_at, b.timezone), timeOf(a.starts_at, b.timezone), a.customer_name, a.customer_phone,
      (a.appointment_services || []).map((s) => s.name).join(', '), num(a.total), num(a.discount), a.discount_code,
      STATUS[a.status] || a.status, a.source === 'web' ? 'Web' : 'Manual', a.customer_note, a.internal_note,
      dateKey(a.created_at, b.timezone),
    ]),
  ])
}

function customersCsv(list: Appointment[], notes: CustomerSummary[] | null, tz: string): string {
  // Se calcula desde las citas, así funciona aunque el plan no incluya la ficha de clientes
  const map = new Map<string, { name: string; visits: number; bookings: number; spent: number; first: string; last: string }>()
  const now = Date.now()
  for (const a of list) {
    if (!a.customer_phone) continue
    const c = map.get(a.customer_phone) || { name: a.customer_name, visits: 0, bookings: 0, spent: 0, first: a.starts_at, last: a.starts_at }
    c.name = a.customer_name
    if (a.status !== 'cancelada') c.bookings++
    const done = a.status === 'completada' || ((a.status === 'pendiente' || a.status === 'confirmada') && new Date(a.ends_at).getTime() < now)
    if (done) {
      c.visits++
      c.spent += Number(a.total)
    }
    if (a.starts_at < c.first) c.first = a.starts_at
    if (a.starts_at > c.last) c.last = a.starts_at
    map.set(a.customer_phone, c)
  }
  const extra = new Map((notes || []).map((n) => [n.phone, n]))
  return toCsv([
    ['Nombre', 'Teléfono', 'Visitas', 'Reservas', 'Gastado', 'Primera cita', 'Última cita', 'Etiquetas', 'Notas'],
    ...[...map.entries()].map(([phone, c]) => [
      c.name, phone, c.visits, c.bookings, num(c.spent), dateKey(c.first, tz), dateKey(c.last, tz),
      extra.get(phone)?.tags.join(', '), extra.get(phone)?.note,
    ]),
  ])
}

function servicesCsv(list: Service[]): string {
  return toCsv([
    ['Servicio', 'Descripción', 'Precio', 'Duración (min)', 'Activo'],
    ...list.map((s) => [s.name, s.description, num(s.price), s.duration_min, s.active ? 'Sí' : 'No']),
  ])
}

export default function Backup() {
  const allowed = useModule('respaldo')
  const hasCustomers = useModule('clientes')
  const { business, services } = usePanel()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  if (!allowed) return <Locked module="respaldo" />

  const stamp = `${business.slug}-${todayKey(business.timezone)}`

  const run = async (what: 'citas' | 'clientes' | 'servicios' | 'todo') => {
    setBusy(what)
    setError(null)
    setDone(null)
    try {
      const needAppts = what !== 'servicios'
      const appts = needAppts ? await allAppointments() : []
      let notes: CustomerSummary[] | null = null
      if ((what === 'clientes' || what === 'todo') && hasCustomers) {
        const { data } = await supabase.rpc('owner_customers')
        notes = (data as CustomerSummary[]) || null
      }
      if (what === 'citas' || what === 'todo') download(`citas-${stamp}.csv`, appointmentsCsv(appts, business))
      if (what === 'clientes' || what === 'todo') download(`clientes-${stamp}.csv`, customersCsv(appts, notes, business.timezone))
      if (what === 'servicios' || what === 'todo') download(`servicios-${stamp}.csv`, servicesCsv(services))
      setDone(what === 'todo' ? 'Se descargaron 3 archivos.' : 'Archivo descargado.')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="max-w-lg space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Respaldo</h1>
        <p className="text-slate-600">Descarga una copia de tus datos. Los archivos se abren con Excel o Google Sheets.</p>
      </div>
      <section className="card space-y-3">
        <Item title="Citas" desc="Todas tus citas, con servicios, importes y estado." onClick={() => run('citas')} loading={busy === 'citas'} />
        <Item title="Clientes" desc="Cada cliente con sus visitas y lo que ha gastado." onClick={() => run('clientes')} loading={busy === 'clientes'} />
        <Item title="Servicios" desc="Tu lista de servicios y precios." onClick={() => run('servicios')} loading={busy === 'servicios'} />
      </section>
      <Button block size="lg" onClick={() => run('todo')} loading={busy === 'todo'}>Descargar todo</Button>
      {done && <Alert kind="success">{done}</Alert>}
      {error && <Alert>{error}</Alert>}
      <p className="text-sm text-slate-500">Consejo: haz un respaldo una vez al mes y guárdalo en tu correo o en la nube.</p>
    </div>
  )
}

function Item({ title, desc, onClick, loading }: { title: string; desc: string; onClick: () => void; loading: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-slate-500">{desc}</p>
      </div>
      <Button size="sm" variant="secondary" onClick={onClick} loading={loading}>Descargar</Button>
    </div>
  )
}
