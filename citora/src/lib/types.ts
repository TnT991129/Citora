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
  appointment_services?: AppointmentService[]
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
}

export interface PublicBooking {
  token: string
  starts_at: string
  ends_at: string
  customer_name: string
  customer_phone: string
  customer_note: string | null
  total: number
  status: AppointmentStatus
  reschedule_count: number
  can_change: boolean
  services: AppointmentService[]
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
