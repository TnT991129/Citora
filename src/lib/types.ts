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
  timezone: string
  currency: string
  policies: string | null
  min_notice_hours: number
  max_days_ahead: number
  cancel_notice_hours: number
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
  price: number
  duration_min: number
  position: number
  active: boolean
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

export interface AppointmentService {
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
  active: boolean
  position: number
  created_at: string
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

export interface PublicService {
  id: string
  name: string
  description: string | null
  price: number
  duration_min: number
}

export interface PublicBusiness {
  id?: string
  name: string
  slug: string
  accepting: boolean
  logo_url: string | null
  color_primary: string
  business_type?: string
  whatsapp?: string
  address?: string | null
  description?: string | null
  timezone?: string
  currency?: string
  policies?: string | null
  min_notice_hours?: number
  max_days_ahead?: number
  cancel_notice_hours?: number
  plan?: PlanKey
  today?: string
  services?: PublicService[]
  schedule?: { weekday: number; is_open: boolean }[]
  closed_days?: string[]
  rating?: { avg: number | null; count: number } | null
  staff?: { id: string; name: string }[]
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

export interface GalleryPhoto {
  id: string
  url: string
  caption: string | null
  position?: number
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
  }
  by_day: { day: string; bookings: number; revenue: number }[]
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
  discount?: number
  discount_code?: string | null
  staff_id?: string | null
  staff_name?: string | null
  status: AppointmentStatus
  reschedule_count: number
  can_change: boolean
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
  }
}

export interface Prices {
  basico: number
  plus: number
  ultra: number
  trial_days?: number
}
