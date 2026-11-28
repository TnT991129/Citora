// Pestaña "Negocios" (antes "Dueños"): todos los dueños con su negocio, su estado, sus primeros
// pasos y sus reservas. Al tocar uno se abre su ficha con las acciones.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, CopyButton, LinkButton, PageLoader, WhatsAppIcon, flash } from '../../components/ui'
import { errorMessage } from '../../lib/errors'
import { fullDateFromIso, money } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import { tzLabel } from '../../lib/timezones'
import { publicUrl } from '../../lib/url'
import { waLink } from '../../lib/whatsapp'
import { Icon } from '../panel/Panel'
import {
  ADMIN_TZ, agoShort, hasBusiness, mergeRows, messageOptions, purgeAt, rowState, STEPS, stepsCount, stepsDone,
  stuckReason, trialLeft, trialUsed, type Activity, type AdminOwner, type AdminRow, type MessageKind, type OwnerWithBusiness,
} from './adminData'
import { BizAvatar, Drawer, FilterPills, PageTitle, StateCell, StateChip, StateDetail, StepsBar } from './adminUi'
import { planName } from '../../lib/plans'
import { ActivateModal, CONFIRM, ConfirmModal, DeleteModal, payCurrency, PickBusinessModal, planPrice, TempPasswordModal, TimezoneModal, type ConfirmKind, type Prices } from './OwnerModals'

export type BizFilter = 'todos' | 'prueba' | 'activo' | 'vencido' | 'atascados' | 'cortesia' | 'sin_negocio'
type Sort = 'recientes' | 'pago' | 'reservas'

const FILTERS: { key: BizFilter; label: string; test: (r: AdminRow) => boolean }[] = [
  { key: 'todos', label: 'Todos', test: () => true },
  { key: 'prueba', label: 'En prueba', test: (r) => rowState(r) === 'prueba' },
  { key: 'activo', label: 'Pagando', test: (r) => rowState(r) === 'activo' },
  { key: 'vencido', label: 'Vencidos', test: (r) => rowState(r) === 'vencido' },
  { key: 'atascados', label: 'Atascados', test: (r) => stuckReason(r) !== null },
  { key: 'cortesia', label: 'Cortesía', test: (r) => rowState(r) === 'cortesia' },
  { key: 'sin_negocio', label: 'Sin negocio', test: (r) => rowState(r) === 'sin_negocio' },
]

/** Fecha en la que le toca pagar: fin del plan pagado o fin de la prueba */
const dueDate = (o: AdminOwner) => (o.status === 'activo' ? o.paid_until : o.status === 'prueba' ? o.trial_ends_at : null)

export function Businesses({ initialFilter = 'todos' }: { initialFilter?: BizFilter }) {
  const [rows, setRows] = useState<AdminRow[] | null>(null)
  const [prices, setPrices] = useState<Prices>({ basico: 1500, plus: 1500, ultra: 1500 })
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<BizFilter>(initialFilter)
  const [sort, setSort] = useState<Sort>('recientes')
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [o, a, p] = await Promise.all([
      supabase.rpc('admin_list_owners'),
      supabase.rpc('admin_business_activity'),
      supabase.rpc('get_public_prices'),
    ])
    if (o.error || a.error) return setError(errorMessage(o.error || a.error))
    setRows(mergeRows(o.data as AdminOwner[], a.data as Activity[]))
    if (p.data) setPrices(p.data as Prices)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    const test = FILTERS.find((f) => f.key === filter)!.test
    const out = (rows || []).filter((r) =>
      test(r) && (!term || [r.email, r.name, r.code, r.slug, r.whatsapp].some((x) => (x || '').toLowerCase().includes(term))),
    )
    if (sort === 'pago') out.sort((a, b) => (dueDate(a) || '9999').localeCompare(dueDate(b) || '9999'))
    if (sort === 'reservas') out.sort((a, b) => (b.act?.bookings_30d || 0) - (a.act?.bookings_30d || 0))
    return out
  }, [rows, filter, q, sort])

  if (error && !rows) return <Alert>{error}</Alert>
  if (!rows) return <PageLoader />

  const open = rows.find((r) => r.user_id === openId) || null
  const th = 'whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-400'

  return (
    <div className="space-y-4">
      <PageTitle title="Negocios" right={<span className="pb-1 text-sm text-slate-500">{rows.length} en total</span>} />

      <div className="flex flex-wrap gap-2">
        <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 transition focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15">
          <Icon name="search" className="h-5 w-5 shrink-0 text-slate-400" />
          <input className="w-full bg-transparent py-2.5 outline-none" placeholder="Nombre, código, correo o WhatsApp" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <select className="input w-auto" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Ordenar">
          <option value="recientes">Más recientes</option>
          <option value="pago">Próximo pago</option>
          <option value="reservas">Más reservas</option>
        </select>
      </div>

      <FilterPills
        value={filter}
        onChange={setFilter}
        options={FILTERS.map((f) => ({ key: f.key, label: f.label, count: rows.filter(f.test).length }))}
      />

      {error && <Alert>{error}</Alert>}

      {shown.length === 0 ? (
        <div className="card py-10 text-center text-slate-500">No hay negocios con ese filtro.</div>
      ) : (
        <>
          {/* Móvil: lista */}
          <ul className="card divide-y divide-slate-100 overflow-hidden p-0 sm:p-0 md:hidden">
            {shown.map((r) => {
              const stuck = stuckReason(r)
              return (
                <li key={r.user_id}>
                  <button onClick={() => setOpenId(r.user_id)} className="grid w-full grid-cols-[36px_minmax(0,1fr)_56px] items-center gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50">
                    <BizAvatar owner={r} />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate font-semibold">{r.name || r.email}</span>
                        {stuck && <Icon name="alert" className="h-4 w-4 shrink-0 text-amber-500" />}
                      </span>
                      <span className="mt-1 flex min-w-0 items-center gap-2">
                        <StateChip owner={r} />
                        <StateDetail owner={r} className="min-w-0" />
                      </span>
                    </span>
                    <span className="text-right">
                      <b className="block tabular-nums">{r.act?.bookings_30d ?? '—'}</b>
                      <span className="block text-[11px] leading-tight text-slate-400">reservas</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          {/* Ordenador: tabla con columnas de ancho fijo (todas las filas miden lo mismo) */}
          <div className="card hidden overflow-hidden p-0 sm:p-0 md:block">
            <table className="w-full table-fixed text-left text-sm">
              <colgroup><col /><col className="w-[150px]" /><col className="w-[156px]" /><col className="w-[128px]" /></colgroup>
              <thead className="border-b border-slate-100">
                <tr><th className={th}>Negocio</th><th className={th}>Estado</th><th className={th}>Primeros pasos</th><th className={`${th} text-right`}>Reservas 30 d</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((r) => {
                  const stuck = stuckReason(r)
                  return (
                    <tr key={r.user_id} onClick={() => setOpenId(r.user_id)} className="cursor-pointer align-middle transition hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-3">
                          <BizAvatar owner={r} />
                          <span className="min-w-0">
                            <span className="block truncate font-semibold">{r.name || r.email}</span>
                            {stuck
                              ? <span className="mt-0.5 block truncate text-xs font-medium text-amber-700" title={stuck}>⚠ {stuck}</span>
                              : <span className="mt-0.5 block truncate text-xs text-slate-400">{r.act?.last_booking_at ? `Última reserva ${agoShort(r.act.last_booking_at)}` : r.name ? `Creado ${agoShort(r.created_at || r.signed_up_at)}` : r.email}</span>}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3"><StateCell owner={r} /></td>
                      <td className="px-4 py-3"><StepsBar done={r.act ? stepsCount(r.act) : null} /></td>
                      <td className="px-4 py-3 text-right text-[15px] font-bold tabular-nums">{r.act?.bookings_30d ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <BusinessDrawer row={open} owners={rows || []} prices={prices} onClose={() => setOpenId(null)} onChanged={load} />
    </div>
  )
}

/** Ficha de un negocio: su estado, sus primeros pasos y lo que se puede hacer con él */
function BusinessDrawer({ row, owners, prices, onClose, onChanged }: { row: AdminRow | null; owners: AdminRow[]; prices: Prices; onClose: () => void; onChanged: () => void }) {
  const [activating, setActivating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [zoning, setZoning] = useState(false)
  const [password, setPassword] = useState(false)
  const [confirming, setConfirming] = useState<ConfirmKind | null>(null)
  const [acting, setActing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Apuntar a mano quién lo invitó: primero se elige el negocio, luego se confirma
  const [pickingRef, setPickingRef] = useState(false)
  const [referrer, setReferrer] = useState<OwnerWithBusiness | null>(null)

  // Al cambiar de negocio, ninguna ventana abierta del anterior
  const id = row?.user_id
  useEffect(() => {
    setActivating(false)
    setDeleting(false)
    setZoning(false)
    setPassword(false)
    setConfirming(null)
    setError(null)
    setPickingRef(false)
    setReferrer(null)
  }, [id])

  if (!row) return null
  const r = row
  const a = r.act
  const biz: OwnerWithBusiness | null = hasBusiness(r) ? r : null
  const stuck = stuckReason(r)
  const done = stepsDone(a)
  const state = rowState(r)
  const name = r.name || r.email || ''

  const act = async (fn: 'admin_extend_trial' | 'admin_deactivate_business' | 'admin_grant_free' | 'admin_revoke_free' | 'admin_set_market', msg: string, market?: 'cu' | 'int') => {
    if (!biz) return
    setActing(true)
    setError(null)
    const { error } = await supabase.rpc(fn, fn === 'admin_extend_trial' ? { p_business: biz.id, p_days: 3 }
      : fn === 'admin_set_market' ? { p_business: biz.id, p_market: market } : { p_business: biz.id })
    setActing(false)
    setConfirming(null)
    if (error) return setError(errorMessage(error))
    flash(msg)
    onChanged()
  }

  // Quién lo invitó (si vino con un enlace de invitación o se apuntó a mano)
  const invitedBy = r.referred_by ? owners.find((o) => o.id === r.referred_by) : null
  const paidOnce = Boolean(a?.paid)

  const saveReferrer = async () => {
    if (!biz || !referrer) return
    setActing(true)
    setError(null)
    const { data, error } = await supabase.rpc('admin_set_referrer', { p_business: biz.id, p_referrer: referrer.id })
    setActing(false)
    const who = referrer.name
    setReferrer(null)
    if (error) return setError(errorMessage(error))
    flash((data as { rewarded?: boolean } | null)?.rewarded
      ? `Listo: ${name} y ${who} ya tienen su mes gratis`
      : `Apuntado: ${who} invitó a ${name}. El mes gratis llega con su primer pago`)
    onChanged()
  }

  const changed = () => {
    setActivating(false)
    setZoning(false)
    onChanged()
  }

  return (
    <>
      <Drawer open onClose={onClose} label={name}>
        <div className="flex items-center gap-3 pr-10">
          <BizAvatar owner={r} size="h-14 w-14 text-3xl" />
          <div className="min-w-0">
            <h2 className="truncate text-xl font-extrabold tracking-tight">{name}</h2>
            <p className="truncate text-sm text-slate-500">{r.code ? <><span className="font-mono">{r.code}</span> · </> : null}{r.email}</p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <StateChip owner={r} />
          {r.market === 'int' && <span className="chip shrink-0 bg-indigo-100 font-semibold text-indigo-800">Internacional</span>}
          <span className="truncate text-sm text-slate-500">
            {state === 'prueba' && r.trial_ends_at && <>Termina el {fullDateFromIso(r.trial_ends_at, ADMIN_TZ)}</>}
            {state === 'activo' && r.paid_until && <>{planName(r.plan)} · pagado hasta el {fullDateFromIso(r.paid_until, ADMIN_TZ)} · {money(planPrice(prices, r.plan, r.market), payCurrency(r.market))}/mes</>}
            {state === 'vencido' && <>Sus clientes no pueden reservar</>}
            {state === 'cortesia' && <>Todo incluido, no paga</>}
            {state === 'sin_negocio' && <>Se registró pero no terminó de crear su negocio</>}
          </span>
        </div>

        {/* Prueba: cuánto le queda, con barra */}
        {state === 'prueba' && r.trial_ends_at && (
          <div className="mt-4 rounded-2xl bg-sky-50 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-lg font-extrabold text-sky-900">{trialLeft(r.trial_ends_at)} de prueba</p>
              <p className="shrink-0 text-xs font-semibold text-sky-700">{trialUsed(r)} % usado</p>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-sky-100">
              <div className="h-full rounded-full bg-sky-500" style={{ width: `${trialUsed(r)}%` }} />
            </div>
          </div>
        )}
        {/* Prueba acabada sin pagar: se borra sola */}
        {purgeAt(r) && (
          <div className="mt-4">
            <Alert kind="warning">
              Terminó la prueba sin pagar. <b>Se borra para siempre el {fullDateFromIso(purgeAt(r)!, ADMIN_TZ)}</b> si no paga antes (o si no le das más días de prueba).
            </Alert>
          </div>
        )}

        {stuck && <div className="mt-4"><Alert kind="warning">{stuck}.</Alert></div>}

        {a && (
          <div className="mt-4 grid grid-cols-3 gap-2">
            <MiniStat value={String(a.bookings_30d)} label="reservas en 30 días" />
            <MiniStat value={`${stepsCount(a)}/${STEPS.length}`} label="primeros pasos" />
            <MiniStat value={agoShort(a.last_booking_at)} label="última reserva" />
          </div>
        )}

        <div className="mt-5 space-y-2.5">
          {r.whatsapp && <MessagePicker row={r} phone={r.whatsapp} prices={prices} />}
          {biz && (
            <div className="grid grid-cols-2 gap-2.5">
              {!r.comped && <Button onClick={() => setActivating(true)}><Icon name="card" className="h-[18px] w-[18px]" /> Registrar pago</Button>}
              {!r.comped && state !== 'activo' && (
                <Button variant="secondary" loading={acting && confirming === null} onClick={() => act('admin_extend_trial', `${name}: 3 días más de prueba`)}>
                  <Icon name="clock" className="h-[18px] w-[18px]" /> Dar 3 días
                </Button>
              )}
              {r.slug && (
                <LinkButton href={publicUrl(r.slug)} variant="secondary" newTab className={state !== 'activo' ? 'col-span-2' : ''}>
                  <Icon name="external" className="h-[18px] w-[18px]" /> Ver su página
                </LinkButton>
              )}
            </div>
          )}
          {error && <Alert>{error}</Alert>}
        </div>

        {a && (
          <section className="mt-6">
            <h3 className="text-[13px] font-bold uppercase tracking-[0.12em] text-slate-500">Primeros pasos</h3>
            <ul className="mt-2.5 space-y-2.5">
              {STEPS.map((s, i) => (
                <li key={s.label} className="flex items-start gap-3">
                  <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${done[i] ? 'bg-emerald-500 text-white' : 'border-2 border-slate-300'}`}>
                    {done[i] && <Icon name="check" className="h-3.5 w-3.5" />}
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-[15px] font-semibold ${done[i] ? 'text-slate-900' : 'text-slate-500'}`}>{s.label}</span>
                    <span className="block text-xs text-slate-400">{s.hint}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-6 space-y-1 text-sm text-slate-500">
          <p>Se registró {agoShort(r.signed_up_at)}{r.last_sign_in_at && <> · último acceso {agoShort(r.last_sign_in_at)}</>}.</p>
          {a && <p>{a.customers} {a.customers === 1 ? 'cliente' : 'clientes'} · {a.services} {a.services === 1 ? 'servicio' : 'servicios'} · {money(a.revenue_30d, a.currency)} en citas (30 días)</p>}
          {r.timezone && r.timezone !== ADMIN_TZ && <p>Usa la hora de {tzLabel(r.timezone)}.</p>}
          {r.referred_by && (
            <p>
              🎁 Lo invitó <b className="text-slate-700">{invitedBy?.name || 'un negocio que ya no existe'}</b>
              {r.referral_rewarded ? ' · ya ganaron su mes gratis los dos' : ' · el mes gratis llega con su primer pago'}.
            </p>
          )}
        </section>

        <details className="group mt-6">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-bold text-slate-500 [&::-webkit-details-marker]:hidden">
            <Icon name="chevron" className="h-4 w-4 transition group-open:rotate-90" /> Más acciones
          </summary>
          <div className="mt-2 divide-y divide-slate-100 rounded-2xl ring-1 ring-slate-200">
            {biz && !r.comped && <MoreAction icon="gift" onClick={() => setConfirming('grant')}>Regalar para siempre (cortesía)</MoreAction>}
            {biz && r.comped && <MoreAction icon="gift" onClick={() => setConfirming('revoke')}>Quitar la cortesía</MoreAction>}
            {biz && !r.referral_rewarded && (
              <MoreAction icon="gift" onClick={() => setPickingRef(true)}>
                {r.referred_by ? 'Cambiar quién lo invitó' : 'Apuntar quién lo invitó'}
              </MoreAction>
            )}
            {biz && <MoreAction icon="globe" onClick={() => setZoning(true)}>Cambiar zona horaria</MoreAction>}
            <MoreAction icon="lock" onClick={() => setPassword(true)}>Darle una contraseña provisional</MoreAction>
            {biz && (
              <MoreAction icon="globe" onClick={() => setConfirming(r.market === 'int' ? 'to_cu' : 'to_int')}>
                {r.market === 'int' ? 'Pasar a la versión de Cuba' : 'Pasar a la versión internacional'}
              </MoreAction>
            )}
            {biz && state !== 'vencido' && <MoreAction icon="lock" danger onClick={() => setConfirming('deactivate')}>Inhabilitar</MoreAction>}
            {(state === 'vencido' || state === 'sin_negocio') && <MoreAction icon="x" danger onClick={() => setDeleting(true)}>Eliminar para siempre</MoreAction>}
          </div>
        </details>
      </Drawer>

      {confirming && (
        <ConfirmModal
          {...CONFIRM[confirming](name)}
          busy={acting}
          onClose={() => setConfirming(null)}
          onConfirm={() => {
            if (confirming === 'grant') act('admin_grant_free', `${name} tiene Citora gratis para siempre`)
            else if (confirming === 'revoke') act('admin_revoke_free', `Cortesía quitada: ${name} vuelve a como estaba`)
            else if (confirming === 'to_int') act('admin_set_market', `${name} pasa a la versión internacional`, 'int')
            else if (confirming === 'to_cu') act('admin_set_market', `${name} pasa a la versión de Cuba`, 'cu')
            else act('admin_deactivate_business', `${name} inhabilitado`)
          }}
        />
      )}
      {activating && biz && <ActivateModal business={biz} plan={biz.plan === 'ultra' ? 'ultra' : 'basico'} prices={prices} onClose={() => setActivating(false)} onDone={changed} />}
      {zoning && biz && <TimezoneModal business={biz} onClose={() => setZoning(false)} onDone={changed} />}
      {password && <TempPasswordModal owner={r} onClose={() => setPassword(false)} />}
      {pickingRef && biz && (
        <PickBusinessModal
          owners={owners}
          title={`¿Quién invitó a ${name}?`}
          withComped
          exclude={biz.id}
          onClose={() => setPickingRef(false)}
          onPick={(o) => {
            setPickingRef(false)
            setReferrer(o)
          }}
        />
      )}
      {referrer && (
        <ConfirmModal
          title={`¿${referrer.name} invitó a ${name}?`}
          text={paidOnce
            ? `${name} ya pagó su primer mes, así que ahora mismo se le suma un mes gratis${referrer.comped
              ? `. ${referrer.name} es cortesía y no paga, así que no recibe nada.`
              : ` y otro a ${referrer.name} (si está en prueba, se le alarga un mes), a quien le llega el aviso «¡Ganaste un mes gratis!».`} Esto no se puede deshacer.`
            : `Cuando apruebes el primer pago de ${name}, los dos ganan un mes gratis, igual que si hubiera venido con el enlace de invitación.`}
          confirmLabel="Sí, apuntarlo"
          busy={acting}
          onClose={() => setReferrer(null)}
          onConfirm={saveReferrer}
        />
      )}
      {deleting && (
        <DeleteModal
          owner={r}
          onClose={() => setDeleting(false)}
          onDone={() => {
            setDeleting(false)
            onClose()
            onChanged()
          }}
        />
      )}
    </>
  )
}

/**
 * Mensajes de WhatsApp para el dueño: eliges el tipo (días que le quedan de prueba, ayuda para
 * configurar...), lo ves y lo puedes retocar antes de enviarlo.
 */
function MessagePicker({ row, phone, prices }: { row: AdminRow; phone: string; prices: Prices }) {
  const price = (plan: 'basico' | 'ultra') => money(planPrice(prices, plan, row.market), payCurrency(row.market))
  const options = messageOptions(row, { solo: price('basico'), equipo: price('ultra'), discount: Boolean(prices.discount_3m || prices.discount_6m) })
  const [kind, setKind] = useState<MessageKind>(options[0].id)
  const [text, setText] = useState(options[0].text)

  // Al abrir otro negocio, empieza por el mensaje que más le hace falta
  const first = options[0]
  useEffect(() => {
    setKind(first.id)
    setText(first.text)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.user_id])

  const pick = (id: MessageKind) => {
    setKind(id)
    setText(options.find((o) => o.id === id)?.text || '')
  }

  return (
    <section className="rounded-2xl border border-slate-200 p-3">
      <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-slate-500">Mensaje por WhatsApp</p>
      <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tipo de mensaje">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={kind === o.id}
            onClick={() => pick(o.id)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${kind === o.id ? 'bg-brand text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <textarea className="input mt-2.5 text-sm" rows={6} value={text} onChange={(e) => setText(e.target.value)} aria-label="Texto del mensaje" />
      <div className="mt-2.5 flex gap-2">
        <LinkButton href={waLink(phone, text)} variant="whatsapp" block newTab>
          <WhatsAppIcon className="h-4 w-4" /> Enviar por WhatsApp
        </LinkButton>
        <CopyButton text={text} />
      </div>
    </section>
  )
}

function MiniStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col justify-center rounded-xl bg-slate-50 px-2 py-3 text-center">
      <p className="whitespace-nowrap text-[15px] font-extrabold">{value}</p>
      <p className="mt-0.5 text-xs leading-tight text-slate-500">{label}</p>
    </div>
  )
}

function MoreAction({ icon, danger, onClick, children }: { icon: string; danger?: boolean; onClick: () => void; children: string }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold transition first:rounded-t-2xl last:rounded-b-2xl hover:bg-slate-50 ${danger ? 'text-red-600' : 'text-slate-700'}`}>
      <Icon name={icon} className="h-[18px] w-[18px] shrink-0" />
      {children}
    </button>
  )
}
