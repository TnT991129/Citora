import type { Appearance } from './appearance'

export type PlanKey = 'basico' | 'plus' | 'ultra'
export type BusinessStatus = 'prueba' | 'activo' | 'vencido'
export type AppointmentStatus = 'pendiente' | 'confirmada' | 'completada' | 'no_asistio' | 'cancelada'

export interface Business {
  id: string
  owner_id: string
  slug: string
  code: string
  name: string
  business_type: string
  whatsapp: string
  address: string | null
  description: string | null
  logo_url: string | null
  color_primary: string
  cover_url: string | null
  appearance: Appearance
  timezone: string
  currency: string
  usd_prices: boolean
  usd_rate: number | null
  policies: string | null
  min_notice_hours: number
  max_days_ahead: number
  cancel_notice_hours: number
  reschedule_notice_hours: number
  max_reschedules: number | null
  max_pending_bookings: number | null
  max_daily_bookings: number | null
  deposit_enabled: boolean
  deposit_amount: number | null
  deposit_instructions: string | null
  loyalty_enabled: boolean
  loyalty_every: number | null
  loyalty_reward: string | null
  slot_capacity: number
  plan: PlanKey | null
  trial_ends_at: string
  paid_until: string | null
  created_at: string
}

export interface Service {
  id: string
  business_id: string
  name: string
  description: string | null
  photo_url: string | null
  price: number
  duration_min: number
  position: number
  active: boolean
  is_extra: boolean
}

export interface ScheduleDay {
  business_id: string
  weekday: number
  is_open: boolean
  slots: string[]
}

export interface ClosedDay {
  business_id: string
  day: string
  reason: string | null
}

export interface ClosedSlot {
  id: string
  business_id: string
  day: string
  start_time: string
  end_time: string
  reason: string | null
}

export interface AppointmentService {
  id?: string | null
  name: string
  price: number
  duration_min: number
}

export interface Appointment {
  id: string
  business_id: string
  token: string
  starts_at: string
  ends_at: string
  customer_name: string
  customer_phone: string
  customer_note: string | null
  total: number
  usd_rate: number | null
  status: AppointmentStatus
  source: 'web' | 'manual'
  cancelled_by: string | null
  reschedule_count: number
  internal_note: string | null
  created_at: string
  discount_code: string | null
  discount: number
  reminded_at: string | null
  staff_id: string | null
  appointment_services?: AppointmentService[]
}

export interface Staff {
  id: string
  business_id: string
  name: string
  photo_url: string | null
  active: boolean
  position: number
  created_at: string
}

export interface StaffScheduleDay {
  staff_id: string
  weekday: number
  is_open: boolean
  slots: string[]
}

export interface StaffService {
  staff_id: string
  service_id: string
}

export interface PublicStaff {
  id: string
  name: string
  photo_url: string | null
  /** Vacío = puede con todos los servicios */
  service_ids: string[]
}

export interface Discount {
  id: string
  business_id: string
  code: string
  percent: number | null
  amount: number | null
  active: boolean
  valid_until: string | null
  max_uses: number | null
  uses: number
  created_at: string
}

export interface Package {
  id: string
  business_id: string
  name: string
  sessions: number
  price: number
  active: boolean
  created_at: string
}

export interface CustomerPackage {
  id: string
  business_id: string
  package_id: string | null
  customer_phone: string
  package_name: string
  sessions_total: number
  sessions_left: number
  note: string | null
  sold_at: string
}

export interface Expense {
  id: string
  business_id: string
  day: string
  amount: number
  category: string
  note: string | null
  created_at: string
}

export interface WaitlistEntry {
  id: string
  business_id: string
  day: string
  customer_name: string
  customer_phone: string
  note: string | null
  status: 'esperando' | 'avisado' | 'descartado'
  created_at: string
}

export interface MyStatus {
  status: BusinessStatus
  effective_plan: PlanKey | null
  plan: PlanKey | null
  trial_ends_at: string
  paid_until: string | null
  code: string
}

export type PaymentClaimStatus = 'pendiente' | 'aprobado' | 'rechazado'

export interface PaymentClaim {
  id: string
  business_id: string
  months: number
  amount: number | null
  note: string | null
  proof_url: string | null
  status: PaymentClaimStatus
  admin_note: string | null
  created_at: string
  resolved_at: string | null
}

export interface PublicService {
  id: string
  name: string
  description: string | null
  photo_url: string | null
  price: number
  duration_min: number
  is_extra?: boolean
}

export interface PublicBusiness {
  id?: string
  name: string
  slug: string
  accepting: boolean
  logo_url: string | null
  color_primary: string
  cover_url?: string | null
  appearance?: Appearance
  business_type?: string
  whatsapp?: string
  address?: string | null
  description?: string | null
  timezone?: string
  currency?: string
  usd_prices?: boolean
  usd_rate?: number | null
  policies?: string | null
  min_notice_hours?: number
  max_days_ahead?: number
  cancel_notice_hours?: number
  reschedule_notice_hours?: number
  max_reschedules?: number | null
  deposit_enabled?: boolean
  deposit_amount?: number | null
  deposit_instructions?: string | null
  plan?: PlanKey
  today?: string
  services?: PublicService[]
  schedule?: { weekday: number; is_open: boolean }[]
  closed_days?: string[]
  rating?: { avg: number | null; count: number } | null
  staff?: PublicStaff[]
  reviews?: PublicReview[]
  gallery?: GalleryPhoto[]
}

export interface PublicReview {
  name: string
  rating: number
  comment: string | null
  reply: string | null
  created_at: string
}

export type ModerationStatus = 'pendiente' | 'aprobada' | 'rechazada'

export interface GalleryPhoto {
  id: string
  url: string
  caption: string | null
  position?: number
  moderation_status?: ModerationStatus
  moderation_note?: string | null
}

export interface Review {
  id: string
  business_id: string
  appointment_id: string
  customer_name: string
  rating: number
  comment: string | null
  reply: string | null
  hidden: boolean
  created_at: string
}

export interface CustomerSummary {
  phone: string
  name: string
  bookings: number
  visits: number
  no_shows: number
  cancelled: number
  spent: number
  first_at: string
  last_visit: string | null
  next_at: string | null
  note: string | null
  tags: string[]
}

export interface OwnerStats {
  summary: {
    bookings: number
    done: number
    upcoming: number
    cancelled: number
    no_shows: number
    revenue: number
    expected: number
    web: number
    manual: number
    customers: number
    new_customers: number
    expenses: number
  }
  by_day: { day: string; bookings: number; revenue: number; expenses: number }[]
  expenses_by_category: { category: string; total: number }[]
  top_services: { name: string; count: number; revenue: number }[]
  by_weekday: number[]
  by_hour: { hour: number; count: number }[]
}

export interface PublicBooking {
  token: string
  starts_at: string
  ends_at: string
  customer_name: string
  customer_phone: string
  customer_note: string | null
  total: number
  usd_rate?: number | null
  discount?: number
  discount_code?: string | null
  staff_id?: string | null
  staff_name?: string | null
  status: AppointmentStatus
  reschedule_count: number
  can_cancel: boolean
  can_edit: boolean
  services: AppointmentService[]
  can_review: boolean
  review: { rating: number; comment: string | null; reply: string | null } | null
  customer: { visits: number; bookings: number; since: string | null } | null
  business: {
    name: string
    slug: string
    whatsapp: string
    address: string | null
    logo_url: string | null
    color_primary: string
    timezone: string
    currency: string
    cancel_notice_hours: number
    reschedule_notice_hours: number
    max_reschedules: number | null
    loyalty_enabled: boolean
    loyalty_every: number | null
    loyalty_reward: string | null
    appearance?: Appearance
  }
}

export interface Prices {
  basico: number
  plus: number
  ultra: number
  trial_days?: number
}
