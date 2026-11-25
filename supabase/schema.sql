-- =====================================================================
-- CITORA · Base de datos
-- Ejecutar completo en Supabase > SQL Editor > New query > Run.
-- Se puede volver a ejecutar sin romper nada (usa "if not exists" y
-- "create or replace" siempre que se puede).
-- =====================================================================

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;
-- Para cifrar las contraseñas provisionales (ver admin_set_temp_password)
create extension if not exists pgcrypto with schema extensions;
-- Para avisar a la función de notificaciones push desde la base de datos (ver sección 2 y 3)
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------
-- 1. TABLAS
-- ---------------------------------------------------------------------

-- Administradores de la plataforma (Osmel)
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Ajustes de la plataforma (una sola fila)
create table if not exists public.platform_settings (
  id int primary key default 1 check (id = 1),
  card_number text not null default '',
  card_holder text not null default '',
  admin_whatsapp text not null default '',
  price_basico int not null default 1500,  -- plan Solo (sin equipo)
  price_plus int not null default 1500,    -- sin uso: se mantiene igual al de Solo
  price_ultra int not null default 1500,   -- plan Equipo (varios profesionales)
  trial_days int not null default 3 check (trial_days between 0 and 60),
  updated_at timestamptz not null default now()
);
insert into public.platform_settings (id) values (1) on conflict (id) do nothing;

-- Notificaciones push: dirección y clave de la función (Edge Function) que las envía.
-- Se configuran una sola vez (panel de administrador) después de desplegar la función; mientras
-- estén vacías, la app sigue funcionando igual mas sin avisos push.
alter table public.platform_settings add column if not exists push_function_url text;
alter table public.platform_settings add column if not exists push_shared_secret text;

-- Teléfono para confirmar la transferencia: algunos bancos (ej. Transfermóvil desde Android)
-- piden un número de teléfono además de la tarjeta, para confirmar que el destino es correcto.
alter table public.platform_settings add column if not exists card_phone text not null default '';

-- Versión internacional (citora-app.com/int/): precios en USD y pago automático con PayPal (ver
-- online_orders y supabase/functions/paypal-checkout). paypal_client_id es público (lo usan los botones
-- de PayPal en el navegador); la clave secreta va solo en la función (PAYPAL_SECRET). Vacío: aún no
-- se puede pagar desde la app.
alter table public.platform_settings add column if not exists price_int_basico numeric(10, 2) not null default 12.50
  check (price_int_basico >= 0);
alter table public.platform_settings add column if not exists price_int_ultra numeric(10, 2) not null default 23.50
  check (price_int_ultra >= 0);
alter table public.platform_settings add column if not exists paypal_client_id text not null default ''
  check (paypal_client_id ~ '^[A-Za-z0-9_-]*$');


-- Enlace al grupo de WhatsApp de los dueños (lo ven en su panel, en "Más"). Vacío: no se muestra.
alter table public.platform_settings add column if not exists community_url text not null default ''
  check (community_url = '' or community_url ~ '^https://');

-- Moderación de fotos (ver moderate-photo). Mientras esté vacía, las fotos se aprueban solas sin
-- revisión (igual que con push_function_url vacío: la app sigue funcionando, solo sin ese aviso).
alter table public.platform_settings add column if not exists moderate_function_url text;

-- Zona horaria con la que empiezan los negocios nuevos. Cada negocio tiene la suya (la cambia el
-- administrador: ver admin_set_timezone) y en ella se leen su horario, sus citas y sus estadísticas.
alter table public.platform_settings add column if not exists default_timezone text not null default 'Etc/GMT+4';
-- Cuba no cambió la hora en noviembre de 2026, pero la base de zonas horarias del mundo (la de
-- Postgres, la de los navegadores y la de los móviles) sí lo hace para "America/Havana" (UTC−5 en
-- invierno). Cuba usa la zona fija "Etc/GMT+4" (UTC−4 todo el año; el signo va al revés en "Etc").
-- Los negocios que estaban en "America/Havana" se pasan al final de este archivo.
alter table public.platform_settings alter column default_timezone set default 'Etc/GMT+4';
update public.platform_settings set default_timezone = 'Etc/GMT+4' where default_timezone = 'America/Havana';

-- Dos planes (versión 1.4): Citora Solo ('basico', sin equipo) y Citora Equipo ('ultra', con varios
-- profesionales). La prueba gratis es con Equipo. Al pasar a dos planes, Equipo empieza en 3.000 CUP
-- (una sola vez: después lo cambia el administrador). 'plus' es de pagos antiguos: cuenta como Solo.
alter table public.platform_settings add column if not exists plans_v2 boolean not null default false;
update public.platform_settings
   set price_ultra = 3000, price_plus = price_basico, plans_v2 = true
 where id = 1 and not plans_v2;

-- Negocios (cada dueño tiene un negocio en la Fase 1)
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  slug text not null unique,
  code text not null unique,
  name text not null check (char_length(name) between 2 and 60),
  business_type text not null default 'otro',
  whatsapp text not null default '',
  address text,
  description text,
  logo_url text,
  color_primary text not null default '#f0532e' check (color_primary ~ '^#[0-9a-fA-F]{6}$'),
  timezone text not null default 'Etc/GMT+4',
  currency text not null default 'CUP',
  policies text,
  min_notice_hours int not null default 2 check (min_notice_hours between 0 and 168),
  max_days_ahead int not null default 60 check (max_days_ahead between 1 and 365),
  cancel_notice_hours int not null default 6 check (cancel_notice_hours between 0 and 168),
  plan text check (plan in ('basico', 'plus', 'ultra')),
  trial_ends_at timestamptz not null default now() + interval '3 days',
  paid_until timestamptz,
  created_at timestamptz not null default now()
);

-- Una cuenta = un negocio. Si se quitó esta regla en una versión anterior, se vuelve a poner
-- y se borra lo que usaba aquella versión (varios negocios por cuenta).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'businesses_owner_id_key') then
    alter table public.businesses add constraint businesses_owner_id_key unique (owner_id);
  end if;
end;
$$;
drop function if exists public.set_active_business(uuid);
drop table if exists public.owner_prefs;

-- Personalización de la web del negocio: portada y apariencia (ver _clean_appearance)
alter table public.businesses add column if not exists cover_url text;
alter table public.businesses add column if not exists appearance jsonb not null default '{}'::jsonb;

-- Versión de Citora del negocio: 'cu' (Cuba, citora-app.com) o 'int' (internacional, citora-app.com/int/).
-- Se elige al crear la app según la dirección en la que se crea, y después solo la cambia el
-- administrador (admin_set_market). Los negocios de antes son todos de Cuba.
alter table public.businesses add column if not exists market text not null default 'cu'
  check (market in ('cu', 'int'));

-- Idioma en el que el dueño usa su panel (versión internacional: 'es' o 'en'; en Cuba siempre 'es').
-- Lo guarda el panel al abrirse y con él se escriben los avisos push del negocio y de sus clientes.
alter table public.businesses add column if not exists lang text not null default 'es'
  check (lang in ('es', 'en'));

-- Servicios del negocio
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text,
  price numeric(10, 2) not null default 0 check (price >= 0),
  duration_min int not null default 60 check (duration_min between 5 and 600),
  position int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists services_business_idx on public.services (business_id, position);

-- Horario semanal: 0 = domingo ... 6 = sábado. "slots" son las horas de inicio de cada turno.
create table if not exists public.schedule_days (
  business_id uuid not null references public.businesses(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  is_open boolean not null default true,
  slots time[] not null default '{}',
  primary key (business_id, weekday)
);

-- Días cerrados (vacaciones, feriados)
create table if not exists public.closed_days (
  business_id uuid not null references public.businesses(id) on delete cascade,
  day date not null,
  reason text,
  primary key (business_id, day)
);

-- Horas sueltas bloqueadas dentro de un día abierto (ej. "hoy de 13:00 a 14:00, almuerzo" o
-- "el jueves salgo a las 16:00"). A diferencia de closed_days, el día sigue abierto para el resto
-- de las horas.
create table if not exists public.closed_slots (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  day date not null,
  start_time time not null,
  end_time time not null,
  reason text check (char_length(reason) <= 120),
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);
create index if not exists closed_slots_business_day_idx on public.closed_slots (business_id, day);

-- Citas
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  token text not null unique,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  customer_name text not null,
  customer_phone text not null,
  customer_note text,
  total numeric(10, 2) not null default 0,
  status text not null default 'pendiente'
    check (status in ('pendiente', 'confirmada', 'completada', 'no_asistio', 'cancelada')),
  source text not null default 'web' check (source in ('web', 'manual')),
  cancelled_by text,
  reschedule_count int not null default 0,
  internal_note text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  -- Imposible tener dos citas activas que se solapen en el mismo negocio
  constraint appointments_no_overlap exclude using gist (
    business_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status <> 'cancelada')
);
create index if not exists appointments_business_start_idx on public.appointments (business_id, starts_at);
create index if not exists appointments_phone_idx on public.appointments (business_id, customer_phone);

-- Servicios de cada cita (copia del nombre y precio al momento de reservar)
create table if not exists public.appointment_services (
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  name text not null,
  price numeric(10, 2) not null default 0,
  duration_min int not null default 0
);
create index if not exists appointment_services_appt_idx on public.appointment_services (appointment_id);

-- Pagos de suscripción confirmados por el administrador
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  plan text not null check (plan in ('basico', 'plus', 'ultra')),
  months int not null check (months between 1 and 24),
  amount numeric(10, 2),
  note text,
  paid_until timestamptz not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists payments_business_idx on public.payments (business_id, created_at desc);

-- Si el administrador borra un negocio, sus pagos se conservan (para las cuentas de cobros),
-- con el nombre y el código del negocio guardados en el propio pago.
alter table public.payments add column if not exists business_name text;
alter table public.payments add column if not exists business_code text;
update public.payments p set business_name = b.name, business_code = b.code
  from public.businesses b where b.id = p.business_id and p.business_name is null;
alter table public.payments alter column business_id drop not null;
alter table public.payments drop constraint if exists payments_business_id_fkey;
alter table public.payments add constraint payments_business_id_fkey
  foreign key (business_id) references public.businesses(id) on delete set null;

-- El dueño declara un pago (con captura) desde su panel, en vez de solo mandar el comprobante por
-- WhatsApp. El administrador lo aprueba (eso activa el mes, igual que admin_activate_plan) o lo
-- rechaza. No sustituye el WhatsApp, lo complementa: queda más rápido de revisar.
create table if not exists public.payment_claims (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  months int not null check (months between 1 and 24),
  amount numeric(10, 2) check (amount is null or amount >= 0),
  note text check (char_length(note) <= 300),
  proof_path text,
  status text not null default 'pendiente' check (status in ('pendiente', 'aprobado', 'rechazado')),
  admin_note text check (char_length(admin_note) <= 300),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);
create index if not exists payment_claims_business_idx on public.payment_claims (business_id, created_at desc);
create index if not exists payment_claims_status_idx on public.payment_claims (status, created_at);

-- La captura se guarda en el almacén privado "payment-proofs" (ver sección 9): esta columna pasa
-- de "proof_url" (URL pública completa) a "proof_path" (solo la ruta dentro del almacén; la URL
-- para verla se genera al vuelo, firmada y de corta duración, en vez de quedar fija y pública).
do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'payment_claims' and column_name = 'proof_url')
     and not exists (select 1 from information_schema.columns where table_name = 'payment_claims' and column_name = 'proof_path') then
    alter table public.payment_claims rename column proof_url to proof_path;
  end if;
end;
$$;
-- Las declaraciones de antes de este cambio guardaban la URL pública completa del almacén
-- "logos" (donde vivían antes las capturas); se recorta a solo la ruta, que es donde quedó el
-- archivo ya movido al nuevo almacén.
update public.payment_claims
   set proof_path = regexp_replace(proof_path, '^https?://[^/]+/storage/v1/object/public/logos/', '')
 where proof_path ~ '^https?://[^/]+/storage/v1/object/public/logos/';

-- Sin captura no hay declaración válida (evita declarar "a ciegas", sin comprobante que revisar).
-- Las declaraciones de prueba de antes de esta regla (sin captura) se marcan para no romper la
-- restricción al añadirla.
update public.payment_claims set proof_path = 'sin-comprobante (declarada antes de exigirlo)'
 where proof_path is null or btrim(proof_path) = '';
alter table public.payment_claims drop constraint if exists payment_claims_proof_required;
alter table public.payment_claims add constraint payment_claims_proof_required
  check (proof_path is not null and btrim(proof_path) <> '');

-- Pruebas gratis que terminaron sin pagar y se borraron solas (ver _purge_expired_trials). Solo
-- queda esta ficha mínima, para que las estadísticas (negocios nuevos por mes, prueba → pago) sigan
-- contando a los que se apuntaron y no pagaron. Sin políticas: solo la leen las funciones.
create table if not exists public.purged_trials (
  id uuid primary key,
  name text not null,
  code text,
  business_type text,
  created_at timestamptz not null,
  trial_ends_at timestamptz not null,
  purged_at timestamptz not null default now()
);
alter table public.purged_trials enable row level security;

-- Opiniones de los clientes (una por cita). El dueño puede ocultarlas o responder.
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  appointment_id uuid not null unique references public.appointments(id) on delete cascade,
  customer_name text not null,
  rating smallint not null check (rating between 1 and 5),
  comment text check (char_length(comment) <= 500),
  reply text check (char_length(reply) <= 500),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists reviews_business_idx on public.reviews (business_id, created_at desc);

-- Galería de trabajos (fotos en el almacén "logos", carpeta del negocio)
create table if not exists public.gallery_photos (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  url text not null check (url ~ '^https?://'),
  caption text check (char_length(caption) <= 120),
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists gallery_business_idx on public.gallery_photos (business_id, position);

-- Moderación automática (ver _notify_moderation y moderate-photo): mientras no se revise, la foto
-- no sale en la web pública; solo el dueño la ve (con el estado) en su panel.
alter table public.gallery_photos add column if not exists moderation_status text not null default 'pendiente'
  check (moderation_status in ('pendiente', 'aprobada', 'rechazada'));
alter table public.gallery_photos add column if not exists moderation_note text check (char_length(moderation_note) <= 300);

-- Notas privadas del dueño sobre cada cliente (el cliente se identifica por su teléfono)
create table if not exists public.customer_notes (
  business_id uuid not null references public.businesses(id) on delete cascade,
  phone text not null,
  note text check (char_length(note) <= 1000),
  tags text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (business_id, phone)
);

-- Si alguna de estas tablas ya existía con otra forma, se completan las columnas que falten
alter table public.reviews add column if not exists business_id uuid references public.businesses(id) on delete cascade;
alter table public.reviews add column if not exists appointment_id uuid references public.appointments(id) on delete cascade;
alter table public.reviews add column if not exists customer_name text not null default '';
alter table public.reviews add column if not exists rating smallint not null default 5 check (rating between 1 and 5);
alter table public.reviews add column if not exists comment text check (char_length(comment) <= 500);
alter table public.reviews add column if not exists reply text check (char_length(reply) <= 500);
alter table public.reviews add column if not exists hidden boolean not null default false;
alter table public.reviews add column if not exists created_at timestamptz not null default now();
alter table public.reviews add column if not exists updated_at timestamptz not null default now();
create unique index if not exists reviews_appointment_key on public.reviews (appointment_id);

alter table public.gallery_photos add column if not exists business_id uuid references public.businesses(id) on delete cascade;
alter table public.gallery_photos add column if not exists url text;
alter table public.gallery_photos add column if not exists caption text check (char_length(caption) <= 120);
alter table public.gallery_photos add column if not exists position int not null default 0;
alter table public.gallery_photos add column if not exists created_at timestamptz not null default now();

alter table public.customer_notes add column if not exists note text check (char_length(note) <= 1000);
alter table public.customer_notes add column if not exists tags text[] not null default '{}';
alter table public.customer_notes add column if not exists updated_at timestamptz not null default now();

-- Moneda: CUP, USD, o "CUP y USD" (usd_prices): los precios se ponen en USD y, con la tasa del día
-- (usd_rate = CUP por 1 USD), los clientes ven también su equivalente en CUP. Cada cita guarda la tasa
-- con la que se reservó, para que su precio en CUP no cambie después.
alter table public.businesses add column if not exists usd_prices boolean not null default false;
alter table public.businesses add column if not exists usd_rate numeric(10, 2) check (usd_rate > 0);
alter table public.appointments add column if not exists usd_rate numeric(10, 2);
-- La primera versión de "CUP y USD" (precio en CUP más un segundo precio a mano en USD) se sustituye
update public.businesses set usd_prices = false where usd_prices and currency <> 'USD';
alter table public.services drop column if exists price_usd;
alter table public.appointment_services drop column if exists price_usd;
alter table public.appointments drop column if exists total_usd;

-- Servicios complementarios: extras opcionales que el cliente añade a un servicio principal
alter table public.services add column if not exists is_extra boolean not null default false;

-- Foto de cada servicio (mismo almacén "logos", carpeta del negocio): ayuda a vender en la web
alter table public.services add column if not exists photo_url text;

-- Opciones de precio de un servicio (ej. Corte: Niño 500 · Adulto 800 · Con barba 1000). Todas duran
-- lo mismo; el cliente elige una al reservar. [{"id": "o1", "name": "Niño", "price": 500}, ...];
-- vacío = precio único. services.price guarda la más barata ("desde"). Ver services_guard.
alter table public.services add column if not exists options jsonb not null default '[]'::jsonb;
-- La opción elegida en cada cita (el nombre y el precio ya quedan copiados en name y price). Si
-- eligió varias, sus ids ordenados y separados por comas (ver _option_key).
alter table public.appointment_services add column if not exists option_id text;
-- El cliente puede elegir varias opciones del servicio a la vez (se suman los precios)
alter table public.services add column if not exists multi_options boolean not null default false;

-- Depósito opcional al reservar (protege de quienes no asisten). No hay pasarela de pago para
-- Cuba, así que es informativo: el cliente transfiere por su cuenta (Transfermóvil/EnZona) y manda
-- la captura por WhatsApp; el dueño confirma la cita como siempre (sigue quedando "pendiente").
alter table public.businesses add column if not exists deposit_enabled boolean not null default false;
alter table public.businesses add column if not exists deposit_amount numeric(10, 2) check (deposit_amount is null or deposit_amount >= 0);
alter table public.businesses add column if not exists deposit_instructions text check (char_length(deposit_instructions) <= 500);

-- Tarjeta de cliente fiel: mensaje informativo cada N visitas (el dueño cumple el premio a mano,
-- como con el depósito: no hay forma de aplicar descuentos automáticos a este nivel).
alter table public.businesses add column if not exists loyalty_enabled boolean not null default false;
alter table public.businesses add column if not exists loyalty_every int check (loyalty_every is null or loyalty_every between 2 and 50);
alter table public.businesses add column if not exists loyalty_reward text check (char_length(loyalty_reward) <= 160);

-- Negocios de cortesía: el administrador les regaló la app para siempre (ver admin_grant_free).
-- No cuentan como "pagando" ni sus pagos (si tuvieron alguno antes) se suman en las estadísticas.
alter table public.businesses add column if not exists comped boolean not null default false;
-- Cómo estaba antes de regalarla (plan y hasta cuándo había pagado), para poder deshacer la cortesía
-- exactamente (ver admin_revoke_free) si se regaló por error.
alter table public.businesses add column if not exists comped_prev_plan text;
alter table public.businesses add column if not exists comped_prev_paid_until timestamptz;

-- Políticas: reglas de reserva que personaliza el dueño, más un texto libre (columna "policies").
-- reschedule_notice_hours: plazo para cambiar (puede ser distinto de cancelar). max_reschedules:
-- veces que se puede cambiar una misma cita (null = sin límite). max_pending_bookings: citas futuras
-- que puede tener un mismo teléfono a la vez (antes era un 2 fijo en el código).
alter table public.businesses add column if not exists reschedule_notice_hours int not null default 6
  check (reschedule_notice_hours between 0 and 168);
alter table public.businesses add column if not exists max_reschedules int
  check (max_reschedules is null or max_reschedules between 1 and 20);
alter table public.businesses add column if not exists max_pending_bookings int not null default 2;
-- Ahora también admite "sin límite" (null); se separa el check para poder volver a ponerlo sin error
alter table public.businesses alter column max_pending_bookings drop not null;
alter table public.businesses drop constraint if exists businesses_max_pending_bookings_check;
alter table public.businesses add constraint businesses_max_pending_bookings_check
  check (max_pending_bookings is null or max_pending_bookings between 1 and 50);
-- Citas que puede CREAR un mismo teléfono en un día (antes un 3 fijo, aparte del límite de arriba;
-- compartían el mismo mensaje de error y eso confundía). Ahora también configurable y con su propio aviso.
alter table public.businesses add column if not exists max_daily_bookings int not null default 3;
alter table public.businesses alter column max_daily_bookings drop not null;
alter table public.businesses drop constraint if exists businesses_max_daily_bookings_check;
alter table public.businesses add constraint businesses_max_daily_bookings_check
  check (max_daily_bookings is null or max_daily_bookings between 1 and 50);
-- Se probó a tener un texto por tema (cancelaciones, cambios...) en vez de uno libre; se volvió
-- atrás, así que esa columna y su limpieza (_clean_policy_sections) ya no se usan.
alter table public.businesses drop column if exists policy_sections;
drop function if exists public._clean_policy_sections(jsonb);

-- Gastos del negocio (en su moneda), para ver la ganancia en las estadísticas
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  day date not null,
  amount numeric(10, 2) not null check (amount > 0),
  category text not null default 'Otros' check (char_length(category) between 1 and 40),
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now()
);
create index if not exists expenses_business_idx on public.expenses (business_id, day);

-- Lista de espera: clientes que quieren un hueco en un día lleno
create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  day date not null,
  customer_name text not null,
  customer_phone text not null,
  note text check (char_length(note) <= 300),
  status text not null default 'esperando' check (status in ('esperando', 'avisado', 'descartado')),
  created_at timestamptz not null default now()
);
create index if not exists waitlist_business_idx on public.waitlist (business_id, day);

-- Cupones de descuento: porcentaje o importe fijo (uno de los dos)
create table if not exists public.discounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9-]{3,20}$'),
  percent int check (percent between 1 and 100),
  amount numeric(10, 2) check (amount > 0),
  active boolean not null default true,
  valid_until date,
  max_uses int check (max_uses > 0),
  uses int not null default 0,
  created_at timestamptz not null default now(),
  check ((percent is null) <> (amount is null)),
  unique (business_id, code)
);

-- Bonos (paquetes de sesiones prepagadas, ej. "5 cortes por el precio de 4"). No hay pasarela de
-- pago, así que es como el depósito: el dueño vende el bono a mano (cobra por su cuenta) y lo
-- registra aquí; cuando el cliente viene, el dueño descuenta una sesión él mismo.
create table if not exists public.packages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 60),
  sessions int not null check (sessions between 2 and 100),
  price numeric(10, 2) not null default 0 check (price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists packages_business_idx on public.packages (business_id);

-- Un bono vendido a un cliente concreto. Guarda su propio nombre/total (independiente de
-- "packages", por si el dueño cambia o borra el tipo de bono después de venderlo).
create table if not exists public.customer_packages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  package_id uuid references public.packages(id) on delete set null,
  customer_phone text not null,
  package_name text not null,
  sessions_total int not null check (sessions_total > 0),
  sessions_left int not null check (sessions_left >= 0 and sessions_left <= sessions_total),
  note text check (char_length(note) <= 200),
  sold_at timestamptz not null default now()
);
create index if not exists customer_packages_idx on public.customer_packages (business_id, customer_phone);

-- Fase 3 en las citas: cupón aplicado y recordatorio enviado
alter table public.appointments add column if not exists discount_code text;
alter table public.appointments add column if not exists discount numeric(10, 2) not null default 0;
alter table public.appointments add column if not exists reminded_at timestamptz;

-- Profesionales del negocio (empleados). Cada uno tiene su propia agenda.
create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 60),
  active boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists staff_business_idx on public.staff (business_id, position);

-- Foto de cada profesional (se guarda en el mismo almacén "logos", carpeta del negocio)
alter table public.staff add column if not exists photo_url text;

-- Enlace privado de cada profesional (versión 1.4): con él, la propia trabajadora cambia sus
-- servicios y su horario, sin cuenta ni contraseña. Lo crea y lo anula el dueño (owner_staff_link);
-- todo lo que se hace con él pasa por las funciones staff_portal_* (sección 5).
alter table public.staff add column if not exists edit_token text unique;
-- Servicios propios (versión 1.4): true = solo hace los servicios que tiene en staff_services (al
-- empezar, ninguno: los crea con su enlace). false = como antes: sin ninguno marcado, hace todos.
alter table public.staff add column if not exists own_services boolean not null default false;
-- Especialidad (ej. "Uñas", "Pestañas"): en la página de reservas, los servicios de cada profesional
-- salen agrupados bajo su especialidad. La pone el dueño (Equipo) o ella misma con su enlace.
alter table public.staff add column if not exists specialty text check (char_length(specialty) <= 40);
-- El dueño también atiende: sus servicios (los que no son de nadie del equipo) salen con su nombre
-- y su especialidad, igual que los de cada profesional
alter table public.businesses add column if not exists owner_name text check (char_length(owner_name) <= 40);
alter table public.businesses add column if not exists owner_specialty text check (char_length(owner_specialty) <= 40);
-- Servicios que se ocultaron solos porque la profesional que los hacía dejó el equipo (se desactivó):
-- si vuelve, se muestran otra vez (ver _staff_hide_services)
alter table public.services add column if not exists hidden_with_staff uuid;
-- El plan que eligió al declarar el pago (Solo o Equipo). Las declaraciones antiguas, Solo.
alter table public.payment_claims add column if not exists plan text not null default 'basico'
  check (plan in ('basico', 'ultra'));

-- Moneda de la mensualidad: CUP en Cuba, USD en la versión internacional (según businesses.market al
-- pagar). Los pagos de antes son en CUP. Las cuentas nunca suman CUP con USD (ver admin_stats).
alter table public.payments add column if not exists currency text not null default 'CUP'
  check (currency in ('CUP', 'USD'));
alter table public.payment_claims add column if not exists currency text not null default 'CUP'
  check (currency in ('CUP', 'USD'));

-- Pagos en línea (versión internacional): cada intento de pago con PayPal. Los crea y los completa
-- solo la función paypal-checkout (con la clave de servicio): nadie más los lee ni los escribe.
--   status: 'creada' (abrió PayPal), 'pagada' (PayPal confirmó el cobro y se sumaron los meses)
create table if not exists public.online_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete set null,
  provider text not null default 'paypal' check (provider in ('paypal')),
  provider_order_id text not null unique,
  plan text not null check (plan in ('basico', 'ultra')),
  months int not null check (months between 1 and 24),
  amount numeric(10, 2) not null check (amount > 0),
  currency text not null default 'USD' check (currency in ('USD')),
  status text not null default 'creada' check (status in ('creada', 'pagada')),
  capture_id text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists online_orders_business_idx on public.online_orders (business_id, created_at desc);
alter table public.online_orders enable row level security;

-- Horario propio de un profesional (si no tiene ninguna fila aquí, usa el horario del negocio:
-- ver _staff_slot_valid). Misma forma que schedule_days, pero por profesional.
create table if not exists public.staff_schedule_days (
  staff_id uuid not null references public.staff(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  is_open boolean not null default true,
  slots time[] not null default '{}',
  primary key (staff_id, weekday)
);

-- Qué servicios hace cada profesional (si no tiene ninguna fila aquí, puede con todos: ver
-- _staff_can_do). Así no se puede reservar, por ejemplo, uñas con el barbero.
create table if not exists public.staff_services (
  staff_id uuid not null references public.staff(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  primary key (staff_id, service_id)
);

-- Con quién es cada cita (null = negocio sin profesionales)
alter table public.appointments add column if not exists staff_id uuid references public.staff(id) on delete set null;
create index if not exists appointments_staff_idx on public.appointments (staff_id, starts_at);

-- Clientes a la vez: cuántas citas sin profesional pueden coincidir a la misma hora (ej. un salón
-- con 3 manicuras). Cada cita ocupa una "silla" (lane, de 0 a slot_capacity - 1); cada profesional
-- del Equipo es una sola silla.
alter table public.businesses add column if not exists slot_capacity int not null default 1
  check (slot_capacity between 1 and 50);
alter table public.appointments add column if not exists lane smallint not null default 0;

-- Primeros pasos y modo sencillo del panel (versión 1.4). Lo escribe el propio dueño desde su panel
-- (lo limpia businesses_guard):
--   tools     herramientas que se ven en "Más" (ej. ["recordatorios","opiniones","estadisticas"])
--   skipped   pasos que saltó al crear su app ("moneda", "servicios", "horario")
--   steps     cuándo hizo cada primer paso: {"precios": "2026-11-16T10:00:00Z", "ver": ..., "prueba": ..., "compartir": ...}
--   tutorial  cuándo terminó el tutorial
--   all_done  ya vio "¡Todo listo!" en Primeros pasos (la tarjeta deja de salir)
alter table public.businesses add column if not exists onboarding jsonb not null default '{}'::jsonb;

-- A los negocios que aún no tienen herramientas elegidas se les dejan las tres de siempre y las que
-- ya usan (así al actualizar nadie pierde de vista nada de lo que usa)
update public.businesses b set onboarding = b.onboarding || jsonb_build_object('tools', to_jsonb(array_remove(array[
    'recordatorios', 'opiniones', 'estadisticas',
    case when exists (select 1 from public.waitlist x where x.business_id = b.id) then 'espera' end,
    case when exists (select 1 from public.discounts x where x.business_id = b.id) then 'cupones' end,
    case when exists (select 1 from public.packages x where x.business_id = b.id) then 'bonos' end,
    case when exists (select 1 from public.gallery_photos x where x.business_id = b.id) then 'galeria' end,
    case when exists (select 1 from public.expenses x where x.business_id = b.id) then 'gastos' end
  ], null)))
where not (b.onboarding ? 'tools');

-- Dos citas activas no se solapan en la misma silla del mismo profesional (las citas sin profesional
-- comparten las sillas del negocio)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'appointments_no_overlap_lane') then
    alter table public.appointments drop constraint if exists appointments_no_overlap;
    alter table public.appointments drop constraint if exists appointments_no_overlap_staff;
    alter table public.appointments add constraint appointments_no_overlap_lane exclude using gist (
      business_id with =,
      (coalesce(staff_id, '00000000-0000-0000-0000-000000000000'::uuid)) with =,
      lane with =,
      tstzrange(starts_at, ends_at) with &&
    ) where (status <> 'cancelada');
  end if;
end;
$$;

-- Suscripciones a notificaciones push (Web Push): una fila por dispositivo/navegador.
-- kind = 'owner' (dueño del negocio, para citas nuevas/canceladas/cambiadas por el cliente) o
-- 'customer' (cliente de una cita concreta, para avisos de esa cita y recordatorios).
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  kind text not null check (kind in ('owner', 'customer')),
  appointment_id uuid references public.appointments(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_owner_idx on public.push_subscriptions (business_id) where kind = 'owner';
create index if not exists push_subscriptions_appt_idx on public.push_subscriptions (appointment_id) where kind = 'customer';
alter table public.push_subscriptions enable row level security;
-- Sin políticas para anon/authenticated: solo se gestiona por las funciones de abajo (con sus propios
-- controles) y la función de notificaciones las lee con la clave de servicio, sin pasar por RLS.

-- Avisos push para el administrador de la plataforma (ej. negocio nuevo registrado). Aparte de
-- push_subscriptions porque el administrador no tiene business_id (no es dueño de un negocio).
create table if not exists public.admin_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.admin_push_subscriptions enable row level security;
-- Sin políticas para anon/authenticated: igual que push_subscriptions, solo por funciones.

-- Medición de visitas para las estadísticas del administrador (ver src/lib/analytics.ts). Anónima:
-- sin cookies, sin IP ni datos personales; cada visitante es un número aleatorio que guarda su
-- navegador. Se escribe solo con track_event y se lee solo con admin_traffic.
--   visita          una página vista (page: portada, crear, entrar, negocio, reservar; slug del negocio)
--   crear_paso      un paso del asistente de crear la app (step: 0 = tipo ... 5 = cuenta)
--   negocio_creado  terminó de crear su app
--   reserva_hecha   un cliente reservó desde la web de un negocio (slug)
create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  visitor_id uuid not null,
  session_id uuid not null,
  name text not null,
  page text check (char_length(page) <= 30),
  slug text check (char_length(slug) <= 60),
  step smallint check (step between 0 and 20),
  source text check (char_length(source) <= 30),
  device text check (device in ('movil', 'ordenador')),
  created_at timestamptz not null default now()
);
create index if not exists analytics_events_time_idx on public.analytics_events (created_at);
create index if not exists analytics_events_visitor_idx on public.analytics_events (visitor_id, created_at);
create index if not exists analytics_events_slug_idx on public.analytics_events (slug, created_at) where slug is not null;
alter table public.analytics_events enable row level security;
-- Los nombres de evento válidos (paso_saltado: saltó un paso del asistente, con su número en step).
-- Se rehace la regla para poder añadir nombres nuevos sin tocar los datos.
alter table public.analytics_events drop constraint if exists analytics_events_name_check;
alter table public.analytics_events add constraint analytics_events_name_check
  check (name in ('visita', 'crear_paso', 'negocio_creado', 'reserva_hecha', 'paso_saltado'));
-- Sin políticas: nadie la lee ni la escribe directamente.

-- Encuestas a los dueños: el administrador pregunta (ej. "¿Te está gustando Citora?") y cada negocio
-- responde una vez desde su panel. Sin políticas: todo pasa por las funciones de las secciones 6 y 7.
-- questions: [{ "id": "p1", "type": "estrellas" | "si_no" | "texto", "text": "..." }] (ver _clean_survey_questions)
create table if not exists public.owner_surveys (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 80),
  intro text check (char_length(intro) <= 300),
  questions jsonb not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.owner_surveys enable row level security;
-- A quién va: null = a todos los negocios; si no, solo a estos (ver admin_create_survey)
alter table public.owner_surveys add column if not exists business_ids uuid[];

-- answers: { "p1": 5, "p2": true, "p3": "texto" } (ver submit_survey_answer)
create table if not exists public.owner_survey_answers (
  survey_id uuid not null references public.owner_surveys(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  answers jsonb not null,
  created_at timestamptz not null default now(),
  primary key (survey_id, business_id)
);
alter table public.owner_survey_answers enable row level security;

-- ---------------------------------------------------------------------
-- 2. FUNCIONES DE APOYO
-- ---------------------------------------------------------------------

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;

-- Plan que se aplica ahora: el pagado si está vigente, 'ultra' durante la prueba, o null (inhabilitado)
create or replace function public.business_effective_plan(p_plan text, p_trial timestamptz, p_paid timestamptz)
returns text language sql stable set search_path = public as $$
  select case
    when p_paid is not null and p_paid > now() and p_plan is not null then p_plan
    when p_trial > now() then 'ultra'
    else null
  end;
$$;

create or replace function public.business_status(p_plan text, p_trial timestamptz, p_paid timestamptz)
returns text language sql stable set search_path = public as $$
  select case
    when p_paid is not null and p_paid > now() and p_plan is not null then 'activo'
    when p_trial > now() then 'prueba'
    else 'vencido'
  end;
$$;

-- Hay un solo plan con todo incluido: cualquier negocio activo (pagando o en prueba) tiene todo.
-- (p_module se mantiene por si en el futuro vuelve a haber varios planes.)
create or replace function public.plan_has(p_plan text, p_module text)
returns boolean language sql immutable as $$
  -- Con un plan activo se tiene todo; el equipo (varios profesionales), solo con Equipo ('ultra')
  select p_plan is not null and (p_module <> 'empleados' or p_plan = 'ultra');
$$;

-- Una cita "hecha": marcada como completada, o ya pasada sin que el dueño la marcara
create or replace function public._appt_done(p_status text, p_ends timestamptz)
returns boolean language sql stable as $$
  select p_status = 'completada' or (p_status in ('pendiente', 'confirmada') and p_ends < now());
$$;

create or replace function public.my_business_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from businesses where owner_id = auth.uid();
$$;

create or replace function public.my_business_active()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select business_effective_plan(plan, trial_ends_at, paid_until) is not null
       from businesses where owner_id = auth.uid()),
    false);
$$;

create or replace function public.my_plan_has(p_module text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select plan_has(business_effective_plan(plan, trial_ends_at, paid_until), p_module)
       from businesses where owner_id = auth.uid()),
    false);
$$;

create or replace function public.is_reserved_slug(p_slug text)
returns boolean language sql immutable as $$
  select p_slug = any (array[
    'crear', 'entrar', 'panel', 'admin', 'restablecer', 'assets', 'citora', 'api', 'app',
    'www', 'ayuda', 'planes', 'precios', 'login', 'registro', 'soporte', 'terminos', 'privacidad'
  ]);
$$;

create or replace function public.is_valid_slug(p_slug text)
returns boolean language sql immutable as $$
  select p_slug ~ '^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$'
     and p_slug !~ '--'
     and not public.is_reserved_slug(p_slug);
$$;

create or replace function public.check_slug_available(p_slug text)
returns boolean language sql stable security definer set search_path = public as $$
  select is_valid_slug(lower(p_slug))
     and not exists (select 1 from businesses where slug = lower(p_slug));
$$;

-- ¿Es una zona horaria que conoce la base de datos (ej. 'America/Havana', 'Europe/Madrid')?
create or replace function public._is_valid_timezone(p_tz text)
returns boolean language sql stable set search_path = public as $$
  select exists (select 1 from pg_timezone_names where name = p_tz);
$$;

-- Deja solo las opciones conocidas y con valores válidos. Lo que no cumple, se descarta.
create or replace function public._clean_appearance(p jsonb)
returns jsonb language plpgsql immutable as $$
declare
  r jsonb := '{}'::jsonb;
  k text;
  v text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return r; end if;

  v := p ->> 'font';
  if v in ('inter', 'poppins', 'montserrat', 'playfair', 'nunito') then r := r || jsonb_build_object('font', v); end if;
  v := p ->> 'buttons';
  if v in ('rounded', 'square', 'pill') then r := r || jsonb_build_object('buttons', v); end if;
  v := p ->> 'cover_style';
  if v in ('color', 'image', 'gradient') then r := r || jsonb_build_object('cover_style', v); end if;
  v := p ->> 'page_bg';
  if v in ('gray', 'white', 'tinted') then r := r || jsonb_build_object('page_bg', v); end if;

  -- Degradado: segundo color y dirección
  v := p ->> 'color2';
  if v ~ '^#[0-9a-fA-F]{6}$' then r := r || jsonb_build_object('color2', lower(v)); end if;
  v := p ->> 'gradient_angle';
  if v in ('45', '90', '135', '180') then r := r || jsonb_build_object('gradient_angle', v::int); end if;

  -- Textos libres (se muestran como texto, nunca como HTML)
  foreach k in array array['announcement', 'book_label', 'thanks_message', 'tagline'] loop
    v := nullif(btrim(coalesce(p ->> k, '')), '');
    if v is not null then
      r := r || jsonb_build_object(k, left(v, case k when 'book_label' then 30 when 'tagline' then 80
                                                   when 'announcement' then 160 else 300 end));
    end if;
  end loop;

  -- Qué se muestra en la web (por defecto, todo)
  foreach k in array array['show_prices', 'show_durations', 'show_gallery', 'show_reviews', 'show_hours', 'gradient_buttons'] loop
    if jsonb_typeof(p -> k) = 'boolean' then r := r || jsonb_build_object(k, (p ->> k)::boolean); end if;
  end loop;

  -- Redes: solo el nombre de usuario (el enlace lo arma la app)
  foreach k in array array['instagram', 'facebook', 'tiktok'] loop
    v := regexp_replace(btrim(coalesce(p ->> k, '')), '^@', '');
    if v ~ '^[A-Za-z0-9._-]{1,50}$' then r := r || jsonb_build_object(k, v); end if;
  end loop;

  -- Enlace de mapa: solo https
  v := btrim(coalesce(p ->> 'maps_url', ''));
  -- (Postgres no admite repeticiones de más de 255 en una expresión: la longitud se mira aparte)
  if v ~ '^https://[^\s"<>]+$' and char_length(v) between 12 and 300 then
    r := r || jsonb_build_object('maps_url', v);
  end if;

  return r;
end;
$$;

-- Manda un aviso push (si está configurada la función: ver platform_settings e instrucciones de
-- despliegue). Nunca lanza error: un fallo al avisar no debe romper una reserva.
-- Texto en el idioma del negocio (ver businesses.lang): _l(lang, 'en español', 'in English')
create or replace function public._l(p_lang text, p_es text, p_en text)
returns text language sql immutable as $$
  select case when p_lang = 'en' then p_en else p_es end;
$$;

create or replace function public._notify_push(p_business uuid, p_kind text, p_appointment uuid, p_title text, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_url text;
  v_secret text;
begin
  select push_function_url, push_shared_secret into v_url, v_secret from platform_settings where id = 1;
  if v_url is null or btrim(v_url) = '' then return; end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('business_id', p_business, 'kind', p_kind, 'appointment_id', p_appointment,
                                'title', p_title, 'body', p_body),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', coalesce(v_secret, '')),
    timeout_milliseconds := 5000
  );
exception when others then
  null;
end;
$$;

-- Avisa a la función de moderación de fotos (ver moderate-photo) de que hay una foto nueva que
-- revisar. Igual que _notify_push: si no está configurada, no pasa nada (la foto queda pendiente;
-- ver _approve_unmoderated_photos para el respaldo si la función nunca llega a avisar).
create or replace function public._notify_moderation(p_photo uuid, p_url text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_url text;
  v_secret text;
begin
  select moderate_function_url, push_shared_secret into v_url, v_secret from platform_settings where id = 1;
  if v_url is null or btrim(v_url) = '' then return; end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('photo_id', p_photo, 'url', p_url),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', coalesce(v_secret, '')),
    timeout_milliseconds := 5000
  );
exception when others then
  null;
end;
$$;

-- Avisa a ti (administrador) de algo importante en la plataforma (ej. negocio nuevo). Igual que
-- _notify_push: si no está configurada la función, no pasa nada.
create or replace function public._notify_admin_push(p_title text, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_url text;
  v_secret text;
begin
  select push_function_url, push_shared_secret into v_url, v_secret from platform_settings where id = 1;
  if v_url is null or btrim(v_url) = '' then return; end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('kind', 'admin', 'business_id', null, 'appointment_id', null,
                                'title', p_title, 'body', p_body),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', coalesce(v_secret, '')),
    timeout_milliseconds := 5000
  );
exception when others then
  null;
end;
$$;

-- Respaldo si moderate-photo no está configurada o no pudo revisar una foto (Sightengine caído,
-- etc.). Se llama una vez por hora (ver tarea programada en la sección 3):
--   1. Las fotos pendientes de más de una hora se vuelven a mandar a revisar (como mucho 20 por
--      vez), así un fallo puntual no deja una foto sin revisar.
--   2. Si después de un día sigue sin poder revisarse, se aprueba sola (para que la galería de un
--      negocio no se quede rota para siempre) y se te avisa para que le eches un vistazo.
create or replace function public._approve_unmoderated_photos()
returns void language plpgsql security definer set search_path = public as $$
declare
  p record;
  v_count int;
begin
  if exists (select 1 from platform_settings where id = 1 and coalesce(btrim(moderate_function_url), '') <> '') then
    for p in
      select id, url from gallery_photos
      where moderation_status = 'pendiente'
        and created_at < now() - interval '1 hour' and created_at >= now() - interval '1 day'
      order by created_at
      limit 20
    loop
      perform _notify_moderation(p.id, p.url);
    end loop;
  end if;

  update gallery_photos set moderation_status = 'aprobada'
  where moderation_status = 'pendiente' and created_at < now() - interval '1 day';
  get diagnostics v_count = row_count;
  if v_count > 0 and exists (select 1 from platform_settings where id = 1 and coalesce(btrim(moderate_function_url), '') <> '') then
    perform _notify_admin_push('Fotos aprobadas sin revisar',
      v_count || case when v_count = 1 then ' foto de galería se aprobó sola' else ' fotos de galería se aprobaron solas' end ||
      ' porque la revisión automática no respondió en un día. Revisa moderate-photo.');
  end if;
end;
$$;

-- Aviso a los clientes con cita mañana que hayan aceptado notificaciones. Se llama cada hora (ver
-- tarea programada en la sección 3) y a cada negocio le toca cuando en su zona horaria son las 18:00:
-- así llega a buena hora en Cuba, en España o donde esté.
create or replace function public._send_daily_reminders()
returns void language plpgsql security definer set search_path = public as $$
declare
  a record;
begin
  for a in
    select ap.id, ap.business_id, ap.customer_name, b.name, b.lang, to_char(ap.starts_at at time zone b.timezone, 'HH12:MI AM') as hora
    from appointments ap join businesses b on b.id = ap.business_id
    where ap.status in ('pendiente', 'confirmada')
      and extract(hour from now() at time zone b.timezone) = 18
      and (ap.starts_at at time zone b.timezone)::date = ((now() at time zone b.timezone)::date + 1)
      and exists (select 1 from push_subscriptions ps where ps.kind = 'customer' and ps.appointment_id = ap.id)
  loop
    perform _notify_push(a.business_id, 'customer', a.id, _l(a.lang, 'Recuerda tu cita mañana', 'Reminder: your appointment is tomorrow'),
      _l(a.lang, a.name || ' te espera a las ' || a.hora, a.name || ' is expecting you at ' || a.hora));
  end loop;
end;
$$;

-- Marca sola "No vino" en las citas que ya pasaron hace rato y el dueño nunca confirmó que el
-- cliente vino (ni la canceló). Así las estadísticas de ausencias no dependen de que el dueño se
-- acuerde de tocar el botón. Se llama una vez por hora (ver tarea programada en la sección 3).
create or replace function public._auto_mark_no_shows()
returns void language sql security definer set search_path = public as $$
  update appointments set status = 'no_asistio'
  where status in ('pendiente', 'confirmada') and ends_at < now() - interval '3 hours';
$$;

-- Título y texto del aviso de que se acaba la prueba gratis o la mensualidad, según los días que
-- faltan contados en la zona horaria del negocio: {título, texto}.
create or replace function public._expiry_push_text(p_status text, p_expires timestamptz, p_tz text, p_name text,
                                                    p_now timestamptz default now())
returns text[] language plpgsql stable set search_path = public as $$
declare
  v_days int := (p_expires at time zone p_tz)::date - (p_now at time zone p_tz)::date;
  v_when text := case v_days when 0 then 'hoy' when 1 then 'mañana' else 'en ' || v_days || ' días' end;
  v_day text := case when v_days <= 1 then v_when || ' a las ' || to_char(p_expires at time zone p_tz, 'HH24:MI')
                     else 'el ' || to_char(p_expires at time zone p_tz, 'DD/MM') end;
begin
  if p_status = 'prueba' then
    return array[
      case when v_days >= 2 then 'Te quedan ' || v_days || ' días de prueba gratis'
           else initcap(v_when) || ' termina tu prueba gratis' end,
      'Tu prueba gratis termina ' || v_day || '. Suscríbete en Más → Mensualidad para que tus clientes '
        || 'sigan reservando en ' || p_name || '. Si no, tu app se borra 5 días después.'];
  end if;
  return array[
    case when v_days >= 2 then 'Tu mensualidad vence en ' || v_days || ' días'
         else initcap(v_when) || ' vence tu mensualidad' end,
    'Vence ' || v_day || '. Paga en Más → Mensualidad para que tus clientes sigan reservando en ' || p_name || '.'];
end;
$$;

-- El mismo aviso en inglés (negocios de la versión internacional que usan el panel en inglés)
create or replace function public._expiry_push_text_en(p_status text, p_expires timestamptz, p_tz text, p_name text,
                                                       p_now timestamptz default now())
returns text[] language plpgsql stable set search_path = public as $$
declare
  v_days int := (p_expires at time zone p_tz)::date - (p_now at time zone p_tz)::date;
  v_when text := case v_days when 0 then 'today' when 1 then 'tomorrow' else 'in ' || v_days || ' days' end;
  v_day text := case when v_days <= 1 then v_when || ' at ' || to_char(p_expires at time zone p_tz, 'HH12:MI AM')
                     else 'on ' || to_char(p_expires at time zone p_tz, 'MM/DD') end;
begin
  if p_status = 'prueba' then
    return array[
      case when v_days >= 2 then v_days || ' days left in your free trial'
           else 'Your free trial ends ' || v_when end,
      'Your free trial ends ' || v_day || '. Subscribe in More → Monthly fee so your clients can keep '
        || 'booking at ' || p_name || '. Otherwise, your app will be deleted 5 days later.'];
  end if;
  return array[
    case when v_days >= 2 then 'Your monthly fee expires in ' || v_days || ' days'
         else 'Your monthly fee expires ' || v_when end,
    'It expires ' || v_day || '. Pay in More → Monthly fee so your clients can keep booking at ' || p_name || '.'];
end;
$$;

-- Avisa al dueño (push) cada día de los 3 últimos de su prueba gratis o de su mensualidad pagada,
-- para que se suscriba a tiempo. Se llama cada hora y a cada negocio le toca a las 9:00 de su zona
-- horaria. A quien no tiene los avisos puestos le escribe el administrador desde Estadísticas.
create or replace function public._send_expiry_reminders()
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_text text[];
begin
  for r in
    select b.id, b.name, b.timezone, b.lang, business_status(b.plan, b.trial_ends_at, b.paid_until) as st,
      case when business_status(b.plan, b.trial_ends_at, b.paid_until) = 'activo' then b.paid_until else b.trial_ends_at end as expires_at
    from businesses b
    where business_effective_plan(b.plan, b.trial_ends_at, b.paid_until) is not null
      and extract(hour from now() at time zone b.timezone) = 9
  loop
    if r.expires_at between now() and now() + interval '3 days' then
      v_text := case when r.lang = 'en' then _expiry_push_text_en(r.st, r.expires_at, r.timezone, r.name)
                     else _expiry_push_text(r.st, r.expires_at, r.timezone, r.name) end;
      perform _notify_push(r.id, 'owner', null, v_text[1], v_text[2]);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. DISPARADORES (triggers)
-- ---------------------------------------------------------------------

-- Protege los campos que solo puede tocar el administrador
-- Teléfono de Cuba: 8 cifras sin el código (5xxx xxxx móviles, 7xxx xxxx fijos…) o con el 53
-- delante. Igual que isCubanPhone en src/lib/market.ts.
create or replace function public._is_cuban_phone(p text)
returns boolean language sql immutable as $$
  select regexp_replace(coalesce(p, ''), '\D', '', 'g') ~ '^(53)?[2-7][0-9]{7}$';
$$;

create or replace function public.businesses_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  new.slug := lower(new.slug);
  if not is_valid_slug(new.slug) then
    raise exception 'ENLACE_INVALIDO';
  end if;
  new.appearance := _clean_appearance(new.appearance);
  -- CUP y USD en Cuba. Los negocios de la versión internacional no usan pesos cubanos: USD o su
  -- moneda local (igual que INT_CURRENCIES en src/lib/format.ts), y nunca "USD y CUP"
  if new.market = 'int' then
    new.usd_prices := false;
    if new.currency not in ('USD', 'EUR', 'MXN', 'COP', 'ARS', 'CLP', 'PEN', 'UYU', 'DOP', 'BRL', 'CAD', 'GBP') then
      new.currency := 'USD';
    end if;
  elsif new.currency not in ('CUP', 'USD') then
    new.currency := 'CUP';
  end if;
  if new.usd_prices then
    new.currency := 'USD';
  end if;
  if new.cover_url is not null and new.cover_url !~ '^https://' then
    new.cover_url := null;
  end if;
  -- Primeros pasos: un objeto pequeño; si no, se deja como estaba
  if new.onboarding is null or jsonb_typeof(new.onboarding) <> 'object' or pg_column_size(new.onboarding) > 4000 then
    new.onboarding := case when tg_op = 'UPDATE' then old.onboarding else '{}'::jsonb end;
  end if;
  if tg_op = 'INSERT' then
    if not _is_valid_timezone(new.timezone) then raise exception 'ZONA_INVALIDA'; end if;
  elsif new.timezone is distinct from old.timezone and not _is_valid_timezone(new.timezone) then
    raise exception 'ZONA_INVALIDA';
  end if;
  if tg_op = 'UPDATE' and not is_platform_admin() and current_user in ('authenticated', 'anon') then
    -- La zona horaria la cambia el administrador (admin_set_timezone), que además ajusta las citas
    new.timezone := old.timezone;
    new.owner_id := old.owner_id;
    new.code := old.code;
    new.plan := old.plan;
    new.paid_until := old.paid_until;
    new.trial_ends_at := old.trial_ends_at;
    new.created_at := old.created_at;
    new.comped := old.comped;
    new.comped_prev_plan := old.comped_prev_plan;
    new.comped_prev_paid_until := old.comped_prev_paid_until;
    new.market := old.market;
  end if;
  -- Los negocios de Cuba tienen WhatsApp de Cuba (los de fuera usan la versión internacional, con
  -- su propio precio). Se mira al crear y cuando el dueño cambia el número; el administrador no.
  if new.market = 'cu' and new.whatsapp <> '' and not _is_cuban_phone(new.whatsapp)
     and (tg_op = 'INSERT' or (new.whatsapp is distinct from old.whatsapp and not is_platform_admin())) then
    raise exception 'WHATSAPP_NO_CUBANO';
  end if;
  return new;
end;
$$;
drop trigger if exists businesses_guard on public.businesses;
create trigger businesses_guard before insert or update on public.businesses
  for each row execute function public.businesses_guard();

-- Ordena y quita duplicados de los turnos
create or replace function public.schedule_days_normalize()
returns trigger language plpgsql as $$
begin
  new.slots := coalesce((select array_agg(distinct s order by s) from unnest(new.slots) s), '{}');
  return new;
end;
$$;
drop trigger if exists schedule_days_normalize on public.schedule_days;
create trigger schedule_days_normalize before insert or update on public.schedule_days
  for each row execute function public.schedule_days_normalize();

-- Igual que arriba, pero para el horario de cada profesional
create or replace function public.staff_schedule_days_normalize()
returns trigger language plpgsql as $$
begin
  new.slots := coalesce((select array_agg(distinct s order by s) from unnest(new.slots) s), '{}');
  return new;
end;
$$;
drop trigger if exists staff_schedule_days_normalize on public.staff_schedule_days;
create trigger staff_schedule_days_normalize before insert or update on public.staff_schedule_days
  for each row execute function public.staff_schedule_days_normalize();

-- El profesional y el servicio deben ser del mismo negocio (la RLS de arriba solo exige que el
-- profesional sea tuyo; esto evita enlazar un servicio de otro negocio).
create or replace function public.staff_services_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if (select business_id from staff where id = new.staff_id) <> (select business_id from services where id = new.service_id) then
    raise exception 'SERVICIOS_INVALIDOS';
  end if;
  return new;
end;
$$;
-- Limpia las opciones de precio que guarda el dueño: de 2 a 12, con nombre (1 a 40 letras) y precio.
-- Cada opción conserva su id al editarla (las citas lo guardan); las nuevas reciben el siguiente.
-- El precio del servicio pasa a ser el de la opción más barata.
create or replace function public.services_guard()
returns trigger language plpgsql set search_path = public as $$
declare
  o jsonb;
  v_out jsonb := '[]'::jsonb;
  v_ids text[] := '{}';
  v_next int;
  v_id text;
  v_name text;
  v_price numeric;
begin
  if new.options is null or jsonb_typeof(new.options) <> 'array' then new.options := '[]'::jsonb; end if;
  if jsonb_array_length(new.options) = 0 then return new; end if;
  if jsonb_array_length(new.options) not between 2 and 12 then raise exception 'OPCIONES_INVALIDAS'; end if;
  select coalesce(max(substring(x->>'id' from '^o([0-9]{1,4})$')::int), 0) + 1 into v_next
    from jsonb_array_elements(new.options) x;
  for o in select x from jsonb_array_elements(new.options) x loop
    v_name := btrim(coalesce(o->>'name', ''));
    begin
      v_price := (o->>'price')::numeric;
    exception when others then
      v_price := null;
    end;
    if char_length(v_name) not between 1 and 40 or v_price is null or v_price < 0 or v_price > 99999999 then
      raise exception 'OPCIONES_INVALIDAS';
    end if;
    v_id := o->>'id';
    if v_id is null or v_id !~ '^o[0-9]{1,4}$' or v_id = any (v_ids) then
      v_id := 'o' || v_next;
      v_next := v_next + 1;
    end if;
    v_ids := v_ids || v_id;
    v_out := v_out || jsonb_build_object('id', v_id, 'name', v_name, 'price', round(v_price, 2));
  end loop;
  new.options := v_out;
  new.price := (select min((x->>'price')::numeric) from jsonb_array_elements(v_out) x);
  return new;
end;
$$;
drop trigger if exists services_guard on public.services;
create trigger services_guard before insert or update on public.services
  for each row execute function public.services_guard();

drop trigger if exists staff_services_guard on public.staff_services;
create trigger staff_services_guard before insert or update on public.staff_services
  for each row execute function public.staff_services_guard();

-- Cuando una profesional deja el equipo (se desactiva o se borra), sus servicios propios (los que
-- solo hace ella) se ocultan: si no, pasarían a salir como del dueño y se podrían reservar con él.
-- Si se vuelve a activar, se muestran otra vez.
create or replace function public._staff_hide_services()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := coalesce(new.id, old.id);
begin
  begin
    if tg_op = 'DELETE' or (old.active and not new.active) then
      update services s set active = false, hidden_with_staff = v_id
       where s.active
         and exists (select 1 from staff_services ss where ss.service_id = s.id and ss.staff_id = v_id)
         and not exists (select 1 from staff_services ss join staff o on o.id = ss.staff_id
                          where ss.service_id = s.id and ss.staff_id <> v_id and o.active);
    elsif not old.active and new.active then
      update services set active = true, hidden_with_staff = null where hidden_with_staff = v_id;
    end if;
  exception when others then
    -- Al borrar un negocio entero no hay nada que ocultar
    null;
  end;
  return coalesce(new, old);
end;
$$;
drop trigger if exists staff_hide_services on public.staff;
create trigger staff_hide_services before delete or update of active on public.staff
  for each row execute function public._staff_hide_services();

-- ---------------------------------------------------------------------
-- 4. SEGURIDAD (RLS)
-- ---------------------------------------------------------------------

alter table public.platform_admins enable row level security;
alter table public.platform_settings enable row level security;
alter table public.businesses enable row level security;
alter table public.services enable row level security;
alter table public.schedule_days enable row level security;
alter table public.closed_days enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_services enable row level security;
alter table public.payments enable row level security;

-- platform_admins: cada uno ve solo su fila
drop policy if exists admins_self on public.platform_admins;
create policy admins_self on public.platform_admins for select to authenticated
  using (user_id = auth.uid());

-- platform_settings: solo el administrador (los dueños usan get_payment_info)
drop policy if exists settings_admin_all on public.platform_settings;
create policy settings_admin_all on public.platform_settings for all to authenticated
  using (is_platform_admin()) with check (is_platform_admin());

-- businesses
drop policy if exists businesses_owner_select on public.businesses;
create policy businesses_owner_select on public.businesses for select to authenticated
  using (owner_id = auth.uid() or is_platform_admin());
drop policy if exists businesses_owner_update on public.businesses;
create policy businesses_owner_update on public.businesses for update to authenticated
  using (owner_id = auth.uid() or is_platform_admin())
  with check (owner_id = auth.uid() or is_platform_admin());

-- services / schedule_days / closed_days: el dueño gestiona los suyos
drop policy if exists services_owner_all on public.services;
create policy services_owner_all on public.services for all to authenticated
  using (business_id = my_business_id()) with check (business_id = my_business_id());

drop policy if exists schedule_owner_all on public.schedule_days;
create policy schedule_owner_all on public.schedule_days for all to authenticated
  using (business_id = my_business_id()) with check (business_id = my_business_id());

drop policy if exists closed_owner_all on public.closed_days;
create policy closed_owner_all on public.closed_days for all to authenticated
  using (business_id = my_business_id()) with check (business_id = my_business_id());

alter table public.closed_slots enable row level security;
drop policy if exists closed_slots_owner_all on public.closed_slots;
create policy closed_slots_owner_all on public.closed_slots for all to authenticated
  using (business_id = my_business_id()) with check (business_id = my_business_id());

-- appointments: el dueño solo las ve si su app está activa (prueba o pagada)
drop policy if exists appointments_owner_select on public.appointments;
create policy appointments_owner_select on public.appointments for select to authenticated
  using (business_id = my_business_id() and my_business_active());
drop policy if exists appointments_owner_update on public.appointments;
create policy appointments_owner_update on public.appointments for update to authenticated
  using (business_id = my_business_id() and my_business_active())
  with check (business_id = my_business_id());

drop policy if exists appt_services_owner_select on public.appointment_services;
create policy appt_services_owner_select on public.appointment_services for select to authenticated
  using (exists (
    select 1 from appointments a
    where a.id = appointment_id and a.business_id = my_business_id() and my_business_active()
  ));

-- payments: el administrador todo; el dueño ve los suyos
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select to authenticated
  using (is_platform_admin() or business_id = my_business_id());

-- payment_claims: el dueño ve los suyos y el administrador todos. Nadie los escribe directo:
-- declarar va por submit_payment_claim (así no se puede crear uno ya "aprobado" ni saltarse el
-- aviso al administrador) y aprobar/rechazar por las funciones del administrador.
alter table public.payment_claims enable row level security;
drop policy if exists payment_claims_select on public.payment_claims;
create policy payment_claims_select on public.payment_claims for select to authenticated
  using (is_platform_admin() or business_id = my_business_id());
drop policy if exists payment_claims_insert on public.payment_claims;

alter table public.reviews enable row level security;
alter table public.gallery_photos enable row level security;
alter table public.customer_notes enable row level security;

-- reviews: el dueño las lee y solo puede ocultarlas o responder (ver reviews_guard)
drop policy if exists reviews_owner_select on public.reviews;
create policy reviews_owner_select on public.reviews for select to authenticated
  using (business_id = my_business_id() and my_business_active());
drop policy if exists reviews_owner_update on public.reviews;
create policy reviews_owner_update on public.reviews for update to authenticated
  using (business_id = my_business_id() and my_plan_has('opiniones'))
  with check (business_id = my_business_id());

-- gallery_photos: el dueño gestiona las suyas (máximo 30, solo con plan que incluya galería)
drop policy if exists gallery_owner_select on public.gallery_photos;
create policy gallery_owner_select on public.gallery_photos for select to authenticated
  using (business_id = my_business_id());
drop policy if exists gallery_owner_insert on public.gallery_photos;
create policy gallery_owner_insert on public.gallery_photos for insert to authenticated
  with check (business_id = my_business_id() and my_plan_has('galeria')
              and (select count(*) from gallery_photos g where g.business_id = my_business_id()) < 30);
drop policy if exists gallery_owner_update on public.gallery_photos;
create policy gallery_owner_update on public.gallery_photos for update to authenticated
  using (business_id = my_business_id() and my_plan_has('galeria'))
  with check (business_id = my_business_id());
drop policy if exists gallery_owner_delete on public.gallery_photos;
create policy gallery_owner_delete on public.gallery_photos for delete to authenticated
  using (business_id = my_business_id());

-- customer_notes: el dueño gestiona las suyas
drop policy if exists notes_owner_all on public.customer_notes;
create policy notes_owner_all on public.customer_notes for all to authenticated
  using (business_id = my_business_id() and my_plan_has('clientes'))
  with check (business_id = my_business_id() and my_plan_has('clientes'));

alter table public.waitlist enable row level security;
alter table public.discounts enable row level security;
alter table public.staff enable row level security;
alter table public.expenses enable row level security;

-- expenses: el dueño gestiona los suyos (van con las estadísticas)
drop policy if exists expenses_owner_all on public.expenses;
create policy expenses_owner_all on public.expenses for all to authenticated
  using (business_id = my_business_id() and my_plan_has('finanzas'))
  with check (business_id = my_business_id() and my_plan_has('finanzas'));

-- staff: el dueño ve los suyos y los gestiona si su plan incluye varios empleados
drop policy if exists staff_owner_select on public.staff;
create policy staff_owner_select on public.staff for select to authenticated
  using (business_id = my_business_id());
drop policy if exists staff_owner_insert on public.staff;
create policy staff_owner_insert on public.staff for insert to authenticated
  with check (business_id = my_business_id() and my_plan_has('empleados')
              and (select count(*) from staff x where x.business_id = my_business_id()) < 20);
drop policy if exists staff_owner_update on public.staff;
create policy staff_owner_update on public.staff for update to authenticated
  using (business_id = my_business_id() and my_plan_has('empleados'))
  with check (business_id = my_business_id());
drop policy if exists staff_owner_delete on public.staff;
create policy staff_owner_delete on public.staff for delete to authenticated
  using (business_id = my_business_id());

-- staff_schedule_days / staff_services: el dueño los gestiona a través del profesional (el
-- profesional ya exige el plan "empleados" para crearse; editar su horario o servicios no vuelve
-- a pedirlo).
alter table public.staff_schedule_days enable row level security;
alter table public.staff_services enable row level security;
drop policy if exists staff_schedule_owner_all on public.staff_schedule_days;
create policy staff_schedule_owner_all on public.staff_schedule_days for all to authenticated
  using (exists (select 1 from staff st where st.id = staff_id and st.business_id = my_business_id()))
  with check (exists (select 1 from staff st where st.id = staff_id and st.business_id = my_business_id()));
drop policy if exists staff_services_owner_all on public.staff_services;
create policy staff_services_owner_all on public.staff_services for all to authenticated
  using (exists (select 1 from staff st where st.id = staff_id and st.business_id = my_business_id()))
  with check (exists (select 1 from staff st where st.id = staff_id and st.business_id = my_business_id()));

-- waitlist: el dueño ve y gestiona la suya (los clientes se apuntan con join_waitlist)
drop policy if exists waitlist_owner_select on public.waitlist;
create policy waitlist_owner_select on public.waitlist for select to authenticated
  using (business_id = my_business_id() and my_business_active());
drop policy if exists waitlist_owner_update on public.waitlist;
create policy waitlist_owner_update on public.waitlist for update to authenticated
  using (business_id = my_business_id() and my_plan_has('espera'))
  with check (business_id = my_business_id());
drop policy if exists waitlist_owner_delete on public.waitlist;
create policy waitlist_owner_delete on public.waitlist for delete to authenticated
  using (business_id = my_business_id());

-- discounts: el dueño ve los suyos y los gestiona si su plan incluye descuentos
drop policy if exists discounts_owner_select on public.discounts;
create policy discounts_owner_select on public.discounts for select to authenticated
  using (business_id = my_business_id());
drop policy if exists discounts_owner_insert on public.discounts;
create policy discounts_owner_insert on public.discounts for insert to authenticated
  with check (business_id = my_business_id() and my_plan_has('descuentos'));
drop policy if exists discounts_owner_update on public.discounts;
create policy discounts_owner_update on public.discounts for update to authenticated
  using (business_id = my_business_id() and my_plan_has('descuentos'))
  with check (business_id = my_business_id());
drop policy if exists discounts_owner_delete on public.discounts;
create policy discounts_owner_delete on public.discounts for delete to authenticated
  using (business_id = my_business_id());

-- packages / customer_packages: el dueño los gestiona (igual que las notas de clientes)
alter table public.packages enable row level security;
drop policy if exists packages_owner_all on public.packages;
create policy packages_owner_all on public.packages for all to authenticated
  using (business_id = my_business_id()) with check (business_id = my_business_id());

alter table public.customer_packages enable row level security;
drop policy if exists customer_packages_owner_all on public.customer_packages;
create policy customer_packages_owner_all on public.customer_packages for all to authenticated
  using (business_id = my_business_id() and my_plan_has('clientes'))
  with check (business_id = my_business_id() and my_plan_has('clientes'));

-- Código en mayúsculas; el dueño no puede tocar el contador de usos
create or replace function public.discounts_guard()
returns trigger language plpgsql as $$
begin
  new.code := upper(btrim(new.code));
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.uses := 0;
    else
      new.uses := old.uses;
      new.business_id := old.business_id;
      new.created_at := old.created_at;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists discounts_guard on public.discounts;
create trigger discounts_guard before insert or update on public.discounts
  for each row execute function public.discounts_guard();

-- El dueño solo puede tocar "hidden" y "reply" de una opinión
create or replace function public.reviews_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and current_user in ('authenticated', 'anon') then
    new.business_id := old.business_id;
    new.appointment_id := old.appointment_id;
    new.customer_name := old.customer_name;
    new.rating := old.rating;
    new.comment := old.comment;
    new.created_at := old.created_at;
    new.updated_at := old.updated_at;
  end if;
  new.reply := nullif(btrim(coalesce(new.reply, '')), '');
  return new;
end;
$$;
drop trigger if exists reviews_guard on public.reviews;
create trigger reviews_guard before update on public.reviews
  for each row execute function public.reviews_guard();

-- El dueño no puede aprobar o rechazar sus propias fotos: solo moderate-photo (con la clave de
-- servicio, no como "authenticated") puede tocar moderation_status/moderation_note.
create or replace function public.gallery_photos_guard()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.moderation_status := 'pendiente';
      new.moderation_note := null;
    else
      new.moderation_status := old.moderation_status;
      new.moderation_note := old.moderation_note;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists gallery_photos_guard on public.gallery_photos;
create trigger gallery_photos_guard before insert or update on public.gallery_photos
  for each row execute function public.gallery_photos_guard();

-- Evita que alguien cambie el token o el negocio de una cita
create or replace function public.appointments_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    new.token := old.token;
    new.business_id := old.business_id;
    new.created_at := old.created_at;
    if new.staff_id is distinct from old.staff_id and new.staff_id is not null
       and not exists (select 1 from staff where id = new.staff_id and business_id = new.business_id) then
      raise exception 'PROFESIONAL_INVALIDO';
    end if;
    if new.status = 'cancelada' and old.status <> 'cancelada' and new.cancelled_by is null then
      new.cancelled_by := 'negocio';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists appointments_guard on public.appointments;
create trigger appointments_guard before update on public.appointments
  for each row execute function public.appointments_guard();

-- Avisos push automáticos. Se apoya en columnas que ya existen para saber quién hizo cada cambio,
-- sin tocar las funciones de reserva: "source" (web = cliente, manual = dueño), "cancelled_by"
-- ('cliente' o 'negocio', puestos por cancel_booking/appointments_guard) y "reschedule_count"
-- (solo lo suben reschedule_booking/edit_booking, nunca el dueño).
create or replace function public._appointments_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  b businesses;
  v_when text;
  v_wait int;
begin
  select * into b from businesses where id = new.business_id;
  if not found then return new; end if;
  v_when := to_char(new.starts_at at time zone b.timezone, _l(b.lang, 'DD/MM HH12:MI AM', 'MM/DD HH12:MI AM'));

  -- Las citas nuevas se avisan desde create_booking (ahí sí hay a mano los servicios y el
  -- teléfono para mandar un aviso completo); aquí solo se ignoran para no avisar dos veces.
  if tg_op = 'INSERT' then
    return new;
  end if;
  -- El administrador cambió la zona horaria del negocio: la cita se sigue viendo a la misma hora
  -- (ver admin_set_timezone), así que no hay nada que avisar
  if current_setting('citora.cambio_zona', true) = 'si' then
    return new;
  end if;

  if new.status = 'cancelada' and old.status <> 'cancelada' then
    if new.cancelled_by = 'cliente' then
      perform _notify_push(new.business_id, 'owner', null, _l(b.lang, 'Cita cancelada: ', 'Appointment cancelled: ') || new.customer_name, v_when);
      select count(*) into v_wait from waitlist
        where business_id = new.business_id and status = 'esperando'
          and day = (new.starts_at at time zone b.timezone)::date;
      if v_wait > 0 then
        perform _notify_push(new.business_id, 'owner', null, _l(b.lang, 'Se liberó un hueco', 'A spot opened up'),
          _l(b.lang,
            'El ' || to_char(new.starts_at at time zone b.timezone, 'DD/MM') || ': tienes ' || v_wait ||
              case when v_wait = 1 then ' cliente' else ' clientes' end || ' en lista de espera.',
            to_char(new.starts_at at time zone b.timezone, 'MM/DD') || ': you have ' || v_wait ||
              case when v_wait = 1 then ' client' else ' clients' end || ' on the waitlist.'));
      end if;
    else
      perform _notify_push(new.business_id, 'customer', new.id, _l(b.lang, 'Tu cita fue cancelada', 'Your appointment was cancelled'),
        _l(b.lang, b.name || ' canceló tu cita del ' || v_when, b.name || ' cancelled your appointment on ' || v_when));
    end if;
  elsif new.status = 'confirmada' and old.status = 'pendiente' then
    perform _notify_push(new.business_id, 'customer', new.id, _l(b.lang, 'Cita confirmada', 'Appointment confirmed'),
      _l(b.lang, b.name || ' confirmó tu cita del ' || v_when, b.name || ' confirmed your appointment on ' || v_when));
  elsif new.starts_at <> old.starts_at then
    if new.reschedule_count <> old.reschedule_count then
      perform _notify_push(new.business_id, 'owner', null, _l(b.lang, 'Cambio de cita: ', 'Appointment changed: ') || new.customer_name,
        _l(b.lang, 'Nuevo horario: ', 'New time: ') || v_when);
    else
      perform _notify_push(new.business_id, 'customer', new.id, _l(b.lang, 'Tu cita cambió de horario', 'Your appointment time changed'),
        _l(b.lang, b.name || ' movió tu cita al ' || v_when, b.name || ' moved your appointment to ' || v_when));
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists appointments_notify on public.appointments;
create trigger appointments_notify after insert or update on public.appointments
  for each row execute function public._appointments_notify();

-- Manda cada foto nueva de galería a revisión automática (ver _notify_moderation)
create or replace function public._gallery_photos_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform _notify_moderation(new.id, new.url);
  return new;
end;
$$;
drop trigger if exists gallery_photos_notify on public.gallery_photos;
create trigger gallery_photos_notify after insert on public.gallery_photos
  for each row execute function public._gallery_photos_notify();

-- Tareas programadas: recordatorios push a clientes con cita mañana (ver _send_daily_reminders). Si el
-- plan de Supabase no admite pg_cron, no pasa nada: solo faltarán los recordatorios automáticos.
do $$
begin
  create extension if not exists pg_cron with schema extensions;
  if exists (select 1 from cron.job where jobname = 'citora-recordatorios') then
    perform cron.unschedule('citora-recordatorios');
  end if;
  -- Cada hora: cada negocio recibe los suyos a las 18:00 de su zona horaria
  perform cron.schedule('citora-recordatorios', '0 * * * *', $cron$select public._send_daily_reminders();$cron$);
  if exists (select 1 from cron.job where jobname = 'citora-no-asistio') then
    perform cron.unschedule('citora-no-asistio');
  end if;
  perform cron.schedule('citora-no-asistio', '0 * * * *', $cron$select public._auto_mark_no_shows();$cron$);
  if exists (select 1 from cron.job where jobname = 'citora-fotos-pendientes') then
    perform cron.unschedule('citora-fotos-pendientes');
  end if;
  perform cron.schedule('citora-fotos-pendientes', '30 * * * *', $cron$select public._approve_unmoderated_photos();$cron$);
  if exists (select 1 from cron.job where jobname = 'citora-vencimiento') then
    perform cron.unschedule('citora-vencimiento');
  end if;
  -- Cada hora: a cada negocio le llega a las 9:00 de su zona horaria
  perform cron.schedule('citora-vencimiento', '0 * * * *', $cron$select public._send_expiry_reminders();$cron$);
  if exists (select 1 from cron.job where jobname = 'citora-limpiar-visitas') then
    perform cron.unschedule('citora-limpiar-visitas');
  end if;
  perform cron.schedule('citora-limpiar-visitas', '15 8 * * *', $cron$select public._purge_analytics();$cron$);
  if exists (select 1 from cron.job where jobname = 'citora-borrar-pruebas-vencidas') then
    perform cron.unschedule('citora-borrar-pruebas-vencidas');
  end if;
  -- Una vez al día (8:45 UTC ≈ 4:45 en Cuba): borra las pruebas que terminaron hace más de 5 días sin pagar
  perform cron.schedule('citora-borrar-pruebas-vencidas', '45 8 * * *', $cron$select public._purge_expired_trials();$cron$);
exception when others then
  null;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. FUNCIONES PÚBLICAS (para la web de reservas, sin sesión)
-- ---------------------------------------------------------------------

create or replace function public.get_public_prices()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'basico', price_basico, 'plus', price_plus, 'ultra', price_ultra, 'trial_days', trial_days,
    'int_basico', price_int_basico, 'int_ultra', price_int_ultra)
  from platform_settings where id = 1;
$$;

-- Datos públicos del negocio para su web
create or replace function public.get_public_business(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  b businesses;
  v_plan text;
begin
  select * into b from businesses where slug = lower(p_slug);
  if not found then
    return null;
  end if;
  v_plan := business_effective_plan(b.plan, b.trial_ends_at, b.paid_until);
  if v_plan is null then
    return jsonb_build_object(
      'name', b.name, 'slug', b.slug, 'market', b.market, 'logo_url', b.logo_url,
      'color_primary', b.color_primary, 'appearance', b.appearance, 'accepting', false);
  end if;
  return jsonb_build_object(
    'id', b.id,
    'name', b.name,
    'slug', b.slug,
    'market', b.market,
    'business_type', b.business_type,
    'whatsapp', b.whatsapp,
    'address', b.address,
    'description', b.description,
    'owner_name', b.owner_name,
    'owner_specialty', b.owner_specialty,
    'logo_url', b.logo_url,
    'color_primary', b.color_primary,
    'cover_url', b.cover_url,
    'appearance', b.appearance,
    'timezone', b.timezone,
    'currency', b.currency,
    'usd_prices', b.usd_prices,
    'usd_rate', case when b.usd_prices then b.usd_rate end,
    'policies', b.policies,
    'min_notice_hours', b.min_notice_hours,
    'max_days_ahead', b.max_days_ahead,
    'cancel_notice_hours', b.cancel_notice_hours,
    'reschedule_notice_hours', b.reschedule_notice_hours,
    'max_reschedules', b.max_reschedules,
    'deposit_enabled', b.deposit_enabled,
    'deposit_amount', case when b.deposit_enabled then b.deposit_amount end,
    'deposit_instructions', case when b.deposit_enabled then b.deposit_instructions end,
    'plan', v_plan,
    'accepting', true,
    'today', (now() at time zone b.timezone)::date,
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'description', s.description, 'photo_url', s.photo_url,
        'price', s.price, 'duration_min', s.duration_min, 'is_extra', s.is_extra, 'options', s.options,
        'multi_options', s.multi_options)
        order by s.position, s.created_at)
      from services s where s.business_id = b.id and s.active), '[]'::jsonb),
    'schedule', coalesce((
      select jsonb_agg(jsonb_build_object(
        'weekday', d.weekday, 'is_open', d.is_open and cardinality(d.slots) > 0) order by d.weekday)
      from schedule_days d where d.business_id = b.id), '[]'::jsonb),
    'closed_days', coalesce((
      select jsonb_agg(c.day order by c.day)
      from closed_days c
      where c.business_id = b.id and c.day >= (now() at time zone b.timezone)::date), '[]'::jsonb),
    'rating', case when plan_has(v_plan, 'opiniones') then (
      select jsonb_build_object('avg', round(avg(r.rating)::numeric, 1), 'count', count(*))
      from reviews r where r.business_id = b.id and not r.hidden) end,
    'reviews', case when plan_has(v_plan, 'opiniones') then coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', split_part(r.customer_name, ' ', 1), 'rating', r.rating, 'comment', r.comment,
        'reply', r.reply, 'created_at', r.created_at) order by r.created_at desc)
      from (select * from reviews
            where business_id = b.id and not hidden
            order by (comment is not null) desc, created_at desc limit 12) r), '[]'::jsonb)
      else '[]'::jsonb end,
    'staff', case when plan_has(v_plan, 'empleados') then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', st.id, 'name', st.name, 'photo_url', st.photo_url,
        -- Lista vacía = puede con todos los servicios (no ha configurado restricción), salvo si
        -- tiene servicios propios (all_services = false): entonces solo los de la lista
        'service_ids', coalesce((select jsonb_agg(ss.service_id) from staff_services ss where ss.staff_id = st.id), '[]'::jsonb),
        'all_services', not st.own_services and not exists (select 1 from staff_services ss where ss.staff_id = st.id),
        'specialty', st.specialty)
        order by st.position, st.created_at)
      from staff st where st.business_id = b.id and st.active), '[]'::jsonb)
      else '[]'::jsonb end,
    'gallery', case when plan_has(v_plan, 'galeria') then coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'url', g.url, 'caption', g.caption)
                       order by g.position, g.created_at)
      from gallery_photos g where g.business_id = b.id and g.moderation_status = 'aprobada'), '[]'::jsonb)
      else '[]'::jsonb end
  );
end;
$$;

-- ¿Está libre un hueco? (excluyendo opcionalmente una cita, para reagendar)
create or replace function public._is_range_free(p_business uuid, p_start timestamptz, p_end timestamptz, p_exclude uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from appointments a
    where a.business_id = p_business
      and a.status <> 'cancelada'
      and tstzrange(a.starts_at, a.ends_at) && tstzrange(p_start, p_end)
      and (p_exclude is null or a.id <> p_exclude)
  );
$$;

-- Primera silla libre de un profesional (null = la agenda común, con slot_capacity sillas) en un
-- intervalo, o null si están todas ocupadas
create or replace function public._free_lane(p_business uuid, p_staff uuid, p_start timestamptz, p_end timestamptz, p_exclude uuid default null)
returns smallint language plpgsql stable security definer set search_path = public as $$
declare
  v_cap int := 1;
  l int;
begin
  if p_staff is null then
    -- Varios clientes a la vez es del plan Equipo (y de la prueba): con Solo, una sola silla aunque
    -- tenga guardado más (se conserva por si vuelve a Equipo)
    select case when plan_has(business_effective_plan(plan, trial_ends_at, paid_until), 'empleados')
                then greatest(1, slot_capacity) else 1 end
      into v_cap from businesses where id = p_business;
  end if;
  for l in 0 .. coalesce(v_cap, 1) - 1 loop
    if not exists (
      select 1 from appointments a
      where a.business_id = p_business
        and a.status <> 'cancelada'
        and a.staff_id is not distinct from p_staff
        and a.lane = l
        and tstzrange(a.starts_at, a.ends_at) && tstzrange(p_start, p_end)
        and (p_exclude is null or a.id <> p_exclude)
    ) then
      return l;
    end if;
  end loop;
  return null;
end;
$$;

-- ¿Queda alguna silla libre en la agenda de un profesional (null = la agenda común) en un intervalo?
create or replace function public._lane_free(p_business uuid, p_staff uuid, p_start timestamptz, p_end timestamptz, p_exclude uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  select _free_lane(p_business, p_staff, p_start, p_end, p_exclude) is not null;
$$;

-- ¿Trabaja este profesional ese día y esa hora? Sin profesional, o si no configuró su propia
-- agenda (ver Equipo), se mira el horario del negocio en su lugar (como siempre).
create or replace function public._staff_slot_valid(p_business uuid, p_staff uuid, p_date date, p_time time)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p_staff is null or not exists (select 1 from staff_schedule_days where staff_id = p_staff) then
      exists (select 1 from schedule_days
              where business_id = p_business and weekday = extract(dow from p_date)::int and is_open and p_time = any (slots))
    else
      exists (select 1 from staff_schedule_days
              where staff_id = p_staff and weekday = extract(dow from p_date)::int and is_open and p_time = any (slots))
  end;
$$;

-- ¿Cae este turno dentro de una hora bloqueada (almuerzo, salida temprano...)? Se mira el negocio
-- entero, no por profesional: ver closed_slots en Horario.
create or replace function public._slot_blocked(p_business uuid, p_date date, p_start time, p_duration int)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from closed_slots
    where business_id = p_business and day = p_date
      and (p_start, p_start + make_interval(mins => greatest(p_duration, 5))) overlaps (start_time, end_time)
  );
$$;

-- ¿Puede este profesional hacer estos servicios? Si no configuró servicios (ver Equipo), puede
-- con todos (igual que antes de tener esta opción).
-- Los servicios que cuentan para saber quién atiende: todos menos los extras que no son de nadie del
-- equipo (un extra del dueño, como "Diseño", se puede añadir a la manicura de una profesional)
create or replace function public._required_services(p_service_ids uuid[])
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(x), '{}'::uuid[]) from unnest(p_service_ids) x
  where not exists (
    select 1 from services s where s.id = x and s.is_extra
      and not exists (select 1 from staff_services ss join staff st on st.id = ss.staff_id where ss.service_id = x and st.active));
$$;

-- ¿Son todos servicios del dueño? (ninguno lo hace explícitamente alguien activo del equipo)
create or replace function public._owner_does(p_service_ids uuid[])
returns boolean language sql stable security definer set search_path = public as $$
  select p_service_ids is not null and not exists (
    select 1 from unnest(p_service_ids) x
      join staff_services ss on ss.service_id = x
      join staff st on st.id = ss.staff_id and st.active);
$$;

create or replace function public._staff_can_do(p_staff uuid, p_service_ids uuid[])
returns boolean language sql stable security definer set search_path = public as $$
  select p_staff is null or p_service_ids is null
      or (not coalesce((select own_services from staff where id = p_staff), false)
          and not exists (select 1 from staff_services where staff_id = p_staff))
      or _required_services(p_service_ids) <@ coalesce((select array_agg(service_id) from staff_services where staff_id = p_staff), '{}'::uuid[]);
$$;

-- Busca quién puede atender un hueco. Sin profesionales: la agenda común.
-- Con p_staff: solo ese profesional. Sin p_staff: el que esté libre, pueda con esos servicios
-- (p_service_ids), trabaje a esa hora y tenga menos citas ese día.
drop function if exists public._free_staff(uuid, timestamptz, timestamptz, uuid, uuid);
create or replace function public._free_staff(p_business uuid, p_start timestamptz, p_end timestamptz,
                                              p_staff uuid default null, p_exclude uuid default null,
                                              p_service_ids uuid[] default null)
returns table (ok boolean, staff_id uuid)
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text;
  s record;
begin
  -- Sin equipo, o sin el plan Equipo (sus profesionales no se ven ni reciben citas): la agenda del negocio
  if not exists (select 1 from staff x where x.business_id = p_business and x.active)
     or not (select plan_has(business_effective_plan(b.plan, b.trial_ends_at, b.paid_until), 'empleados')
             from businesses b where b.id = p_business) then
    ok := _lane_free(p_business, null, p_start, p_end, p_exclude);
    staff_id := null;
    return next;
    return;
  end if;
  select timezone into v_tz from businesses where id = p_business;
  for s in
    select st.id from staff st
    where st.business_id = p_business and st.active and (p_staff is null or st.id = p_staff)
      and _staff_can_do(st.id, p_service_ids)
      and _staff_slot_valid(p_business, st.id, (p_start at time zone v_tz)::date, (p_start at time zone v_tz)::time)
    order by (select count(*) from appointments a
              where a.staff_id = st.id and a.status <> 'cancelada'
                and a.starts_at >= date_trunc('day', p_start) and a.starts_at < date_trunc('day', p_start) + interval '1 day'),
             st.position, st.created_at
  loop
    if _lane_free(p_business, s.id, p_start, p_end, p_exclude) then
      ok := true;
      staff_id := s.id;
      return next;
      return;
    end if;
  end loop;
  -- Servicios del dueño (nadie del equipo los hace): van a la agenda del negocio, como sin equipo.
  -- Solo si ningún profesional activo puede hacerlos: así no cambia nada donde el equipo lo hace todo.
  if p_staff is null and p_service_ids is not null and _owner_does(_required_services(p_service_ids))
     and not exists (select 1 from staff st where st.business_id = p_business and st.active
                     and _staff_can_do(st.id, p_service_ids)) then
    ok := _lane_free(p_business, null, p_start, p_end, p_exclude);
    staff_id := null;
    return next;
    return;
  end if;
  ok := false;
  staff_id := null;
  return next;
end;
$$;

-- Comprueba un turno concreto. Devuelve 'ok', 'invalido' u 'ocupado'.
drop function if exists public._check_slot(uuid, date, text, int, uuid, uuid);
create or replace function public._check_slot(p_business uuid, p_date date, p_time text, p_duration int,
                                              p_exclude uuid default null, p_staff uuid default null,
                                              p_service_ids uuid[] default null)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  b businesses;
  v_today date;
  v_time time;
  v_start timestamptz;
begin
  select * into b from businesses where id = p_business;
  if not found then return 'invalido'; end if;
  begin
    v_time := p_time::time;
  exception when others then
    return 'invalido';
  end;
  v_today := (now() at time zone b.timezone)::date;
  if p_date < v_today or p_date > v_today + b.max_days_ahead then return 'invalido'; end if;
  if exists (select 1 from closed_days where business_id = b.id and day = p_date) then return 'invalido'; end if;
  if not _staff_slot_valid(b.id, p_staff, p_date, v_time) then return 'invalido'; end if;
  if not _staff_can_do(p_staff, p_service_ids) then return 'invalido'; end if;
  if _slot_blocked(b.id, p_date, v_time, p_duration) then return 'invalido'; end if;
  v_start := (p_date + v_time) at time zone b.timezone;
  if v_start < now() + make_interval(hours => b.min_notice_hours) then return 'invalido'; end if;
  if not (select f.ok from _free_staff(b.id, v_start, v_start + make_interval(mins => greatest(p_duration, 5)),
                                      p_staff, p_exclude, p_service_ids) f) then
    return 'ocupado';
  end if;
  return 'ok';
end;
$$;

-- Turnos de un día con su disponibilidad (con p_staff: solo la agenda de ese profesional).
-- Con p_exclude_token (el cliente editando su cita), su propia cita no cuenta como ocupada.
drop function if exists public.get_available_slots(text, date, int);
drop function if exists public.get_available_slots(text, date, int, uuid);
drop function if exists public.get_available_slots(text, date, int, uuid, text);
create or replace function public.get_available_slots(p_slug text, p_date date, p_duration int, p_staff uuid default null,
                                                      p_exclude_token text default null, p_service_ids uuid[] default null)
returns table (slot text, available boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  b businesses;
  v_today date;
  v_is_open boolean;
  v_slots time[];
  v_exclude uuid;
  t time;
  v_start timestamptz;
begin
  select * into b from businesses where slug = lower(p_slug);
  if not found or business_effective_plan(b.plan, b.trial_ends_at, b.paid_until) is null then
    return;
  end if;
  if p_exclude_token is not null then
    select a.id into v_exclude from appointments a where a.token = p_exclude_token and a.business_id = b.id;
  end if;
  v_today := (now() at time zone b.timezone)::date;
  if p_date < v_today or p_date > v_today + b.max_days_ahead then return; end if;
  if exists (select 1 from closed_days where business_id = b.id and day = p_date) then return; end if;
  select is_open, slots into v_is_open, v_slots
    from schedule_days where business_id = b.id and weekday = extract(dow from p_date)::int;
  if not found or not v_is_open then return; end if;
  foreach t in array v_slots loop
    v_start := (p_date + t) at time zone b.timezone;
    slot := to_char(t, 'HH24:MI');
    available := v_start >= now() + make_interval(hours => b.min_notice_hours)
      and not _slot_blocked(b.id, p_date, t, coalesce(p_duration, 60))
      and (select f.ok from _free_staff(b.id, v_start, v_start + make_interval(mins => greatest(coalesce(p_duration, 60), 5)),
                                        p_staff, v_exclude, p_service_ids) f);
    return next;
  end loop;
end;
$$;

-- Normaliza un teléfono: deja solo los dígitos (así lo usa WhatsApp)
create or replace function public._clean_phone(p text)
returns text language sql immutable as $$
  select regexp_replace(coalesce(p, ''), '\D', '', 'g');
$$;

-- Valida un cupón y devuelve el descuento sobre un subtotal. Con p_lock bloquea la fila para usarlo.
create or replace function public._discount_for(p_business uuid, p_code text, p_subtotal numeric, p_lock boolean default false)
returns table (code text, percent int, amount numeric, discount numeric)
language plpgsql volatile security definer set search_path = public as $$
declare
  b businesses;
  d discounts;
begin
  select * into b from businesses where id = p_business;
  if not plan_has(business_effective_plan(b.plan, b.trial_ends_at, b.paid_until), 'descuentos') then
    raise exception 'CUPON_INVALIDO';
  end if;
  if p_lock then
    select * into d from discounts x where x.business_id = p_business and x.code = upper(btrim(p_code)) for update;
  else
    select * into d from discounts x where x.business_id = p_business and x.code = upper(btrim(p_code));
  end if;
  if not found or not d.active then raise exception 'CUPON_INVALIDO'; end if;
  if d.valid_until is not null and d.valid_until < (now() at time zone b.timezone)::date then
    raise exception 'CUPON_VENCIDO';
  end if;
  if d.max_uses is not null and d.uses >= d.max_uses then raise exception 'CUPON_AGOTADO'; end if;
  code := d.code;
  percent := d.percent;
  amount := d.amount;
  discount := least(p_subtotal, coalesce(d.amount, round(p_subtotal * d.percent / 100.0, 2)));
  return next;
end;
$$;

-- Las opciones elegidas de un servicio ("o2" o ["o3", "o1"]) como texto fijo: "o1,o3"
create or replace function public._option_key(p jsonb)
returns text language sql immutable set search_path = public as $$
  select case jsonb_typeof(p)
    when 'string' then nullif(p #>> '{}', '')
    when 'array' then (select string_agg(distinct x, ',' order by x) from jsonb_array_elements_text(p) x)
  end;
$$;

-- Los servicios elegidos con su precio, ya con las opciones elegidas de cada uno (p_options:
-- {"<id del servicio>": ["<id de la opción>", ...]}). Un servicio con opciones necesita una válida,
-- o varias si el dueño lo permite (se suman sus precios). Es la única forma de calcular precios al
-- reservar: el precio nunca viene del navegador.
create or replace function public._chosen_services(p_business uuid, p_service_ids uuid[], p_options jsonb,
                                                   p_active_only boolean default true)
returns table (service_id uuid, option_id text, name text, price numeric, duration_min int, is_extra boolean, pos int)
language plpgsql stable security definer set search_path = public as $$
declare
  sv services;
  v_key text;
  v_ids text[];
  v_names text;
  v_sum numeric;
  v_n int;
begin
  for sv in
    select x.* from services x
    where x.business_id = p_business and x.id = any (coalesce(p_service_ids, '{}'))
      and (x.active or not p_active_only)
    order by x.is_extra, x.position, x.created_at
  loop
    v_key := null;
    v_names := null;
    v_sum := null;
    if jsonb_array_length(sv.options) > 0 then
      v_key := _option_key(case when jsonb_typeof(p_options) = 'object' then p_options->sv.id::text end);
      v_ids := string_to_array(v_key, ',');
      if v_ids is null or cardinality(v_ids) = 0 or (cardinality(v_ids) > 1 and not sv.multi_options) then
        raise exception 'FALTA_OPCION';
      end if;
      select string_agg(t.x->>'name', ' + ' order by t.ord), sum((t.x->>'price')::numeric), count(*)
        into v_names, v_sum, v_n
        from jsonb_array_elements(sv.options) with ordinality t(x, ord) where t.x->>'id' = any (v_ids);
      if v_n <> cardinality(v_ids) then raise exception 'FALTA_OPCION'; end if;
    end if;
    service_id := sv.id;
    option_id := v_key;
    name := case when v_names is null then sv.name else sv.name || ' · ' || v_names end;
    price := coalesce(v_sum, sv.price);
    duration_min := sv.duration_min;
    is_extra := sv.is_extra;
    pos := sv.position;
    return next;
  end loop;
end;
$$;

-- Comprueba un cupón antes de reservar (no lo gasta)
drop function if exists public.check_discount(text, text, uuid[]);
create or replace function public.check_discount(p_slug text, p_code text, p_service_ids uuid[], p_options jsonb default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  b businesses;
  v_sub numeric;
  r record;
begin
  select * into b from businesses where slug = lower(p_slug);
  if not found or business_effective_plan(b.plan, b.trial_ends_at, b.paid_until) is null then
    raise exception 'NEGOCIO_INACTIVO';
  end if;
  select coalesce(sum(c.price), 0) into v_sub from _chosen_services(b.id, p_service_ids, p_options) c;
  select * into r from _discount_for(b.id, p_code, v_sub);
  return jsonb_build_object('code', r.code, 'percent', r.percent, 'amount', r.amount,
                            'subtotal', v_sub, 'discount', r.discount, 'total', v_sub - r.discount);
end;
$$;

-- Reserva desde la web pública
drop function if exists public.create_booking(text, uuid[], date, text, text, text, text);
drop function if exists public.create_booking(text, uuid[], date, text, text, text, text, text);
drop function if exists public.create_booking(text, uuid[], date, text, text, text, text, text, uuid);
create or replace function public.create_booking(
  p_slug text, p_service_ids uuid[], p_date date, p_time text,
  p_name text, p_phone text, p_note text default null, p_code text default null, p_staff uuid default null,
  p_options jsonb default null)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  b businesses;
  v_staff uuid;
  v_lane smallint;
  v_disc numeric := 0;
  v_code text;
  v_phone text;
  v_name text;
  v_count int;
  v_dur int;
  v_total numeric;
  v_check text;
  v_start timestamptz;
  v_id uuid;
  v_token text;
  v_services text;
begin
  select * into b from businesses where slug = lower(p_slug);
  if not found then raise exception 'NEGOCIO_NO_EXISTE'; end if;
  if business_effective_plan(b.plan, b.trial_ends_at, b.paid_until) is null then
    raise exception 'NEGOCIO_INACTIVO';
  end if;

  v_name := btrim(coalesce(p_name, ''));
  v_phone := _clean_phone(p_phone);
  if char_length(v_name) < 2 or char_length(v_name) > 80 then raise exception 'NOMBRE_INVALIDO'; end if;
  if char_length(regexp_replace(v_phone, '\D', '', 'g')) not between 8 and 15 then
    raise exception 'TELEFONO_INVALIDO';
  end if;

  if p_service_ids is null or cardinality(p_service_ids) = 0 or cardinality(p_service_ids) > 10 then
    raise exception 'SERVICIOS_INVALIDOS';
  end if;
  select count(*), sum(c.duration_min), sum(c.price) into v_count, v_dur, v_total
    from _chosen_services(b.id, p_service_ids, p_options) c;
  if v_count = 0 or v_count <> (select count(distinct x) from unnest(p_service_ids) x) then
    raise exception 'SERVICIOS_INVALIDOS';
  end if;
  -- Los complementos van con al menos un servicio principal
  if not exists (select 1 from services where business_id = b.id and active and not is_extra and id = any (p_service_ids)) then
    raise exception 'FALTA_SERVICIO_PRINCIPAL';
  end if;

  -- Límites antiabuso
  if b.max_pending_bookings is not null and (select count(*) from appointments
      where business_id = b.id and customer_phone = v_phone
        and status in ('pendiente', 'confirmada') and starts_at > now()) >= b.max_pending_bookings then
    raise exception 'LIMITE_CITAS';
  end if;
  if b.max_daily_bookings is not null and (select count(*) from appointments
      where business_id = b.id and customer_phone = v_phone
        and created_at > now() - interval '1 day') >= b.max_daily_bookings then
    raise exception 'LIMITE_DIARIO';
  end if;

  v_check := _check_slot(b.id, p_date, p_time, v_dur, null, p_staff, p_service_ids);
  if v_check = 'invalido' then raise exception 'TURNO_INVALIDO'; end if;
  if v_check = 'ocupado' then raise exception 'TURNO_OCUPADO'; end if;

  -- Cupón: se valida y se gasta en la misma transacción que la reserva
  if nullif(btrim(coalesce(p_code, '')), '') is not null then
    select d.code, d.discount into v_code, v_disc from _discount_for(b.id, p_code, v_total, true) d;
    update discounts set uses = uses + 1 where business_id = b.id and code = v_code;
  end if;

  v_start := (p_date + p_time::time) at time zone b.timezone;
  v_token := replace(gen_random_uuid()::text, '-', '');
  select f.staff_id into v_staff from _free_staff(b.id, v_start, v_start + make_interval(mins => v_dur), p_staff, null, p_service_ids) f;
  v_lane := _free_lane(b.id, v_staff, v_start, v_start + make_interval(mins => v_dur));
  if v_lane is null then raise exception 'TURNO_OCUPADO'; end if;
  begin
    insert into appointments (business_id, token, starts_at, ends_at, customer_name, customer_phone,
                              customer_note, total, status, source, discount_code, discount, staff_id, usd_rate, lane)
    values (b.id, v_token, v_start, v_start + make_interval(mins => v_dur), v_name, v_phone,
            nullif(left(btrim(coalesce(p_note, '')), 500), ''), v_total - v_disc, 'pendiente', 'web',
            v_code, v_disc, v_staff, case when b.usd_prices then b.usd_rate end, v_lane)
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'TURNO_OCUPADO';
  end;

  insert into appointment_services (appointment_id, service_id, option_id, name, price, duration_min)
  select v_id, c.service_id, c.option_id, c.name, c.price, c.duration_min
    from _chosen_services(b.id, p_service_ids, p_options) c;

  -- Aviso al dueño con los datos de la reserva (aquí, y no en el disparador, porque aquí sí se
  -- tienen a mano los servicios y el teléfono)
  select string_agg(s.name, ', ') into v_services from appointment_services s where s.appointment_id = v_id;
  perform _notify_push(b.id, 'owner', null, _l(b.lang, 'Nueva cita: ', 'New booking: ') || v_name,
    to_char(v_start at time zone b.timezone, _l(b.lang, 'DD/MM HH12:MI AM', 'MM/DD HH12:MI AM')) || chr(10) ||
    v_services || ' · ' || trim(to_char(v_total - v_disc, 'FM999G999G990')) || ' ' || b.currency || chr(10) ||
    _l(b.lang, 'Tel: ', 'Phone: ') || v_phone);

  return v_token;
end;
$$;

-- Página privada de la cita (por enlace único)
create or replace function public.get_booking(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'token', a.token,
    'starts_at', a.starts_at,
    'ends_at', a.ends_at,
    'customer_name', a.customer_name,
    'customer_phone', a.customer_phone,
    'customer_note', a.customer_note,
    'total', a.total,
    'usd_rate', a.usd_rate,
    'discount', a.discount,
    'discount_code', a.discount_code,
    'staff_id', (select st.id from staff st where st.id = a.staff_id and st.active),
    'staff_name', (select st.name from staff st where st.id = a.staff_id),
    'status', a.status,
    'reschedule_count', a.reschedule_count,
    'can_cancel', a.status in ('pendiente', 'confirmada')
       and a.starts_at > now() + make_interval(hours => b.cancel_notice_hours),
    'can_edit', a.status in ('pendiente', 'confirmada')
       and a.starts_at > now() + make_interval(hours => b.reschedule_notice_hours),
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', s.service_id, 'option_id', s.option_id,
                 'name', s.name, 'price', s.price, 'duration_min', s.duration_min)) from appointment_services s
                 where s.appointment_id = a.id), '[]'::jsonb),
    'can_review', plan_has(business_effective_plan(b.plan, b.trial_ends_at, b.paid_until), 'opiniones')
       and _appt_done(a.status, a.ends_at)
       and a.starts_at > now() - interval '60 days',
    'review', (select jsonb_build_object('rating', r.rating, 'comment', r.comment, 'reply', r.reply)
               from reviews r where r.appointment_id = a.id),
    -- Solo cifras: el teléfono no está verificado, así que no se muestran otras citas
    'customer', (select jsonb_build_object(
                   'visits', count(*) filter (where _appt_done(x.status, x.ends_at)),
                   'bookings', count(*) filter (where x.status <> 'cancelada'),
                   'since', min(x.starts_at) filter (where x.status <> 'cancelada'))
                 from appointments x
                 where x.business_id = a.business_id and x.customer_phone = a.customer_phone),
    'business', jsonb_build_object(
      'name', b.name, 'slug', b.slug, 'market', b.market, 'whatsapp', b.whatsapp, 'address', b.address,
      'logo_url', b.logo_url, 'color_primary', b.color_primary, 'timezone', b.timezone,
      'currency', b.currency, 'cancel_notice_hours', b.cancel_notice_hours,
      'reschedule_notice_hours', b.reschedule_notice_hours, 'max_reschedules', b.max_reschedules,
      'loyalty_enabled', b.loyalty_enabled, 'loyalty_every', b.loyalty_every, 'loyalty_reward', b.loyalty_reward,
      'appearance', b.appearance)
  )
  from appointments a join businesses b on b.id = a.business_id
  where a.token = p_token;
$$;

create or replace function public.cancel_booking(p_token text)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  a appointments;
  v_notice int;
begin
  select ap.* into a from appointments ap where ap.token = p_token for update;
  if not found then raise exception 'CITA_NO_EXISTE'; end if;
  select cancel_notice_hours into v_notice from businesses where id = a.business_id;
  if a.status not in ('pendiente', 'confirmada') then raise exception 'CITA_NO_MODIFICABLE'; end if;
  if a.starts_at <= now() + make_interval(hours => v_notice) then raise exception 'FUERA_DE_PLAZO'; end if;
  update appointments set status = 'cancelada', cancelled_by = 'cliente' where id = a.id;
end;
$$;

create or replace function public.reschedule_booking(p_token text, p_date date, p_time text)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  a appointments;
  b businesses;
  v_ids uuid[];
  v_pref uuid;
  v_staff uuid;
  v_lane smallint;
  v_dur int;
  v_check text;
  v_start timestamptz;
begin
  select ap.* into a from appointments ap where ap.token = p_token for update;
  if not found then raise exception 'CITA_NO_EXISTE'; end if;
  select * into b from businesses where id = a.business_id;
  if business_effective_plan(b.plan, b.trial_ends_at, b.paid_until) is null then
    raise exception 'NEGOCIO_INACTIVO';
  end if;
  if a.status not in ('pendiente', 'confirmada') then raise exception 'CITA_NO_MODIFICABLE'; end if;
  if a.starts_at <= now() + make_interval(hours => b.reschedule_notice_hours) then raise exception 'FUERA_DE_PLAZO'; end if;
  if b.max_reschedules is not null and a.reschedule_count >= b.max_reschedules then raise exception 'LIMITE_CAMBIOS'; end if;

  v_dur := greatest(5, (extract(epoch from (a.ends_at - a.starts_at)) / 60)::int);
  -- Mismo profesional; si ya no está activo, cualquiera que esté libre y haga sus servicios
  v_pref := (select st.id from staff st where st.id = a.staff_id and st.active);
  v_ids := (select array_agg(s.service_id) from appointment_services s where s.appointment_id = a.id and s.service_id is not null);
  v_check := _check_slot(b.id, p_date, p_time, v_dur, a.id, v_pref, v_ids);
  if v_check = 'invalido' then raise exception 'TURNO_INVALIDO'; end if;
  if v_check = 'ocupado' then raise exception 'TURNO_OCUPADO'; end if;

  v_start := (p_date + p_time::time) at time zone b.timezone;
  v_staff := (select f.staff_id from _free_staff(b.id, v_start, v_start + make_interval(mins => v_dur), v_pref, a.id, v_ids) f);
  v_lane := _free_lane(b.id, v_staff, v_start, v_start + make_interval(mins => v_dur), a.id);
  if v_lane is null then raise exception 'TURNO_OCUPADO'; end if;
  begin
    update appointments
       set starts_at = v_start, ends_at = v_start + make_interval(mins => v_dur),
           reschedule_count = reschedule_count + 1, status = 'pendiente',
           staff_id = v_staff, lane = v_lane
     where id = a.id;
  exception when exclusion_violation then
    raise exception 'TURNO_OCUPADO';
  end;
end;
$$;

-- El cliente cambia su cita desde su enlace: servicios, día y hora, profesional, nombre y nota.
-- Se puede cambiar las veces que quiera hasta el plazo de aviso del negocio. Si cambia algo más que
-- el nombre o la nota, la cita vuelve a quedar pendiente de que el negocio la confirme.
drop function if exists public.edit_booking(text, uuid[], date, text, text, text, uuid);
create or replace function public.edit_booking(
  p_token text, p_service_ids uuid[], p_date date, p_time text, p_name text,
  p_note text default null, p_staff uuid default null, p_options jsonb default null)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  a appointments;
  b businesses;
  d discounts;
  v_name text := btrim(coalesce(p_name, ''));
  v_time time;
  v_staff uuid;
  v_lane smallint;
  v_same boolean;
  v_changed boolean;
  v_count int;
  v_dur int;
  v_total numeric;
  v_disc numeric := 0;
  v_start timestamptz;
  v_check text;
begin
  select ap.* into a from appointments ap where ap.token = p_token for update;
  if not found then raise exception 'CITA_NO_EXISTE'; end if;
  select * into b from businesses where id = a.business_id;
  if business_effective_plan(b.plan, b.trial_ends_at, b.paid_until) is null then
    raise exception 'NEGOCIO_INACTIVO';
  end if;
  if a.status not in ('pendiente', 'confirmada') then raise exception 'CITA_NO_MODIFICABLE'; end if;
  if a.starts_at <= now() + make_interval(hours => b.reschedule_notice_hours) then raise exception 'FUERA_DE_PLAZO'; end if;
  if char_length(v_name) not between 2 and 80 then raise exception 'NOMBRE_INVALIDO'; end if;
  if p_service_ids is null or cardinality(p_service_ids) = 0 or cardinality(p_service_ids) > 10 then
    raise exception 'SERVICIOS_INVALIDOS';
  end if;
  if p_staff is not null and not exists (select 1 from staff where id = p_staff and business_id = b.id and active) then
    raise exception 'PROFESIONAL_INVALIDO';
  end if;
  begin
    v_time := p_time::time;
  exception when others then
    raise exception 'TURNO_INVALIDO';
  end;

  -- Mismos servicios (y opciones): se mantienen el precio y la duración con los que se reservó
  v_same := coalesce((select array_agg(distinct s.service_id order by s.service_id)
                        from appointment_services s where s.appointment_id = a.id), '{}')
            = (select array_agg(distinct x order by x) from unnest(p_service_ids) x)
        and not exists (select 1 from appointment_services s where s.appointment_id = a.id and s.option_id is not null
                          and s.option_id is distinct from _option_key(case when jsonb_typeof(p_options) = 'object'
                                                                            then p_options->s.service_id::text end));
  if v_same then
    v_dur := greatest(5, (extract(epoch from (a.ends_at - a.starts_at)) / 60)::int);
  else
    select count(*), sum(c.duration_min), sum(c.price) into v_count, v_dur, v_total
      from _chosen_services(b.id, p_service_ids, p_options) c;
    if v_count = 0 or v_count <> (select count(distinct x) from unnest(p_service_ids) x) then
      raise exception 'SERVICIOS_INVALIDOS';
    end if;
    if not exists (select 1 from services where business_id = b.id and active and not is_extra and id = any (p_service_ids)) then
      raise exception 'FALTA_SERVICIO_PRINCIPAL';
    end if;
    -- El cupón ya usado se vuelve a aplicar al nuevo total (sin gastar otro uso)
    if a.discount_code is not null then
      select * into d from discounts where business_id = b.id and code = a.discount_code;
      v_disc := case when found then least(v_total, coalesce(d.amount, round(v_total * d.percent / 100.0, 2)))
                     else least(v_total, a.discount) end;
    end if;
  end if;

  v_start := (p_date + v_time) at time zone b.timezone;
  -- El límite de cambios solo cuenta cuando se cambia el día o la hora (igual que reschedule_count)
  if v_start <> a.starts_at and b.max_reschedules is not null and a.reschedule_count >= b.max_reschedules then
    raise exception 'LIMITE_CAMBIOS';
  end if;
  v_changed := not v_same or v_start <> a.starts_at or p_staff is distinct from a.staff_id;
  if v_changed then
    v_check := _check_slot(b.id, p_date, p_time, v_dur, a.id, p_staff, p_service_ids);
    if v_check = 'invalido' then raise exception 'TURNO_INVALIDO'; end if;
    if v_check = 'ocupado' then raise exception 'TURNO_OCUPADO'; end if;
    v_staff := (select f.staff_id from _free_staff(b.id, v_start, v_start + make_interval(mins => v_dur), p_staff, a.id, p_service_ids) f);
    v_lane := _free_lane(b.id, v_staff, v_start, v_start + make_interval(mins => v_dur), a.id);
    if v_lane is null then raise exception 'TURNO_OCUPADO'; end if;
  end if;

  begin
    update appointments
       set customer_name = v_name,
           customer_note = nullif(left(btrim(coalesce(p_note, '')), 500), ''),
           starts_at = case when v_changed then v_start else starts_at end,
           ends_at = case when v_changed then v_start + make_interval(mins => v_dur) else ends_at end,
           staff_id = case when v_changed then v_staff else staff_id end,
           lane = case when v_changed then v_lane else lane end,
           total = case when v_same then total else v_total - v_disc end,
           discount = case when v_same then discount else v_disc end,
           usd_rate = case when v_same then usd_rate when b.usd_prices then b.usd_rate end,
           reschedule_count = reschedule_count + case when v_start <> a.starts_at then 1 else 0 end,
           status = case when v_changed then 'pendiente' else status end
     where id = a.id;
  exception when exclusion_violation then
    raise exception 'TURNO_OCUPADO';
  end;

  if not v_same then
    delete from appointment_services where appointment_id = a.id;
    insert into appointment_services (appointment_id, service_id, option_id, name, price, duration_min)
    select a.id, c.service_id, c.option_id, c.name, c.price, c.duration_min
      from _chosen_services(b.id, p_service_ids, p_options) c;
  end if;
end;
$$;

-- El cliente deja (o cambia) su opinión desde el enlace de su cita
create or replace function public.submit_review(p_token text, p_rating int, p_comment text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  a appointments;
  b businesses;
begin
  select * into a from appointments where token = p_token;
  if not found then raise exception 'CITA_NO_EXISTE'; end if;
  select * into b from businesses where id = a.business_id;
  if not plan_has(business_effective_plan(b.plan, b.trial_ends_at, b.paid_until), 'opiniones') then
    raise exception 'NO_DISPONIBLE';
  end if;
  if not _appt_done(a.status, a.ends_at) then raise exception 'OPINION_NO_PERMITIDA'; end if;
  if a.starts_at <= now() - interval '60 days' then raise exception 'OPINION_FUERA_DE_PLAZO'; end if;
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'VALORACION_INVALIDA'; end if;

  insert into reviews (business_id, appointment_id, customer_name, rating, comment)
  values (a.business_id, a.id, a.customer_name, p_rating, nullif(left(btrim(coalesce(p_comment, '')), 500), ''))
  on conflict (appointment_id) do update
    set rating = excluded.rating, comment = excluded.comment, updated_at = now();
end;
$$;

-- El cliente se apunta a la lista de espera de un día lleno
create or replace function public.join_waitlist(p_slug text, p_date date, p_name text, p_phone text, p_note text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  b businesses;
  v_phone text := _clean_phone(p_phone);
  v_today date;
begin
  select * into b from businesses where slug = lower(p_slug);
  if not found then raise exception 'NEGOCIO_NO_EXISTE'; end if;
  if business_effective_plan(b.plan, b.trial_ends_at, b.paid_until) is null then raise exception 'NEGOCIO_INACTIVO'; end if;
  if not plan_has(business_effective_plan(b.plan, b.trial_ends_at, b.paid_until), 'espera') then
    raise exception 'NO_DISPONIBLE';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 80 then raise exception 'NOMBRE_INVALIDO'; end if;
  if char_length(v_phone) not between 8 and 15 then raise exception 'TELEFONO_INVALIDO'; end if;
  v_today := (now() at time zone b.timezone)::date;
  if p_date is null or p_date < v_today or p_date > v_today + b.max_days_ahead then raise exception 'TURNO_INVALIDO'; end if;

  -- Ya apuntado ese día: no se duplica
  if exists (select 1 from waitlist where business_id = b.id and day = p_date
             and customer_phone = v_phone and status = 'esperando') then
    return;
  end if;
  if (select count(*) from waitlist where business_id = b.id and customer_phone = v_phone
      and status = 'esperando' and day >= v_today) >= 3 then
    raise exception 'LIMITE_ESPERA';
  end if;
  insert into waitlist (business_id, day, customer_name, customer_phone, note)
  values (b.id, p_date, btrim(p_name), v_phone, nullif(left(btrim(coalesce(p_note, '')), 300), ''));
end;
$$;

-- El cliente acepta recibir avisos push de su cita (recordatorio, confirmación, cancelación o
-- cambio por parte del negocio). Un mismo dispositivo/navegador solo guarda una suscripción
-- (la última cita para la que se activó), por eso el "on conflict" por endpoint.
create or replace function public.save_customer_push_subscription(p_token text, p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  a appointments;
begin
  select * into a from appointments where token = p_token;
  if not found then raise exception 'CITA_NO_EXISTE'; end if;
  insert into push_subscriptions (business_id, kind, appointment_id, endpoint, p256dh, auth)
  values (a.business_id, 'customer', a.id, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set
    business_id = excluded.business_id, kind = excluded.kind, appointment_id = excluded.appointment_id,
    p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;

-- Quita un dispositivo de los avisos push (cliente o dueño: el endpoint ya identifica la fila).
create or replace function public.delete_push_subscription(p_endpoint text)
returns void language sql volatile security definer set search_path = public as $$
  delete from push_subscriptions where endpoint = p_endpoint;
  delete from admin_push_subscriptions where endpoint = p_endpoint;
$$;

-- ---------------------------------------------------------------------
-- Enlace privado de un profesional (sin sesión): ve y cambia SUS servicios y SU horario.
-- Un servicio es suyo si solo lo hace él (staff_services); los que comparte con otros
-- profesionales, o los que tienen opciones de precio, solo los ve: los cambia el dueño.
-- ---------------------------------------------------------------------
create or replace function public._staff_by_token(p_token text)
returns staff language plpgsql stable security definer set search_path = public as $$
declare
  st staff;
begin
  if p_token is null or char_length(p_token) < 32 then raise exception 'ENLACE_CADUCADO'; end if;
  select * into st from staff where edit_token = p_token and active;
  if not found then raise exception 'ENLACE_CADUCADO'; end if;
  if not (select plan_has(business_effective_plan(b.plan, b.trial_ends_at, b.paid_until), 'empleados')
          from businesses b where b.id = st.business_id) then
    raise exception 'SIN_PLAN_EQUIPO';
  end if;
  return st;
end;
$$;

create or replace function public._slots_json(p_slots time[])
returns jsonb language sql immutable as $$
  select coalesce(jsonb_agg(to_char(t, 'HH24:MI') order by t), '[]'::jsonb) from unnest(p_slots) t;
$$;

create or replace function public.staff_portal(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  st staff := _staff_by_token(p_token);
  b businesses;
begin
  select * into b from businesses where id = st.business_id;
  return jsonb_build_object(
    'staff', jsonb_build_object('id', st.id, 'name', st.name, 'photo_url', st.photo_url, 'specialty', st.specialty),
    'business', jsonb_build_object('name', b.name, 'slug', b.slug, 'market', b.market, 'logo_url', b.logo_url, 'color_primary', b.color_primary,
                                   'currency', b.currency, 'usd_prices', b.usd_prices, 'timezone', b.timezone),
    -- Hace todos los servicios del negocio: entonces no tiene servicios propios que cambiar
    'all_services', not st.own_services and not exists (select 1 from staff_services where staff_id = st.id),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'name', s.name, 'description', s.description, 'price', s.price,
               'duration_min', s.duration_min, 'active', s.active, 'is_extra', s.is_extra,
               'has_options', jsonb_array_length(s.options) > 0,
               'shared', (select count(*) from staff_services x where x.service_id = s.id) > 1)
             order by s.is_extra, s.position, s.created_at)
      from services s join staff_services ss on ss.service_id = s.id and ss.staff_id = st.id), '[]'::jsonb),
    -- Con qué servicios puede apuntar una cita: los suyos, o todos los del negocio si los hace todos
    'bookable', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'is_extra', s.is_extra) order by s.is_extra, s.position, s.created_at)
      from services s
      where s.business_id = st.business_id and s.active
        and (exists (select 1 from staff_services ss where ss.staff_id = st.id and ss.service_id = s.id)
             or (not st.own_services and not exists (select 1 from staff_services ss where ss.staff_id = st.id)))), '[]'::jsonb),
    'schedule', coalesce((
      select jsonb_agg(jsonb_build_object('weekday', d.weekday, 'is_open', d.is_open, 'slots', _slots_json(d.slots)) order by d.weekday)
      from staff_schedule_days d where d.staff_id = st.id), '[]'::jsonb),
    'business_schedule', coalesce((
      select jsonb_agg(jsonb_build_object('weekday', d.weekday, 'is_open', d.is_open, 'slots', _slots_json(d.slots)) order by d.weekday)
      from schedule_days d where d.business_id = b.id), '[]'::jsonb));
end;
$$;

-- Crea (p_id null) o cambia uno de sus servicios. Devuelve su id.
create or replace function public.staff_portal_save_service(
  p_token text, p_id uuid, p_name text, p_price numeric, p_duration int,
  p_description text default null, p_active boolean default true, p_is_extra boolean default false)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  st staff := _staff_by_token(p_token);
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
  v_old_price numeric;
begin
  if not st.own_services and not exists (select 1 from staff_services where staff_id = st.id) then
    raise exception 'SIN_SERVICIOS_PROPIOS';
  end if;
  if char_length(v_name) not between 1 and 80 or p_price is null or p_price < 0 or p_price > 99999999
     or p_duration is null or p_duration not between 5 and 600 or char_length(coalesce(p_description, '')) > 300 then
    raise exception 'DATOS_INVALIDOS';
  end if;
  if p_id is null then
    if (select count(*) from services where business_id = st.business_id) >= 200 then raise exception 'DATOS_INVALIDOS'; end if;
    insert into services (business_id, name, price, duration_min, description, active, is_extra, position)
    values (st.business_id, v_name, round(p_price, 2), p_duration, nullif(btrim(coalesce(p_description, '')), ''),
            coalesce(p_active, true), coalesce(p_is_extra, false),
            coalesce((select max(position) + 1 from services where business_id = st.business_id), 0))
    returning id into v_id;
    insert into staff_services (staff_id, service_id) values (st.id, v_id);
    perform _notify_push(st.business_id, 'owner', null,
                         st.name || _l((select lang from businesses where id = st.business_id), ' añadió un servicio', ' added a service'),
                         v_name || ' · ' || round(p_price, 2)::text || ' · ' || p_duration || ' min');
    return v_id;
  end if;
  if not exists (select 1 from staff_services where staff_id = st.id and service_id = p_id)
     or (select count(*) from staff_services where service_id = p_id) > 1
     or exists (select 1 from services where id = p_id and jsonb_array_length(options) > 0) then
    raise exception 'SERVICIO_COMPARTIDO';
  end if;
  select price into v_old_price from services where id = p_id;
  if v_old_price is distinct from round(p_price, 2) then
    perform _notify_push(st.business_id, 'owner', null,
                         st.name || _l((select lang from businesses where id = st.business_id), ' cambió un precio', ' changed a price'),
                         v_name || _l((select lang from businesses where id = st.business_id),
                           ': de ' || v_old_price::text || ' a ' || round(p_price, 2)::text,
                           ': from ' || v_old_price::text || ' to ' || round(p_price, 2)::text));
  end if;
  update services set name = v_name, price = round(p_price, 2), duration_min = p_duration,
         description = nullif(btrim(coalesce(p_description, '')), ''), active = coalesce(p_active, true),
         is_extra = coalesce(p_is_extra, is_extra)
   where id = p_id and business_id = st.business_id;
  return p_id;
end;
$$;

-- Su agenda: sus citas entre dos días (como mucho 62), en la hora del negocio
create or replace function public.staff_portal_agenda(p_token text, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  st staff := _staff_by_token(p_token);
  v_tz text;
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then raise exception 'RANGO_INVALIDO'; end if;
  select timezone into v_tz from businesses where id = st.business_id;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', a.id, 'starts_at', a.starts_at, 'ends_at', a.ends_at, 'status', a.status,
             'customer_name', a.customer_name, 'customer_phone', a.customer_phone, 'customer_note', a.customer_note,
             'total', a.total, 'source', a.source,
             'services', coalesce((select jsonb_agg(s.name order by s.name) from appointment_services s where s.appointment_id = a.id), '[]'::jsonb))
           order by a.starts_at)
    from appointments a
    where a.staff_id = st.id
      and a.starts_at >= (p_from::timestamp at time zone v_tz)
      and a.starts_at < ((p_to + 1)::timestamp at time zone v_tz)), '[]'::jsonb);
end;
$$;

-- Cambia el estado de una de SUS citas (confirmar, vino, no vino, cancelar o volver a confirmada)
create or replace function public.staff_portal_set_status(p_token text, p_id uuid, p_status text)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  st staff := _staff_by_token(p_token);
  a appointments;
begin
  if p_status not in ('confirmada', 'completada', 'no_asistio', 'cancelada') then raise exception 'DATOS_INVALIDOS'; end if;
  select * into a from appointments where id = p_id and staff_id = st.id;
  if not found then raise exception 'CITA_NO_EXISTE'; end if;
  if a.status = 'cancelada' then raise exception 'CITA_NO_MODIFICABLE'; end if;
  update appointments set status = p_status where id = a.id;
end;
$$;

-- Apunta una cita a mano con ella (lo que le piden por WhatsApp o en persona): solo con sus servicios
create or replace function public.staff_portal_create_appointment(
  p_token text, p_service_ids uuid[], p_date date, p_time text, p_name text, p_phone text, p_note text default null)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  st staff := _staff_by_token(p_token);
  b businesses;
begin
  if p_service_ids is null or cardinality(p_service_ids) = 0 or cardinality(p_service_ids) > 10 then raise exception 'SERVICIOS_INVALIDOS'; end if;
  if not _staff_can_do(st.id, p_service_ids)
     or exists (select 1 from unnest(p_service_ids) x where not exists (select 1 from services s where s.id = x and s.business_id = st.business_id)) then
    raise exception 'SERVICIOS_INVALIDOS';
  end if;
  select * into b from businesses where id = st.business_id;
  return _manual_appointment(b, p_service_ids, p_date, p_time, p_name, p_phone, p_note, st.id, null);
end;
$$;

-- Sus números de los últimos p_days días (7, 30 o 90)
create or replace function public.staff_portal_stats(p_token text, p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  st staff := _staff_by_token(p_token);
  v_days int := least(greatest(coalesce(p_days, 30), 1), 366);
  v_from timestamptz := now() - make_interval(days => v_days);
begin
  return (
    select jsonb_build_object(
      'days', v_days,
      'appointments', count(*) filter (where a.status <> 'cancelada'),
      'done', count(*) filter (where _appt_done(a.status, a.ends_at)),
      'no_show', count(*) filter (where a.status = 'no_asistio'),
      'cancelled', count(*) filter (where a.status = 'cancelada'),
      'revenue', coalesce(sum(a.total) filter (where _appt_done(a.status, a.ends_at)), 0),
      'customers', count(distinct a.customer_phone) filter (where a.status <> 'cancelada'),
      'upcoming', (select count(*) from appointments u where u.staff_id = st.id and u.status in ('pendiente', 'confirmada') and u.starts_at > now()),
      'top_services', coalesce((
        select jsonb_agg(jsonb_build_object('name', t.name, 'count', t.n) order by t.n desc)
        from (select s.name, count(*) n from appointments x join appointment_services s on s.appointment_id = x.id
              where x.staff_id = st.id and x.starts_at >= v_from and x.starts_at <= now() and x.status <> 'cancelada'
              group by s.name order by count(*) desc limit 5) t), '[]'::jsonb))
    from appointments a
    where a.staff_id = st.id and a.starts_at >= v_from and a.starts_at <= now());
end;
$$;

-- Su especialidad (ej. "Uñas"): vacía = sin especialidad
create or replace function public.staff_portal_save_profile(p_token text, p_specialty text)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  st staff := _staff_by_token(p_token);
  v text := nullif(btrim(coalesce(p_specialty, '')), '');
begin
  if char_length(v) > 40 then raise exception 'DATOS_INVALIDOS'; end if;
  update staff set specialty = v where id = st.id;
end;
$$;

-- Su horario: [{weekday, is_open, slots: ["09:00", ...]}]. Vacío = usa el horario del negocio.
create or replace function public.staff_portal_save_schedule(p_token text, p_days jsonb)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  st staff := _staff_by_token(p_token);
  d jsonb;
  v_day int;
  v_open boolean;
  v_slots time[];
begin
  if p_days is null or jsonb_typeof(p_days) <> 'array' or jsonb_array_length(p_days) > 7 then raise exception 'DATOS_INVALIDOS'; end if;
  delete from staff_schedule_days where staff_id = st.id;
  for d in select x from jsonb_array_elements(p_days) x loop
    begin
      v_day := (d->>'weekday')::int;
      v_open := coalesce((d->>'is_open')::boolean, false);
      select coalesce(array_agg(t::time), '{}') into v_slots from jsonb_array_elements_text(d->'slots') t;
    exception when others then
      raise exception 'DATOS_INVALIDOS';
    end;
    if v_day is null or v_day not between 0 and 6 or cardinality(v_slots) > 96 then raise exception 'DATOS_INVALIDOS'; end if;
    insert into staff_schedule_days (staff_id, weekday, is_open, slots)
    values (st.id, v_day, v_open, v_slots)
    on conflict (staff_id, weekday) do update set is_open = excluded.is_open, slots = excluded.slots;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. FUNCIONES DEL DUEÑO (con sesión)
-- ---------------------------------------------------------------------

-- Crea el negocio al terminar el asistente. Empieza la prueba gratis.
-- Moneda: p_currency 'CUP' o 'USD'; con p_usd_prices, precios en USD y su equivalente en CUP a la tasa p_usd_rate.
drop function if exists public.create_business(text, text, text, text, text, text, jsonb, jsonb);
drop function if exists public.create_business(text, text, text, text, text, text, jsonb, jsonb, text, boolean);
-- p_market: 'cu' o 'int' (la versión donde se crea). p_timezone: la del móvil, solo para 'int'
-- (en Cuba se usa la de los ajustes).
drop function if exists public.create_business(text, text, text, text, text, text, jsonb, jsonb, text, boolean, numeric);
create or replace function public.create_business(
  p_name text, p_slug text, p_type text, p_whatsapp text, p_address text,
  p_color text, p_services jsonb, p_schedule jsonb,
  p_currency text default 'CUP', p_usd_prices boolean default false, p_usd_rate numeric default null,
  p_market text default 'cu', p_timezone text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_code text;
  v_prefix text;
  v_trial int;
  v_tz text;
  v_item jsonb;
  v_pos int := 0;
  i int := 0;
begin
  if v_uid is null then raise exception 'SIN_SESION'; end if;
  if exists (select 1 from businesses where owner_id = v_uid) then raise exception 'YA_TIENE_NEGOCIO'; end if;
  if not check_slug_available(p_slug) then raise exception 'ENLACE_NO_DISPONIBLE'; end if;
  if coalesce(p_market, 'cu') not in ('cu', 'int') then raise exception 'MERCADO_INVALIDO'; end if;

  select trial_days, default_timezone into v_trial, v_tz from platform_settings where id = 1;
  -- Una zona mal escrita en los ajustes no debe impedir que alguien cree su app
  if v_tz is null or not _is_valid_timezone(v_tz) then v_tz := 'Etc/GMT+4'; end if;
  -- Fuera de Cuba, la hora del móvil de quien la crea (si es una zona válida)
  if p_market = 'int' and p_timezone is not null and _is_valid_timezone(p_timezone) then v_tz := p_timezone; end if;

  v_prefix := upper(left(regexp_replace(lower(p_slug), '[^a-z]', '', 'g') || 'cit', 3));
  loop
    v_code := v_prefix || '-' || lpad((floor(random() * 10000))::int::text, 4, '0');
    exit when not exists (select 1 from businesses where code = v_code);
    i := i + 1;
    if i > 50 then raise exception 'ERROR_CODIGO'; end if;
  end loop;

  insert into businesses (owner_id, slug, code, name, business_type, whatsapp, address,
                          color_primary, trial_ends_at, policies, currency, usd_prices, usd_rate, timezone, market)
  values (v_uid, lower(p_slug), v_code, btrim(p_name), coalesce(nullif(p_type, ''), 'otro'),
          _clean_phone(p_whatsapp), nullif(btrim(coalesce(p_address, '')), ''),
          coalesce(nullif(p_color, ''), '#f0532e'),
          now() + make_interval(days => coalesce(v_trial, 3)),
          'Llega 5 minutos antes de tu cita. Si no puedes venir, cancela o cambia la fecha desde el enlace de tu cita.',
          coalesce(p_currency, 'CUP'), coalesce(p_usd_prices, false),
          case when p_usd_rate > 0 then round(p_usd_rate, 2) end, v_tz, coalesce(p_market, 'cu'))
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_services, '[]'::jsonb)) loop
    exit when v_pos >= 50;
    if coalesce(btrim(v_item ->> 'name'), '') <> '' then
      insert into services (business_id, name, price, duration_min, position)
      values (v_id, left(btrim(v_item ->> 'name'), 80),
              greatest(0, coalesce((v_item ->> 'price')::numeric, 0)),
              least(600, greatest(5, coalesce((v_item ->> 'duration_min')::int, 60))),
              v_pos);
      v_pos := v_pos + 1;
    end if;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_schedule, '[]'::jsonb)) loop
    insert into schedule_days (business_id, weekday, is_open, slots)
    values (v_id, (v_item ->> 'weekday')::smallint, coalesce((v_item ->> 'is_open')::boolean, false),
            coalesce((select array_agg(x::time) from jsonb_array_elements_text(v_item -> 'slots') x), '{}'))
    on conflict (business_id, weekday) do update set is_open = excluded.is_open, slots = excluded.slots;
  end loop;

  perform _notify_admin_push(case when p_market = 'int' then 'Negocio nuevo registrado (internacional)' else 'Negocio nuevo registrado' end,
    btrim(p_name) || ' (' || v_code || ') acaba de empezar su prueba gratis.');

  return jsonb_build_object('id', v_id, 'slug', lower(p_slug), 'code', v_code);
end;
$$;

-- Estado del negocio del dueño (plan, prueba, vencimiento)
create or replace function public.get_my_business_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'status', business_status(plan, trial_ends_at, paid_until),
    'effective_plan', business_effective_plan(plan, trial_ends_at, paid_until),
    'plan', plan,
    'trial_ends_at', trial_ends_at,
    'paid_until', paid_until,
    'code', code)
  from businesses where owner_id = auth.uid();
$$;

-- Cómo le va al dueño desde que empezó (Primeros pasos, Mi negocio y Mensualidad).
--   web_total   reservas hechas por clientes desde su enlace (sin canceladas)
--   web_real    las mismas, sin las que hizo el propio dueño con su WhatsApp (reserva de prueba)
--   push_on     tiene los avisos activados en algún móvil
--   visits_7d   personas distintas que abrieron su página en los últimos 7 días
--   bookings / web / revenue   desde que creó su app (revenue: citas hechas)
create or replace function public.get_my_progress()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  b businesses;
  v_phone text;
begin
  select * into b from businesses where owner_id = auth.uid();
  if not found then return null; end if;
  v_phone := right(regexp_replace(coalesce(b.whatsapp, ''), '\D', '', 'g'), 8);
  return (
    select jsonb_build_object(
      'web_total', count(*) filter (where a.source = 'web'),
      'web_real', count(*) filter (where a.source = 'web'
                    and (v_phone = '' or right(regexp_replace(a.customer_phone, '\D', '', 'g'), 8) <> v_phone)),
      'bookings', count(*),
      'revenue', coalesce(sum(a.total) filter (where a.status = 'completada'), 0),
      'push_on', exists (select 1 from push_subscriptions ps where ps.business_id = b.id and ps.kind = 'owner'),
      'visits_7d', (select count(distinct e.visitor_id) from analytics_events e
                    where e.slug = b.slug and e.name = 'visita' and e.created_at > now() - interval '7 days'))
    from appointments a
    where a.business_id = b.id and a.status <> 'cancelada');
end;
$$;

-- El dueño crea, ve o anula el enlace privado de uno de sus profesionales.
--   p_action: 'ver' (lo crea si no tiene), 'nuevo' (el anterior deja de valer) o 'anular'
create or replace function public.owner_staff_link(p_staff uuid, p_action text default 'ver')
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  st staff;
begin
  select s.* into st from staff s join businesses b on b.id = s.business_id
   where s.id = p_staff and b.owner_id = auth.uid();
  if not found then raise exception 'PROFESIONAL_INVALIDO'; end if;
  if p_action = 'anular' then
    update staff set edit_token = null where id = st.id;
    return null;
  end if;
  if p_action = 'nuevo' or st.edit_token is null then
    st.edit_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    update staff set edit_token = st.edit_token where id = st.id;
  end if;
  return st.edit_token;
end;
$$;

-- El dueño reparte los servicios del salón entre su equipo, de una vez y sin quedarse a medias.
--   p_map: {"<id del profesional>": ["<id de servicio>", ...], ...} con todo su equipo activo.
-- Cada profesional pasa a hacer solo lo suyo (own_services); lo que no tiene nadie es del dueño.
create or replace function public.owner_set_team_services(p_map jsonb)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_business uuid := my_business_id();
  k text;
  v_staff uuid;
  v_ids uuid[];
begin
  if v_business is null then raise exception 'SIN_NEGOCIO'; end if;
  if not my_plan_has('empleados') then raise exception 'NO_DISPONIBLE'; end if;
  if p_map is null or jsonb_typeof(p_map) <> 'object' then raise exception 'DATOS_INVALIDOS'; end if;
  for k in select jsonb_object_keys(p_map) loop
    begin
      v_staff := k::uuid;
      select coalesce(array_agg(distinct x::uuid), '{}') into v_ids from jsonb_array_elements_text(p_map -> k) x;
    exception when others then
      raise exception 'DATOS_INVALIDOS';
    end;
    if not exists (select 1 from staff where id = v_staff and business_id = v_business) then raise exception 'PROFESIONAL_INVALIDO'; end if;
    if exists (select 1 from unnest(v_ids) x where not exists (select 1 from services s where s.id = x and s.business_id = v_business)) then
      raise exception 'SERVICIOS_INVALIDOS';
    end if;
    delete from staff_services where staff_id = v_staff;
    insert into staff_services (staff_id, service_id) select v_staff, x from unnest(v_ids) x;
    update staff set own_services = true where id = v_staff;
  end loop;
end;
$$;

-- Datos para pagar (tarjeta y WhatsApp del administrador)
-- En la versión internacional, los precios en USD y el PayPal en vez de la tarjeta.
create or replace function public.get_payment_info()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_int boolean;
begin
  if auth.uid() is null then raise exception 'SIN_SESION'; end if;
  v_int := coalesce((select market = 'int' from businesses where owner_id = auth.uid()), false);
  return (select jsonb_build_object(
    'admin_whatsapp', admin_whatsapp, 'community_url', community_url,
    'market', case when v_int then 'int' else 'cu' end,
    'currency', case when v_int then 'USD' else 'CUP' end,
    'card_number', case when v_int then '' else card_number end,
    'card_holder', case when v_int then '' else card_holder end,
    'card_phone', case when v_int then '' else card_phone end,
    'paypal_client_id', case when v_int then paypal_client_id else '' end,
    'basico', case when v_int then price_int_basico else price_basico end,
    'plus', case when v_int then price_int_basico else price_plus end,
    'ultra', case when v_int then price_int_ultra else price_ultra end)
    from platform_settings where id = 1);
end;
$$;

-- El dueño acepta recibir avisos push en este dispositivo (citas nuevas, canceladas o cambiadas
-- por un cliente). Igual que con el cliente, un dispositivo guarda una sola suscripción.
create or replace function public.save_owner_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_business uuid := my_business_id();
begin
  if v_business is null then raise exception 'SIN_NEGOCIO'; end if;
  insert into push_subscriptions (business_id, kind, appointment_id, endpoint, p256dh, auth)
  values (v_business, 'owner', null, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set
    business_id = excluded.business_id, kind = excluded.kind, appointment_id = null,
    p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;

-- Cita creada por el dueño desde su agenda (puede ser a cualquier hora)
drop function if exists public.owner_create_appointment(uuid[], date, text, text, text, text);
drop function if exists public.owner_create_appointment(uuid[], date, text, text, text, text, uuid);
-- Una cita apuntada a mano (por el dueño o por una profesional con su enlace): a cualquier hora,
-- sin más regla que no pisar otra cita de esa persona (o de la agenda del negocio)
create or replace function public._manual_appointment(
  b businesses, p_service_ids uuid[], p_date date, p_time text, p_name text, p_phone text,
  p_note text, p_staff uuid, p_options jsonb)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_dur int;
  v_total numeric;
  v_start timestamptz;
  v_lane smallint;
  v_id uuid;
begin
  if business_effective_plan(b.plan, b.trial_ends_at, b.paid_until) is null then
    raise exception 'NEGOCIO_INACTIVO';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'NOMBRE_INVALIDO'; end if;
  if p_staff is not null and not exists (select 1 from staff where id = p_staff and business_id = b.id) then
    raise exception 'PROFESIONAL_INVALIDO';
  end if;

  select coalesce(sum(c.duration_min), 0), coalesce(sum(c.price), 0) into v_dur, v_total
    from _chosen_services(b.id, p_service_ids, p_options, false) c;
  if v_dur = 0 then v_dur := 60; end if;

  v_start := (p_date + p_time::time) at time zone b.timezone;
  v_lane := _free_lane(b.id, p_staff, v_start, v_start + make_interval(mins => v_dur));
  if v_lane is null then raise exception 'TURNO_OCUPADO'; end if;
  begin
    insert into appointments (business_id, token, starts_at, ends_at, customer_name, customer_phone,
                              customer_note, total, status, source, staff_id, usd_rate, lane)
    values (b.id, replace(gen_random_uuid()::text, '-', ''), v_start,
            v_start + make_interval(mins => v_dur), btrim(p_name), _clean_phone(p_phone),
            nullif(btrim(coalesce(p_note, '')), ''), v_total, 'confirmada', 'manual', p_staff,
            case when b.usd_prices then b.usd_rate end, v_lane)
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'TURNO_OCUPADO';
  end;

  insert into appointment_services (appointment_id, service_id, option_id, name, price, duration_min)
  select v_id, c.service_id, c.option_id, c.name, c.price, c.duration_min
    from _chosen_services(b.id, p_service_ids, p_options, false) c;
  return v_id;
end;
$$;

create or replace function public.owner_create_appointment(
  p_service_ids uuid[], p_date date, p_time text, p_name text, p_phone text, p_note text default null,
  p_staff uuid default null, p_options jsonb default null)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  b businesses;
begin
  select * into b from businesses where owner_id = auth.uid();
  if not found then raise exception 'SIN_NEGOCIO'; end if;
  return _manual_appointment(b, p_service_ids, p_date, p_time, p_name, p_phone, p_note, p_staff, p_options);
end;
$$;

-- El dueño mueve una cita (comprueba solapes, permite cualquier hora)
create or replace function public.owner_reschedule_appointment(p_id uuid, p_date date, p_time text)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  b businesses;
  a appointments;
  v_dur int;
  v_start timestamptz;
  v_lane smallint;
begin
  select * into b from businesses where owner_id = auth.uid();
  if not found then raise exception 'SIN_NEGOCIO'; end if;
  if business_effective_plan(b.plan, b.trial_ends_at, b.paid_until) is null then
    raise exception 'NEGOCIO_INACTIVO';
  end if;
  select * into a from appointments where id = p_id and business_id = b.id for update;
  if not found then raise exception 'CITA_NO_EXISTE'; end if;
  v_dur := greatest(5, (extract(epoch from (a.ends_at - a.starts_at)) / 60)::int);
  v_start := (p_date + p_time::time) at time zone b.timezone;
  v_lane := _free_lane(b.id, a.staff_id, v_start, v_start + make_interval(mins => v_dur), a.id);
  if v_lane is null then raise exception 'TURNO_OCUPADO'; end if;
  begin
    update appointments set starts_at = v_start, ends_at = v_start + make_interval(mins => v_dur), lane = v_lane
     where id = a.id;
  exception when exclusion_violation then
    raise exception 'TURNO_OCUPADO';
  end;
end;
$$;

-- Negocio del dueño con sesión, comprobando que su plan incluye el módulo
create or replace function public._owner_business(p_module text)
returns businesses language plpgsql stable security definer set search_path = public as $$
declare
  b businesses;
begin
  select * into b from businesses where owner_id = auth.uid();
  if not found then raise exception 'SIN_NEGOCIO'; end if;
  if business_effective_plan(b.plan, b.trial_ends_at, b.paid_until) is null then
    raise exception 'NEGOCIO_INACTIVO';
  end if;
  if not plan_has(business_effective_plan(b.plan, b.trial_ends_at, b.paid_until), p_module) then
    raise exception 'NO_DISPONIBLE';
  end if;
  return b;
end;
$$;

-- Ficha de clientes: un resumen por teléfono
create or replace function public.owner_customers()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  b businesses := _owner_business('clientes');
begin
  return coalesce((
    select jsonb_agg(c.j order by c.last_at desc nulls last)
    from (
      select greatest(max(a.starts_at) filter (where a.status <> 'cancelada'), max(a.created_at)) as last_at,
        jsonb_build_object(
          'phone', a.customer_phone,
          'name', (array_agg(a.customer_name order by a.created_at desc))[1],
          'bookings', count(*) filter (where a.status <> 'cancelada'),
          'visits', count(*) filter (where _appt_done(a.status, a.ends_at)),
          'no_shows', count(*) filter (where a.status = 'no_asistio'),
          'cancelled', count(*) filter (where a.status = 'cancelada'),
          'spent', coalesce(sum(a.total) filter (where _appt_done(a.status, a.ends_at)), 0),
          'first_at', min(a.starts_at),
          'last_visit', max(a.starts_at) filter (where _appt_done(a.status, a.ends_at)),
          'next_at', min(a.starts_at) filter (where a.status in ('pendiente', 'confirmada') and a.starts_at > now()),
          'note', n.note,
          'tags', coalesce(to_jsonb(n.tags), '[]'::jsonb)
        ) as j
      from appointments a
      left join customer_notes n on n.business_id = a.business_id and n.phone = a.customer_phone
      where a.business_id = b.id and a.customer_phone <> ''
      group by a.customer_phone, n.note, n.tags
    ) c), '[]'::jsonb);
end;
$$;

-- Estadísticas del negocio entre dos días (incluidos), en su zona horaria
create or replace function public.owner_stats(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  b businesses := _owner_business('finanzas');
  v_from timestamptz;
  v_to timestamptz;
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    raise exception 'RANGO_INVALIDO';
  end if;
  v_from := p_from::timestamp at time zone b.timezone;
  v_to := (p_to + 1)::timestamp at time zone b.timezone;

  return jsonb_build_object(
    'summary', (
      select jsonb_build_object(
        'bookings', count(*) filter (where a.status <> 'cancelada'),
        'done', count(*) filter (where _appt_done(a.status, a.ends_at)),
        'upcoming', count(*) filter (where a.status in ('pendiente', 'confirmada') and a.ends_at >= now()),
        'cancelled', count(*) filter (where a.status = 'cancelada'),
        'no_shows', count(*) filter (where a.status = 'no_asistio'),
        'revenue', coalesce(sum(a.total) filter (where _appt_done(a.status, a.ends_at)), 0),
        'expected', coalesce(sum(a.total) filter (where a.status in ('pendiente', 'confirmada') and a.ends_at >= now()), 0),
        'web', count(*) filter (where a.source = 'web' and a.status <> 'cancelada'),
        'manual', count(*) filter (where a.source = 'manual' and a.status <> 'cancelada'),
        'customers', count(distinct a.customer_phone) filter (where a.status <> 'cancelada'),
        'new_customers', count(distinct a.customer_phone) filter (
          where a.status <> 'cancelada' and not exists (
            select 1 from appointments p
            where p.business_id = b.id and p.customer_phone = a.customer_phone
              and p.status <> 'cancelada' and p.starts_at < v_from)),
        'expenses', (select coalesce(sum(e.amount), 0) from expenses e
                     where e.business_id = b.id and e.day between p_from and p_to)
      )
      from appointments a
      where a.business_id = b.id and a.starts_at >= v_from and a.starts_at < v_to),
    'by_day', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', d.day, 'bookings', coalesce(x.n, 0), 'revenue', coalesce(x.r, 0),
        'expenses', coalesce(e.total, 0)) order by d.day), '[]'::jsonb)
      from (select g::date as day from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') g) d
      left join (
        select (a.starts_at at time zone b.timezone)::date as day, count(*) as n,
               sum(a.total) filter (where _appt_done(a.status, a.ends_at)) as r
        from appointments a
        where a.business_id = b.id and a.starts_at >= v_from and a.starts_at < v_to and a.status <> 'cancelada'
        group by 1) x on x.day = d.day
      left join (
        select ex.day, sum(ex.amount) as total from expenses ex
        where ex.business_id = b.id and ex.day between p_from and p_to
        group by 1) e on e.day = d.day),
    'expenses_by_category', (
      select coalesce(jsonb_agg(jsonb_build_object('category', q.category, 'total', q.total) order by q.total desc), '[]'::jsonb)
      from (select e.category, sum(e.amount) as total from expenses e
            where e.business_id = b.id and e.day between p_from and p_to
            group by e.category) q),
    'top_services', (
      select coalesce(jsonb_agg(jsonb_build_object('name', q.name, 'count', q.n, 'revenue', q.r) order by q.n desc, q.r desc), '[]'::jsonb)
      from (
        select s.name, count(*) as n, coalesce(sum(s.price), 0) as r
        from appointment_services s join appointments a on a.id = s.appointment_id
        where a.business_id = b.id and a.starts_at >= v_from and a.starts_at < v_to and a.status <> 'cancelada'
        group by s.name order by count(*) desc, sum(s.price) desc limit 8) q),
    'by_weekday', (
      select jsonb_agg(coalesce(x.n, 0) order by w)
      from generate_series(0, 6) w
      left join (
        select extract(dow from a.starts_at at time zone b.timezone)::int as wd, count(*) as n
        from appointments a
        where a.business_id = b.id and a.starts_at >= v_from and a.starts_at < v_to and a.status <> 'cancelada'
        group by 1) x on x.wd = w),
    'by_hour', (
      select coalesce(jsonb_agg(jsonb_build_object('hour', x.h, 'count', x.n) order by x.h), '[]'::jsonb)
      from (
        select extract(hour from a.starts_at at time zone b.timezone)::int as h, count(*) as n
        from appointments a
        where a.business_id = b.id and a.starts_at >= v_from and a.starts_at < v_to and a.status <> 'cancelada'
        group by 1) x)
  );
end;
$$;

-- La encuesta que le toca responder al dueño: la más reciente abierta que todavía no respondió (o null)
create or replace function public.get_my_survey()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', s.id, 'title', s.title, 'intro', s.intro, 'questions', s.questions)
  from owner_surveys s
  where s.active and my_business_id() is not null
    and (s.business_ids is null or my_business_id() = any (s.business_ids))
    and not exists (select 1 from owner_survey_answers a where a.survey_id = s.id and a.business_id = my_business_id())
  order by s.created_at desc
  limit 1;
$$;

-- El dueño responde una encuesta. Estrellas (1 a 5) y Sí/No son obligatorias; el texto, opcional.
-- Solo se guardan las preguntas de la encuesta, limpias. Si vuelve a responder, se cambia su respuesta.
create or replace function public.submit_survey_answer(p_survey uuid, p_answers jsonb)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_business uuid := my_business_id();
  s owner_surveys;
  q jsonb;
  v jsonb;
  r jsonb := '{}'::jsonb;
  v_name text;
  v_code text;
begin
  if v_business is null then raise exception 'SIN_NEGOCIO'; end if;
  select * into s from owner_surveys where id = p_survey;
  if not found or not s.active then raise exception 'ENCUESTA_CERRADA'; end if;
  if s.business_ids is not null and not (v_business = any (s.business_ids)) then raise exception 'ENCUESTA_CERRADA'; end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then raise exception 'RESPUESTA_INVALIDA'; end if;

  for q in select * from jsonb_array_elements(s.questions) loop
    v := p_answers -> (q ->> 'id');
    if q ->> 'type' = 'estrellas' then
      if v is null or jsonb_typeof(v) <> 'number' or v::text not in ('1', '2', '3', '4', '5') then
        raise exception 'RESPUESTA_INVALIDA';
      end if;
    elsif q ->> 'type' = 'si_no' then
      if v is null or jsonb_typeof(v) <> 'boolean' then raise exception 'RESPUESTA_INVALIDA'; end if;
    else
      if v is null or jsonb_typeof(v) = 'null' then continue; end if;
      if jsonb_typeof(v) <> 'string' then raise exception 'RESPUESTA_INVALIDA'; end if;
      v := to_jsonb(left(btrim(v #>> '{}'), 1000));
      if v #>> '{}' = '' then continue; end if;
    end if;
    r := r || jsonb_build_object(q ->> 'id', v);
  end loop;
  if r = '{}'::jsonb then raise exception 'RESPUESTA_INVALIDA'; end if;

  insert into owner_survey_answers (survey_id, business_id, answers)
  values (s.id, v_business, r)
  on conflict (survey_id, business_id) do update set answers = excluded.answers, created_at = now();

  select name, code into v_name, v_code from businesses where id = v_business;
  perform _notify_admin_push('Opinión recibida', v_name || ' (' || v_code || ') respondió "' || s.title || '".');
end;
$$;

-- ---------------------------------------------------------------------
-- 7. FUNCIONES DEL ADMINISTRADOR
-- ---------------------------------------------------------------------

create or replace function public.admin_list_businesses()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'NO_AUTORIZADO'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', b.id, 'name', b.name, 'slug', b.slug, 'code', b.code, 'business_type', b.business_type,
      'whatsapp', b.whatsapp, 'plan', b.plan, 'trial_ends_at', b.trial_ends_at,
      'paid_until', b.paid_until, 'created_at', b.created_at, 'market', b.market,
      'status', business_status(b.plan, b.trial_ends_at, b.paid_until),
      'owner_email', u.email,
      'appointments_count', (select count(*) from appointments a where a.business_id = b.id)
    ) order by b.created_at desc)
    from businesses b left join auth.users u on u.id = b.owner_id), '[]'::jsonb);
end;
$$;

-- El administrador le pone una contraseña provisional a un dueño que no puede entrar (el correo de
-- "Olvidé mi contraseña" no le llega). Devuelve la contraseña, de 8 letras y números fáciles de dictar
-- (sin 0/o ni 1/l). El dueño entra con ella y la cambia en su panel (Ajustes → Cambiar mi contraseña).
create or replace function public.admin_set_temp_password(p_user uuid)
returns text language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_chars text := 'abcdefghjkmnpqrstuvwxyz23456789';
  v_bytes bytea := extensions.gen_random_bytes(8);
  v_pass text := '';
begin
  if not is_platform_admin() then raise exception 'NO_AUTORIZADO'; end if;
  -- A otro administrador no se le cambia la contraseña desde aquí
  if exists (select 1 from platform_admins where user_id = p_user) then raise exception 'NO_AUTORIZADO'; end if;
  for i in 0..7 loop
    v_pass := v_pass || substr(v_chars, 1 + get_byte(v_bytes, i) % length(v_chars), 1);
  end loop;
  update auth.users
     set encrypted_password = extensions.crypt(v_pass, extensions.gen_salt('bf')),
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         updated_at = now()
   where id = p_user;
  if not found then raise exception 'NEGOCIO_NO_EXISTE'; end if;
  return v_pass;
end;
$$;

-- El administrador pasa un negocio a la otra versión ('cu' Cuba o 'int' internacional). Su web y su
-- panel se abren desde entonces en la suya (los enlaces de la otra llevan allí solos).
create or replace function public.admin_set_market(p_business uuid, p_market text)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'NO_AUTORIZADO'; end if;
  if p_market is null or p_market not in ('cu', 'int') then raise exception 'MERCADO_INVALIDO'; end if;
  update businesses set market = p_market where id = p_business;
  if not found then raise exception 'NEGOCIO_NO_EXISTE'; end if;
end;
$$;

-- El administrador acepta avisos push en este dispositivo (ej. negocio nuevo registrado).
create or replace function public.save_admin_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'NO_AUTORIZADO'; end if;
  insert into admin_push_subscriptions (endpoint, p256dh, auth)
  values (p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;

-- Todas las cuentas de dueños (con o sin negocio creado), sin contar a los administradores
create or replace function public.admin_list_owners()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'NO_AUTORIZADO'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', u.id, 'email', u.email, 'signed_up_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at,
      'id', b.id, 'name', b.name, 'slug', b.slug, 'code', b.code, 'business_type', b.business_type,
      'whatsapp', b.whatsapp, 'plan', b.plan, 'trial_ends_at', b.trial_ends_at,
      'paid_until', b.paid_until, 'created_at', b.created_at, 'comped', coalesce(b.comped, false),
      'timezone', b.timezone, 'market', b.market,
      'status', case when b.id is null then 'sin_negocio'
                     else business_status(b.plan, b.trial_ends_at, b.paid_until) end
    ) order by u.created_at desc)
    from auth.users u
    left join businesses b on b.owner_id = u.id
    where not exists (select 1 from platform_admins a where a.user_id = u.id)), '[]'::jsonb);
end;
$$;

-- Suma los meses pagados a un negocio y apunta el pago (lo usan admin_activate_plan, a mano, y
-- online_payment_complete, al pagar con PayPal). La moneda es la de su versión: CUP o USD.
create or replace function public._activate_plan(
  p_business uuid, p_plan text, p_months int, p_amount numeric, p_note text, p_by uuid)
returns timestamptz language plpgsql volatile security definer set search_path = public as $$
declare
  b businesses;
  v_until timestamptz;
begin
  if p_plan not in ('basico', 'plus', 'ultra') then raise exception 'PLAN_INVALIDO'; end if;
  if p_months is null or p_months not between 1 and 24 then raise exception 'MESES_INVALIDOS'; end if;
  select * into b from businesses where id = p_business for update;
  if not found then raise exception 'NEGOCIO_NO_EXISTE'; end if;

  -- Si aún tiene meses pagados, se suman al final; si no, empiezan hoy
  v_until := greatest(now(), coalesce(b.paid_until, now())) + make_interval(months => p_months);
  -- Un pago real ya no es cortesía, aunque antes se le haya regalado la app
  update businesses set plan = p_plan, paid_until = v_until, comped = false,
                        comped_prev_plan = null, comped_prev_paid_until = null
   where id = b.id;
  insert into payments (business_id, plan, months, amount, note, paid_until, created_by, business_name, business_code, currency)
  values (b.id, p_plan, p_months, p_amount, nullif(btrim(coalesce(p_note, '')), ''), v_until, p_by, b.name, b.code,
          case when b.market = 'int' then 'USD' else 'CUP' end);
  return v_until;
end;
$$;

create or replace function public.admin_activate_plan(
  p_business uuid, p_plan text, p_months int, p_amount numeric default null, p_note text default null)
returns timestamptz language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'NO_AUTORIZADO'; end if;
  return _activate_plan(p_business, p_plan, p_months, p_amount, p_note, auth.uid());
end;
$$;

-- Precio de un pago en línea (versión internacional): plan y meses al precio en USD de los ajustes.
-- Lo calcula siempre la base de datos: el navegador no puede elegir cuánto paga.
create or replace function public.online_order_price(p_business uuid, p_plan text, p_months int)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  s platform_settings;
begin
  if p_plan not in ('basico', 'ultra') then raise exception 'PLAN_INVALIDO'; end if;
  if p_months is null or p_months not between 1 and 24 then raise exception 'MESES_INVALIDOS'; end if;
  if not exists (select 1 from businesses where id = p_business and market = 'int') then raise exception 'NEGOCIO_NO_EXISTE'; end if;
  select * into s from platform_settings where id = 1;
  return round((case when p_plan = 'ultra' then s.price_int_ultra else s.price_int_basico end) * p_months, 2);
end;
$$;

-- PayPal confirmó el cobro de un pedido (lo llama la función paypal-checkout tras capturarlo). Suma los
-- meses y apunta el pago, una sola vez aunque se llame dos veces. El importe y la moneda cobrados tienen
-- que ser los del pedido. Devuelve hasta cuándo queda pagado.
create or replace function public.online_payment_complete(p_order text, p_amount numeric, p_currency text, p_capture text)
returns timestamptz language plpgsql volatile security definer set search_path = public as $$
declare
  o online_orders;
  v_until timestamptz;
begin
  select * into o from online_orders where provider_order_id = p_order for update;
  if not found then raise exception 'PEDIDO_NO_EXISTE'; end if;
  if o.status = 'pagada' then
    return (select paid_until from businesses where id = o.business_id);
  end if;
  if p_currency is distinct from o.currency or p_amount is distinct from o.amount then raise exception 'IMPORTE_INVALIDO'; end if;
  if o.business_id is null then raise exception 'NEGOCIO_NO_EXISTE'; end if;
  v_until := _activate_plan(o.business_id, o.plan, o.months, o.amount, 'PayPal · ' || coalesce(p_capture, p_order), null);
  update online_orders set status = 'pagada', capture_id = p_capture, paid_at = now() where id = o.id;
  perform _notify_admin_push('Pago recibido (PayPal)',
    coalesce((select name || ' (' || code || ')' from businesses where id = o.business_id), 'Un negocio') ||
    ' pagó ' || o.months || case when o.months = 1 then ' mes' else ' meses' end || ' · ' || o.amount || ' USD.');
  return v_until;
end;
$$;

-- El administrador regala la app para siempre (sin pasar por caja): activa el plan único con un
-- vencimiento muy lejano y marca el negocio como cortesía, para que ni este regalo ni ningún pago
-- anterior suyo se sumen a los ingresos ni aparezcan en "Últimos pagos" (ver admin_stats).
create or replace function public.admin_grant_free(p_business uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'NO_AUTORIZADO'; end if;
  update businesses
     set comped_prev_plan = case when comped then comped_prev_plan else plan end,
         comped_prev_paid_until = case when comped then comped_prev_paid_until else paid_until end,
         plan = 'ultra', paid_until = now() + interval '100 years', comped = true
   where id = p_business;
  if not found then raise exception 'NEGOCIO_NO_EXISTE'; end if;
end;
$$;

-- Deshace la cortesía: el negocio vuelve exactamente a como estaba antes de regalarla (su plan y la
-- fecha hasta la que había pagado; si no había pagado, a su prueba o a inhabilitado, según su fecha).
create or replace function public.admin_revoke_free(p_business uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'NO_AUTORIZADO'; end if;
  update businesses
     set plan = comped_prev_plan, paid_until = comped_prev_paid_until, comped = false,
         comped_prev_plan = null, comped_prev_paid_until = null
   where id = p_business and comped;
  if not found then raise exception 'NEGOCIO_NO_EXISTE'; end if;
end;
$$;

-- El dueño declara que pagó (ver payment_claims): sube su captura y los datos desde su panel.
drop function if exists public.submit_payment_claim(int, numeric, text, text);
create or replace function public.submit_payment_claim(p_months int, p_amount numeric default null, p_note text default null,
                                                        p_proof_path text default null, p_plan text default 'basico')
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_business uuid := my_business_id();
  v_name text;
  v_code text;
  v_id uuid;
begin
  if v_business is null then raise exception 'SIN_NEGOCIO'; end if;
  if p_months is null or p_months not between 1 and 24 then raise exception 'MESES_INVALIDOS'; end if;
  if coalesce(p_plan, 'basico') not in ('basico', 'ultra') then raise exception 'PLAN_INVALIDO'; end if;
  if nullif(btrim(coalesce(p_proof_path, '')), '') is null then raise exception 'FALTA_COMPROBANTE'; end if;
  -- La captura tiene que ser una subida por este mismo negocio (su carpeta en "payment-proofs"),
  -- no la de otro negocio ni un enlace de fuera
  if p_proof_path not like v_business::text || '/%' or p_proof_path like '%..%' then
    raise exception 'FALTA_COMPROBANTE';
  end if;
  insert into payment_claims (business_id, months, amount, note, proof_path, plan, currency)
  values (v_business, p_months, p_amount, nullif(btrim(coalesce(p_note, '')), ''), p_proof_path, coalesce(p_plan, 'basico'),
          (select case when market = 'int' then 'USD' else 'CUP' end from businesses where id = v_business))
  returning id into v_id;

  select name, code into v_name, v_code from businesses where id = v_business;
  perform _notify_admin_push('Pago declarado',
    v_name || ' (' || v_code || ') declaró el pago de ' || p_months ||
    case when p_months = 1 then ' mes' else ' meses' end ||
    case when p_plan = 'ultra' then ' del plan Equipo' else ' del plan Solo' end || '. Revísalo en Admin → Cobros.');

  return v_id;
end;
$$;

-- El administrador aprueba una declaración de pago: activa los meses del plan que eligió el dueño
-- (igual que admin_activate_plan) y marca la declaración como resuelta.
create or replace function public.admin_approve_payment_claim(p_claim_id uuid, p_amount numeric default null, p_note text default null)
returns timestamptz language plpgsql volatile security definer set search_path = public as $$
declare
  c payment_claims;
  v_until timestamptz;
begin
  if not is_platform_admin() then raise exception 'NO_AUTORIZADO'; end if;
  select * into c from payment_claims where id = p_claim_id for update;
  if not found then raise exception 'NO_DISPONIBLE'; end if;
  if c.status <> 'pendiente' then raise exception 'NO_DISPONIBLE'; end if;
  v_until := admin_activate_plan(c.business_id, c.plan, c.months, coalesce(p_amount, c.amount), coalesce(nullif(btrim(coalesce(p_note, '')), ''), c.note));
  update payment_claims set status = 'aprobado', resolved_at = now(), resolved_by = auth.uid() where id = c.id;
  return v_until;
end;
$$;

-- El administrador rechaza una declaración de pago (ej. el comprobante no coincide)
create or replace function public.admin_reject_payment_claim(p_claim_id uuid, p_note text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'NO_AUTORIZADO'; end if;
  update payment_claims
     set status = 'rechazado', admin_note = nullif(btrim(coalesce(p_note, '')), ''), resolved_at = now(), resolved_by = auth.uid()
   where id = p_claim_id and status = 'pendiente';
end;
$$;

-- Vuelve a calcular hasta cuándo tiene pagado un negocio después de cambiar o borrar uno de sus
-- pagos: repasa sus pagos en orden, igual que admin_activate_plan (si aún tenía meses, los nuevos se
-- suman al final; si no, empiezan el día del pago), y le pone el plan del último pago.
-- p_old_until: hasta cuándo tenía pagado antes del cambio. Si se le inhabilitó antes de esa fecha
-- (admin_deactivate_business), no se le devuelven los días al recalcular.
create or replace function public._replay_payments(p_business uuid, p_old_until timestamptz)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  b businesses;
  r record;
  v_until timestamptz;
  v_plan text;
  v_cur timestamptz;
begin
  if p_business is null then return; end if;
  select * into b from businesses where id = p_business for update;
  if not found then return; end if;
  for r in select id, plan, months, created_at from payments where business_id = p_business order by created_at, id loop
    v_until := greatest(r.created_at, coalesce(v_until, r.created_at)) + make_interval(months => r.months);
    v_plan := r.plan;
    update payments set paid_until = v_until where id = r.id;
  end loop;
  -- Con la cortesía activa, lo que cambia es la fecha a la que vuelve si se le quita
  v_cur := case when b.comped then b.comped_prev_paid_until else b.paid_until end;
  if v_until is not null and v_cur is not null and p_old_until is not null and v_cur < p_old_until then
    v_until := least(v_until, v_cur);
  end if;
  if b.comped then
    update businesses set comped_prev_paid_until = v_until, comped_prev_plan = coalesce(v_plan, comped_prev_plan) where id = b.id;
  else
    update businesses set paid_until = v_until, plan = coalesce(v_plan, plan) where id = b.id;
  end if;
end;
$$;

-- El administrador corrige un pago ya registrado: plan, meses, importe o nota. Si cambian los meses,
-- el negocio gana o pierde esa diferencia (ver _replay_payments). Las estadísticas de cobros salen
-- de la tabla payments, así que cambian solas.
create or replace function public.admin_update_payment(p_payment uuid, p_plan text, p_months int,
                                                       p_amount numeric default null, p_note text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  p payments;
  v_old timestamptz;
begin
  if not is_platform_admin() then raise exception 'NO_AUTORIZADO'; end if;
  if p_plan not in ('basico', 'plus', 'ultra') then raise exception 'PLAN_INVALIDO'; end if;
  if p_months is null or p_months not between 1 and 24 then raise exception 'MESES_INVALIDOS'; end if;
  if p_amount is not null and (p_amount < 0 or p_amount > 99999999) then raise exception 'IMPORTE_INVALIDO'; end if;
  select * into p from payments where id = p_payment for update;
  if not found then raise exception 'PAGO_NO_EXISTE'; end if;
  select max(paid_until) into v_old from payments where business_id = p.business_id;
  update payments
     set plan = p_plan, months = p_months, amount = p_amount, note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p.id;
  perform _replay_payments(p.business_id, v_old);
end;
$$;

-- El administrador borra un pago (ej. uno registrado por error). El negocio pierde los meses que le
-- dio ese pago; si ya no le quedan, vuelve a su prueba si sigue vigente o queda inhabilitado.
create or replace function public.admin_delete_payment(p_payment uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  p payments;
  v_old timestamptz;
begin
  if not is_platform_admin() then raise exception 'NO_AUTORIZADO'; end if;
  select * into p from payments where id = p_payment for update;
  if not found then raise exception 'PAGO_NO_EXISTE'; end if;
  select max(paid_until) into v_old from payments where business_id = p.business_id;
  delete from payments where id = p.id;
  perform _replay_payments(p.business_id, v_old);
end;
$$;

-- Borra para siempre los negocios cuya prueba gratis terminó hace más de 5 días sin que pagaran
-- nunca: su app, servicios, citas, clientes, fotos... y la cuenta del dueño (su correo queda libre
-- para volver a empezar). No toca a quien pagó alguna vez, a los de cortesía ni a quien tiene un
-- comprobante de pago sin revisar. Se llama una vez al día (ver tareas programadas, sección 3).
-- Devuelve cuántos borró.
create or replace function public._purge_expired_trials()
returns int language plpgsql volatile security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select b.* from businesses b
    where not b.comped and b.paid_until is null and b.comped_prev_paid_until is null
      and b.trial_ends_at < now() - interval '5 days'
      and not exists (select 1 from payments p where p.business_id = b.id)
      and not exists (select 1 from payment_claims c where c.business_id = b.id and c.status = 'pendiente')
      and not exists (select 1 from platform_admins a where a.user_id = b.owner_id)
    for update of b skip locked
  loop
    insert into purged_trials (id, name, code, business_type, created_at, trial_ends_at)
    values (r.id, r.name, r.code, r.business_type, r.created_at, r.trial_ends_at)
    on conflict (id) do nothing;
    delete from businesses where id = r.id;
    delete from auth.users where id = r.owner_id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Borra para siempre a un dueño inhabilitado (o que nunca creó su negocio): su negocio, servicios,
-- citas, clientes, opiniones, etc. Con p_delete_account también su cuenta (su correo queda libre).
-- No se puede con un negocio en prueba o pagando: primero hay que inhabilitarlo.
create or replace function public.admin_delete_owner(p_user uuid, p_delete_account boolean default true)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  b businesses;
begin
  if not is_platform_admin() then raise exception 'NO_AUTORIZADO'; end if;
  if exists (select 1 from platform_admins where user_id = p_user) then raise exception 'NO_AUTORIZADO'; end if;
  select * into b from businesses where owner_id = p_user for update;
  if found and business_status(b.plan, b.trial_ends_at, b.paid_until) <> 'vencido' then
    raise exception 'NEGOCIO_ACTIVO';
  end if;
  if found then
    delete from businesses where id = b.id;
  end if;
  if p_delete_account then
    delete from auth.users where id = p_user;
  end if;
end;
$$;

-- Inhabilita un negocio ya (por ejemplo, si se activó por error). Si nunca pagó, su fecha de pago
-- sigue vacía: así se sabe que es una prueba sin pagar (ver _purge_expired_trials).
create or replace function public.admin_deactivate_business(p_business uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'NO_AUTORIZADO'; end if;
  update businesses
     set paid_until = case when paid_until is null then null else least(paid_until, now()) end,
         trial_ends_at = least(trial_ends_at, now())
   where id = p_business;
end;
$$;

-- Da días extra de prueba a un negocio
create or replace function public.admin_extend_trial(p_business uuid, p_days int)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'NO_AUTORIZADO'; end if;
  if p_days not between 1 and 60 then raise exception 'DIAS_INVALIDOS'; end if;
  update businesses
     set trial_ends_at = greatest(trial_ends_at, now()) + make_interval(days => p_days)
   where id = p_business;
end;
$$;

-- Cambia la zona horaria de un negocio (ej. uno de España que empezó con la de Cuba). El horario
-- se lee en la zona nueva: sus 9:00 pasan a ser las 9:00 de allí. Con p_keep_times, las citas que
-- aún no han llegado conservan la hora que ven el dueño y el cliente (las 10:00 siguen siendo las
-- 10:00, ahora de la zona nueva); sin él, conservan el momento real y se verán a otra hora.
-- Devuelve cuántas citas activas se movieron.
create or replace function public.admin_set_timezone(p_business uuid, p_timezone text, p_keep_times boolean default true)
returns int language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'NO_AUTORIZADO'; end if;
  return _move_business_timezone(p_business, p_timezone, p_keep_times);
end;
$$;

-- Cambia la zona de un negocio y, con p_keep_times, mueve sus citas futuras para que sigan a la
-- misma hora en el reloj del negocio. Sin comprobar permisos: la llaman admin_set_timezone y el
-- paso de Cuba a "Etc/GMT+4" del final de este archivo.
create or replace function public._move_business_timezone(p_business uuid, p_timezone text, p_keep_times boolean)
returns int language plpgsql volatile security definer set search_path = public as $$
declare
  b businesses;
  a record;
  v_later boolean;
  v_moved int := 0;
begin
  if p_timezone is null or not _is_valid_timezone(p_timezone) then raise exception 'ZONA_INVALIDA'; end if;
  select * into b from businesses where id = p_business for update;
  if not found then raise exception 'NEGOCIO_NO_EXISTE'; end if;
  if b.timezone = p_timezone then return 0; end if;

  if p_keep_times then
    -- Sin avisos push: para el cliente su cita no cambia de hora (ver _appointments_notify)
    perform set_config('citora.cambio_zona', 'si', true);
    -- Se mueven de una en una sin pisarse entre ellas por el camino: si pasan a más tarde,
    -- empezando por la última; si pasan a más temprano, por la primera
    v_later := (now() at time zone b.timezone) at time zone p_timezone > now();
    begin
      for a in
        select x.id, x.starts_at, x.ends_at, x.status from appointments x
        where x.business_id = b.id and x.starts_at > now()
        order by case when v_later then x.starts_at end desc, case when not v_later then x.starts_at end
      loop
        update appointments
           set starts_at = (a.starts_at at time zone b.timezone) at time zone p_timezone,
               ends_at = ((a.starts_at at time zone b.timezone) at time zone p_timezone) + (a.ends_at - a.starts_at)
         where id = a.id;
        if a.status <> 'cancelada' then v_moved := v_moved + 1; end if;
      end loop;
    exception when exclusion_violation then
      raise exception 'CITAS_SE_SOLAPAN';
    end;
    perform set_config('citora.cambio_zona', '', true);
  end if;

  update businesses set timezone = p_timezone where id = b.id;
  return v_moved;
end;
$$;

-- Estadísticas de la plataforma
create or replace function public.admin_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text := 'Etc/GMT+4';
  v_first timestamp := date_trunc('month', now() at time zone v_tz) - interval '11 months';
begin
  if not is_platform_admin() then raise exception 'NO_AUTORIZADO'; end if;
  return jsonb_build_object(
    'months', (
      select jsonb_agg(jsonb_build_object(
        'month', to_char(m, 'YYYY-MM'),
        -- También cuentan las pruebas que se borraron solas (purged_trials): se apuntaron igual
        'signups', (select count(*) from businesses b
                    where b.created_at >= m at time zone v_tz and b.created_at < (m + interval '1 month') at time zone v_tz)
                 + (select count(*) from purged_trials t
                    where t.created_at >= m at time zone v_tz and t.created_at < (m + interval '1 month') at time zone v_tz),
        'revenue', (select coalesce(sum(p.amount), 0) from payments p left join businesses b2 on b2.id = p.business_id
                    where p.created_at >= m at time zone v_tz and p.created_at < (m + interval '1 month') at time zone v_tz
                      and not coalesce(b2.comped, false) and p.currency = 'CUP'),
        'revenue_usd', (select coalesce(sum(p.amount), 0) from payments p left join businesses b2 on b2.id = p.business_id
                    where p.created_at >= m at time zone v_tz and p.created_at < (m + interval '1 month') at time zone v_tz
                      and not coalesce(b2.comped, false) and p.currency = 'USD'),
        'payments', (select count(*) from payments p left join businesses b2 on b2.id = p.business_id
                     where p.created_at >= m at time zone v_tz and p.created_at < (m + interval '1 month') at time zone v_tz
                       and not coalesce(b2.comped, false)),
        'appointments', (select count(*) from appointments a
                         where a.created_at >= m at time zone v_tz and a.created_at < (m + interval '1 month') at time zone v_tz)
      ) order by m)
      from generate_series(v_first, date_trunc('month', now() at time zone v_tz), interval '1 month') m),
    'totals', (select jsonb_build_object(
        'businesses', (select count(*) from businesses where not comped),
        'revenue', (select coalesce(sum(p.amount), 0) from payments p left join businesses b2 on b2.id = p.business_id
                    where not coalesce(b2.comped, false) and p.currency = 'CUP'),
        'revenue_usd', (select coalesce(sum(p.amount), 0) from payments p left join businesses b2 on b2.id = p.business_id
                    where not coalesce(b2.comped, false) and p.currency = 'USD'),
        'businesses_int', (select count(*) from businesses where not comped and market = 'int'),
        'appointments', (select count(*) from appointments),
        'appointments_30d', (select count(*) from appointments where created_at > now() - interval '30 days'),
        'active_30d', (select count(distinct business_id) from appointments where created_at > now() - interval '30 days'),
        'ended_trials', (select count(*) from businesses where trial_ends_at < now()) + (select count(*) from purged_trials),
        'purged', (select count(*) from purged_trials),
        'purged_30d', (select count(*) from purged_trials where purged_at > now() - interval '30 days'),
        'converted', (select count(*) from businesses b
                      where b.trial_ends_at < now() and not b.comped
                        and exists (select 1 from payments p where p.business_id = b.id)))),
    'by_plan', (select jsonb_build_object(
        'basico', count(*) filter (where business_status(plan, trial_ends_at, paid_until) = 'activo' and plan = 'basico' and not comped),
        'plus', count(*) filter (where business_status(plan, trial_ends_at, paid_until) = 'activo' and plan = 'plus' and not comped),
        'ultra', count(*) filter (where business_status(plan, trial_ends_at, paid_until) = 'activo' and plan = 'ultra' and not comped),
        'prueba', count(*) filter (where business_status(plan, trial_ends_at, paid_until) = 'prueba'),
        'vencido', count(*) filter (where business_status(plan, trial_ends_at, paid_until) = 'vencido'),
        'cortesia', count(*) filter (where comped))
      from businesses),
    'by_type', (select coalesce(jsonb_agg(jsonb_build_object('type', t.business_type, 'count', t.n) order by t.n desc), '[]'::jsonb)
      from (select business_type, count(*) as n from businesses group by 1) t),
    'top_businesses', (select coalesce(jsonb_agg(jsonb_build_object(
        'name', t.name, 'slug', t.slug, 'code', t.code, 'count', t.n) order by t.n desc), '[]'::jsonb)
      from (select b.name, b.slug, b.code, count(*) as n
            from appointments a join businesses b on b.id = a.business_id
            where a.created_at > now() - interval '30 days'
            group by b.id order by count(*) desc limit 10) t),
    -- A quién escribir: planes que vencen en 7 días y pruebas que terminan en 3
    'expiring', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', b.id, 'name', b.name, 'code', b.code, 'whatsapp', b.whatsapp, 'timezone', b.timezone,
        'kind', business_status(b.plan, b.trial_ends_at, b.paid_until),
        'ends_at', case when business_status(b.plan, b.trial_ends_at, b.paid_until) = 'activo'
                        then b.paid_until else b.trial_ends_at end)
        order by case when business_status(b.plan, b.trial_ends_at, b.paid_until) = 'activo'
                      then b.paid_until else b.trial_ends_at end), '[]'::jsonb)
      from businesses b
      where (business_status(b.plan, b.trial_ends_at, b.paid_until) = 'activo' and b.paid_until < now() + interval '7 days')
         or (business_status(b.plan, b.trial_ends_at, b.paid_until) = 'prueba' and b.trial_ends_at < now() + interval '3 days')),
    'recent_payments', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.name, 'code', t.code, 'plan', t.plan, 'months', t.months, 'amount', t.amount,
        'currency', t.currency,
        'note', t.note, 'paid_until', t.paid_until, 'deleted', t.deleted, 'created_at', t.created_at) order by t.created_at desc), '[]'::jsonb)
      from (select p.id, coalesce(b.name, p.business_name || ' (eliminado)') as name, coalesce(b.code, p.business_code) as code,
                   p.plan, p.months, p.amount, p.currency, p.note, p.paid_until, b.id is null as deleted, p.created_at
            from payments p left join businesses b on b.id = p.business_id
            where not coalesce(b.comped, false)
            order by p.created_at desc limit 300) t)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 7b. MEDICIÓN DE VISITAS (ver analytics_events)
-- ---------------------------------------------------------------------

-- Anota una visita o un paso. Lo llama cualquier visitante (sin sesión), así que nunca falla ni
-- devuelve nada, y lleva un freno: como mucho 60 anotaciones por visitante y hora.
create or replace function public.track_event(
  p_visitor uuid, p_session uuid, p_name text, p_page text default null, p_slug text default null,
  p_step int default null, p_source text default null, p_device text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if p_visitor is null or p_session is null
     or p_name not in ('visita', 'crear_paso', 'negocio_creado', 'reserva_hecha', 'paso_saltado') then
    return;
  end if;
  if (select count(*) from analytics_events
      where visitor_id = p_visitor and created_at > now() - interval '1 hour') >= 60 then
    return;
  end if;
  insert into analytics_events (visitor_id, session_id, name, page, slug, step, source, device)
  values (p_visitor, p_session, p_name, left(p_page, 30), left(lower(p_slug), 60),
          case when p_step between 0 and 20 then p_step end, left(lower(p_source), 30),
          case when p_device in ('movil', 'ordenador') then p_device end);
exception when others then
  null;
end;
$$;

-- Borra las visitas de hace más de 13 meses (las estadísticas miran como mucho un año atrás).
-- Se llama una vez al día (ver tarea programada en la sección 3).
create or replace function public._purge_analytics()
returns void language sql security definer set search_path = public as $$
  delete from analytics_events where created_at < now() - interval '13 months';
$$;

-- Estadísticas de visitas de los últimos p_days días (en hora de Cuba), para el administrador
create or replace function public.admin_traffic(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text := 'Etc/GMT+4';
  v_days int := least(greatest(coalesce(p_days, 30), 1), 365);
  v_first date := (now() at time zone v_tz)::date - (v_days - 1);
  v_from timestamptz := v_first::timestamp at time zone v_tz;
begin
  if not is_platform_admin() then raise exception 'NO_AUTORIZADO'; end if;
  return jsonb_build_object(
    'days', v_days,
    'since', (select min(created_at) from analytics_events),
    -- Portada de Citora
    'visitors', (select count(distinct visitor_id) from analytics_events
                 where name = 'visita' and page = 'portada' and created_at >= v_from),
    'sessions', (select count(distinct session_id) from analytics_events
                 where name = 'visita' and page = 'portada' and created_at >= v_from),
    'signups', (select count(*) from businesses where created_at >= v_from and not comped),
    -- Embudo: personas distintas que llegaron a cada punto
    'funnel', jsonb_build_object(
      'portada', (select count(distinct visitor_id) from analytics_events
                  where name = 'visita' and page = 'portada' and created_at >= v_from),
      'crear', (select count(distinct visitor_id) from analytics_events
                where name = 'visita' and page = 'crear' and created_at >= v_from),
      'pasos', (select jsonb_agg((select count(distinct visitor_id) from analytics_events
                                  where name = 'crear_paso' and step = st and created_at >= v_from) order by st)
                from generate_series(0, 5) st),
      'creados', (select count(distinct visitor_id) from analytics_events
                  where name = 'negocio_creado' and created_at >= v_from)),
    'by_day', (select jsonb_agg(jsonb_build_object(
        'day', d,
        'visitors', (select count(distinct visitor_id) from analytics_events
                     where name = 'visita' and page = 'portada'
                       and created_at >= d::timestamp at time zone v_tz and created_at < (d + 1)::timestamp at time zone v_tz),
        'signups', (select count(*) from businesses
                    where not comped and created_at >= d::timestamp at time zone v_tz and created_at < (d + 1)::timestamp at time zone v_tz))
        order by d)
      from generate_series(v_first, (now() at time zone v_tz)::date, interval '1 day') g(d0), lateral (select g.d0::date as d) x),
    -- Por hora del día (hora de Cuba): útil para "Hoy" y "Hoy y ayer"
    'by_hour', (select jsonb_agg((select count(distinct visitor_id) from analytics_events
                                  where name = 'visita' and page = 'portada' and created_at >= v_from
                                    and extract(hour from created_at at time zone v_tz) = h) order by h)
                from generate_series(0, 23) h),
    'sources', (select coalesce(jsonb_agg(jsonb_build_object('source', q.source, 'visitors', q.n) order by q.n desc), '[]'::jsonb)
      from (select coalesce(source, 'directo') as source, count(distinct visitor_id) as n from analytics_events
            where name = 'visita' and page = 'portada' and created_at >= v_from group by 1) q),
    'devices', (select coalesce(jsonb_object_agg(q.device, q.n), '{}'::jsonb)
      from (select coalesce(device, 'ordenador') as device, count(distinct visitor_id) as n from analytics_events
            where name = 'visita' and page = 'portada' and created_at >= v_from group by 1) q),
    -- Webs de los negocios: visitantes y reservas hechas desde ellas
    'business_totals', jsonb_build_object(
      'visitors', (select count(distinct visitor_id) from analytics_events
                   where name = 'visita' and page = 'negocio' and created_at >= v_from),
      'bookings', (select count(*) from analytics_events where name = 'reserva_hecha' and created_at >= v_from)),
    'business_pages', (select coalesce(jsonb_agg(jsonb_build_object('slug', q.slug, 'name', q.name, 'visitors', q.visitors, 'bookings', q.bookings)
                                                 order by q.visitors desc), '[]'::jsonb)
      from (select e.slug, max(b.name) as name,
                   count(distinct e.visitor_id) filter (where e.name = 'visita' and e.page = 'negocio') as visitors,
                   count(*) filter (where e.name = 'reserva_hecha') as bookings
            from analytics_events e left join businesses b on b.slug = e.slug
            where e.slug is not null and e.created_at >= v_from
            group by e.slug
            order by 3 desc
            limit 15) q)
  );
end;
$$;

-- Actividad de cada negocio para el administrador: cuántas reservas recibe (por fecha en que se
-- hicieron, sin contar las canceladas), cuántos clientes distintos y cuándo fue la última. Sirve para
-- ver cuáles están funcionando y cuáles no, y a cuáles premiar (ej. un descuento en la mensualidad).
-- También dice qué ha hecho el dueño desde que creó su app (los "primeros pasos" del panel de
-- administrador, ver src/pages/admin/adminData.ts) para saber quién está atascado y ayudarle:
-- si personalizó su app, si activó los avisos, si apunta citas, si alguien abrió su enlace, si ya le
-- reservan por la web y si ha pagado alguna vez.
create or replace function public.admin_business_activity()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'NO_AUTORIZADO'; end if;
  return coalesce((
    select jsonb_agg(q.j order by (q.j->>'bookings_30d')::int desc, (q.j->>'bookings_total')::int desc, q.j->>'name')
    from (
      select jsonb_build_object(
        'id', b.id, 'name', b.name, 'slug', b.slug, 'code', b.code, 'business_type', b.business_type,
        'whatsapp', b.whatsapp, 'currency', b.currency, 'comped', b.comped, 'created_at', b.created_at,
        'status', business_status(b.plan, b.trial_ends_at, b.paid_until),
        'bookings_total', count(a.id) filter (where a.status <> 'cancelada'),
        'bookings_30d', count(a.id) filter (where a.status <> 'cancelada' and a.created_at > now() - interval '30 days'),
        'bookings_7d', count(a.id) filter (where a.status <> 'cancelada' and a.created_at > now() - interval '7 days'),
        'web_30d', count(a.id) filter (where a.status <> 'cancelada' and a.source = 'web' and a.created_at > now() - interval '30 days'),
        'web_7d', count(a.id) filter (where a.status <> 'cancelada' and a.source = 'web' and a.created_at > now() - interval '7 days'),
        'web_total', count(a.id) filter (where a.status <> 'cancelada' and a.source = 'web'),
        'manual_total', count(a.id) filter (where a.status <> 'cancelada' and a.source = 'manual'),
        'customers', count(distinct a.customer_phone) filter (where a.status <> 'cancelada'),
        'revenue_30d', coalesce(sum(a.total) filter (where _appt_done(a.status, a.ends_at) and a.starts_at > now() - interval '30 days'), 0),
        'last_booking_at', max(a.created_at) filter (where a.status <> 'cancelada'),
        'services', (select count(*) from services s where s.business_id = b.id and s.active),
        'customized', (b.logo_url is not null or b.cover_url is not null or b.appearance <> '{}'::jsonb),
        'push_on', exists (select 1 from push_subscriptions ps where ps.business_id = b.id and ps.kind = 'owner'),
        -- Personas distintas que abrieron su página (las visitas del propio dueño no se miden)
        'link_visits', (select count(distinct e.visitor_id) from analytics_events e
                        where e.name = 'visita' and e.page = 'negocio' and e.slug = b.slug),
        'paid', exists (select 1 from payments p where p.business_id = b.id)
      ) as j
      from businesses b
      left join appointments a on a.business_id = b.id
      group by b.id
    ) q), '[]'::jsonb);
end;
$$;

-- Deja las preguntas de una encuesta limpias y numeradas (p1, p2...). De 1 a 10 preguntas.
create or replace function public._clean_survey_questions(p jsonb)
returns jsonb language plpgsql immutable as $$
declare
  r jsonb := '[]'::jsonb;
  q jsonb;
  i int := 0;
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) not between 1 and 10 then
    raise exception 'ENCUESTA_INVALIDA';
  end if;
  for q in select * from jsonb_array_elements(p) loop
    i := i + 1;
    if coalesce(q ->> 'type', '') not in ('estrellas', 'si_no', 'texto')
       or char_length(btrim(coalesce(q ->> 'text', ''))) not between 3 and 200 then
      raise exception 'ENCUESTA_INVALIDA';
    end if;
    r := r || jsonb_build_array(jsonb_build_object('id', 'p' || i, 'type', q ->> 'type', 'text', btrim(q ->> 'text')));
  end loop;
  return r;
end;
$$;

-- El administrador publica una encuesta para todos los dueños o, con p_business_ids, solo para esos
-- negocios. Las preguntas no se pueden cambiar después (las respuestas quedarían descolocadas): se
-- cierra o se borra y se hace otra. Con p_notify, avisa con una notificación push a los dueños
-- activos a los que va y que tienen los avisos puestos.
drop function if exists public.admin_create_survey(text, text, jsonb, boolean);
create or replace function public.admin_create_survey(p_title text, p_intro text, p_questions jsonb,
                                                      p_notify boolean default true, p_business_ids uuid[] default null)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_ids uuid[];
  v_id uuid;
  b record;
begin
  if not is_platform_admin() then raise exception 'NO_AUTORIZADO'; end if;
  if char_length(v_title) not between 3 and 80 then raise exception 'ENCUESTA_INVALIDA'; end if;
  if p_business_ids is not null then
    v_ids := array(select id from businesses where id = any (p_business_ids));
    if cardinality(v_ids) = 0 then raise exception 'ENCUESTA_SIN_DESTINO'; end if;
  end if;
  insert into owner_surveys (title, intro, questions, business_ids)
  values (v_title, nullif(left(btrim(coalesce(p_intro, '')), 300), ''), _clean_survey_questions(p_questions), v_ids)
  returning id into v_id;
  if coalesce(p_notify, false) then
    for b in
      select distinct ps.business_id from push_subscriptions ps join businesses x on x.id = ps.business_id
      where ps.kind = 'owner' and business_effective_plan(x.plan, x.trial_ends_at, x.paid_until) is not null
        and (v_ids is null or x.id = any (v_ids))
    loop
      perform _notify_push(b.business_id, 'owner', null, 'Citora quiere saber tu opinión',
        v_title || ' · Son menos de 2 minutos: ábrela en tu panel.');
    end loop;
  end if;
  return v_id;
end;
$$;

-- Encuestas con sus respuestas (y el negocio de cada una) y los negocios activos que faltan por responder
create or replace function public.admin_list_surveys()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'NO_AUTORIZADO'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'title', s.title, 'intro', s.intro, 'questions', s.questions, 'active', s.active,
      'created_at', s.created_at, 'business_ids', s.business_ids,
      'answers', (select coalesce(jsonb_agg(jsonb_build_object(
          'business_id', b.id, 'name', b.name, 'code', b.code, 'slug', b.slug, 'whatsapp', b.whatsapp,
          'answers', a.answers, 'created_at', a.created_at) order by a.created_at desc), '[]'::jsonb)
        from owner_survey_answers a join businesses b on b.id = a.business_id
        where a.survey_id = s.id),
      'pending', (select coalesce(jsonb_agg(jsonb_build_object(
          'business_id', b.id, 'name', b.name, 'code', b.code, 'slug', b.slug, 'whatsapp', b.whatsapp) order by b.name), '[]'::jsonb)
        from businesses b
        where business_effective_plan(b.plan, b.trial_ends_at, b.paid_until) is not null
          and (s.business_ids is null or b.id = any (s.business_ids))
          and not exists (select 1 from owner_survey_answers a where a.survey_id = s.id and a.business_id = b.id))
    ) order by s.created_at desc)
    from owner_surveys s), '[]'::jsonb);
end;
$$;

-- Cierra (deja de mostrarse a los dueños) o vuelve a abrir una encuesta
create or replace function public.admin_set_survey_active(p_survey uuid, p_active boolean)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'NO_AUTORIZADO'; end if;
  update owner_surveys set active = coalesce(p_active, false) where id = p_survey;
  if not found then raise exception 'NO_DISPONIBLE'; end if;
end;
$$;

-- Borra una encuesta con todas sus respuestas
create or replace function public.admin_delete_survey(p_survey uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'NO_AUTORIZADO'; end if;
  delete from owner_surveys where id = p_survey;
  if not found then raise exception 'NO_DISPONIBLE'; end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 8. PERMISOS DE EJECUCIÓN
-- ---------------------------------------------------------------------

revoke execute on all functions in schema public from public;

grant execute on function public.get_public_prices() to anon, authenticated;
grant execute on function public.get_public_business(text) to anon, authenticated;
grant execute on function public.get_available_slots(text, date, int, uuid, text, uuid[]) to anon, authenticated;
grant execute on function public.create_booking(text, uuid[], date, text, text, text, text, text, uuid, jsonb) to anon, authenticated;
grant execute on function public.check_discount(text, text, uuid[], jsonb) to anon, authenticated;
grant execute on function public.join_waitlist(text, date, text, text, text) to anon, authenticated;
grant execute on function public.save_customer_push_subscription(text, text, text, text) to anon, authenticated;
grant execute on function public.delete_push_subscription(text) to anon, authenticated;
grant execute on function public.get_booking(text) to anon, authenticated;
grant execute on function public.cancel_booking(text) to anon, authenticated;
grant execute on function public.reschedule_booking(text, date, text) to anon, authenticated;
grant execute on function public.edit_booking(text, uuid[], date, text, text, text, uuid, jsonb) to anon, authenticated;
grant execute on function public.check_slug_available(text) to anon, authenticated;

grant execute on function public.create_business(text, text, text, text, text, text, jsonb, jsonb, text, boolean, numeric, text, text) to authenticated;
grant execute on function public.admin_set_market(uuid, text) to authenticated;
grant execute on function public.admin_set_temp_password(uuid) to authenticated;
grant execute on function public.get_my_business_status() to authenticated;
grant execute on function public.get_my_progress() to authenticated;
grant execute on function public.owner_staff_link(uuid, text) to authenticated;
grant execute on function public.owner_set_team_services(jsonb) to authenticated;
grant execute on function public.staff_portal(text) to anon, authenticated;
grant execute on function public.staff_portal_save_service(text, uuid, text, numeric, int, text, boolean, boolean) to anon, authenticated;
grant execute on function public.staff_portal_save_schedule(text, jsonb) to anon, authenticated;
grant execute on function public.staff_portal_save_profile(text, text) to anon, authenticated;
grant execute on function public.staff_portal_agenda(text, date, date) to anon, authenticated;
grant execute on function public.staff_portal_set_status(text, uuid, text) to anon, authenticated;
grant execute on function public.staff_portal_create_appointment(text, uuid[], date, text, text, text, text) to anon, authenticated;
grant execute on function public.staff_portal_stats(text, int) to anon, authenticated;
grant execute on function public.get_payment_info() to authenticated;
grant execute on function public.submit_payment_claim(int, numeric, text, text, text) to authenticated;
grant execute on function public.save_owner_push_subscription(text, text, text) to authenticated;
grant execute on function public.owner_create_appointment(uuid[], date, text, text, text, text, uuid, jsonb) to authenticated;
grant execute on function public.owner_reschedule_appointment(uuid, date, text) to authenticated;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.admin_list_businesses() to authenticated;
grant execute on function public.admin_list_owners() to authenticated;
grant execute on function public.save_admin_push_subscription(text, text, text) to authenticated;
grant execute on function public.admin_activate_plan(uuid, text, int, numeric, text) to authenticated;
grant execute on function public.admin_grant_free(uuid) to authenticated;
grant execute on function public.admin_revoke_free(uuid) to authenticated;
grant execute on function public.admin_approve_payment_claim(uuid, numeric, text) to authenticated;
grant execute on function public.admin_reject_payment_claim(uuid, text) to authenticated;
grant execute on function public.admin_deactivate_business(uuid) to authenticated;
grant execute on function public.admin_delete_owner(uuid, boolean) to authenticated;
grant execute on function public.admin_extend_trial(uuid, int) to authenticated;
grant execute on function public.admin_set_timezone(uuid, text, boolean) to authenticated;
grant execute on function public.get_my_survey() to authenticated;
grant execute on function public.submit_survey_answer(uuid, jsonb) to authenticated;
grant execute on function public.admin_create_survey(text, text, jsonb, boolean, uuid[]) to authenticated;
grant execute on function public.admin_list_surveys() to authenticated;
grant execute on function public.admin_set_survey_active(uuid, boolean) to authenticated;
grant execute on function public.admin_delete_survey(uuid) to authenticated;
grant execute on function public.admin_stats() to authenticated;
grant execute on function public.admin_update_payment(uuid, text, int, numeric, text) to authenticated;
grant execute on function public.admin_delete_payment(uuid) to authenticated;
grant execute on function public.admin_traffic(int) to authenticated;
grant execute on function public.admin_business_activity() to authenticated;
grant execute on function public.track_event(uuid, uuid, text, text, text, int, text, text) to anon, authenticated;
grant execute on function public.submit_review(text, int, text) to anon, authenticated;
grant execute on function public.owner_customers() to authenticated;
grant execute on function public.owner_stats(date, date) to authenticated;
grant execute on function public.my_plan_has(text) to authenticated;
grant execute on function public.plan_has(text, text) to anon, authenticated;
grant execute on function public._appt_done(text, timestamptz) to anon, authenticated;
grant execute on function public.reviews_guard() to authenticated;
grant execute on function public.gallery_photos_guard() to authenticated;
grant execute on function public.discounts_guard() to authenticated;

-- Funciones usadas dentro de las reglas RLS y disparadores
grant execute on function public.my_business_id() to authenticated;
grant execute on function public.my_business_active() to authenticated;
grant execute on function public.business_effective_plan(text, timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.business_status(text, timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.is_valid_slug(text) to anon, authenticated;
grant execute on function public.is_reserved_slug(text) to anon, authenticated;
grant execute on function public._is_valid_timezone(text) to authenticated;
grant execute on function public._clean_phone(text) to anon, authenticated;
grant execute on function public._is_cuban_phone(text) to anon, authenticated;
grant execute on function public._clean_appearance(jsonb) to authenticated;
grant execute on function public.businesses_guard() to authenticated;
grant execute on function public.appointments_guard() to authenticated;
grant execute on function public._appointments_notify() to authenticated;
grant execute on function public._gallery_photos_notify() to authenticated;
grant execute on function public.schedule_days_normalize() to authenticated;
grant execute on function public.staff_schedule_days_normalize() to authenticated;
grant execute on function public.staff_services_guard() to authenticated;
grant execute on function public.services_guard() to authenticated;

-- Funciones internas: nadie las llama desde fuera
revoke execute on function public._is_range_free(uuid, timestamptz, timestamptz, uuid) from anon, authenticated;
revoke execute on function public._check_slot(uuid, date, text, int, uuid, uuid, uuid[]) from anon, authenticated;
revoke execute on function public._lane_free(uuid, uuid, timestamptz, timestamptz, uuid) from anon, authenticated;
revoke execute on function public._staff_slot_valid(uuid, uuid, date, time) from anon, authenticated;
revoke execute on function public._staff_can_do(uuid, uuid[]) from anon, authenticated;
revoke execute on function public._slot_blocked(uuid, date, time, int) from anon, authenticated;
revoke execute on function public._free_lane(uuid, uuid, timestamptz, timestamptz, uuid) from anon, authenticated;
revoke execute on function public._free_staff(uuid, timestamptz, timestamptz, uuid, uuid, uuid[]) from anon, authenticated;
revoke execute on function public._owner_business(text) from anon, authenticated;
revoke execute on function public._discount_for(uuid, text, numeric, boolean) from anon, authenticated;
revoke execute on function public._notify_push(uuid, text, uuid, text, text) from anon, authenticated;
revoke execute on function public._send_daily_reminders() from anon, authenticated;
revoke execute on function public._auto_mark_no_shows() from anon, authenticated;
revoke execute on function public._send_expiry_reminders() from anon, authenticated;
revoke execute on function public._expiry_push_text(text, timestamptz, text, text, timestamptz) from anon, authenticated;
revoke execute on function public._expiry_push_text_en(text, timestamptz, text, text, timestamptz) from anon, authenticated;
revoke execute on function public._move_business_timezone(uuid, text, boolean) from anon, authenticated;
revoke execute on function public._notify_moderation(uuid, text) from anon, authenticated;
revoke execute on function public._notify_admin_push(text, text) from anon, authenticated;
revoke execute on function public._approve_unmoderated_photos() from anon, authenticated;
revoke execute on function public._purge_analytics() from anon, authenticated;
revoke execute on function public._purge_expired_trials() from anon, authenticated;
revoke execute on function public._replay_payments(uuid, timestamptz) from anon, authenticated;
revoke execute on function public._activate_plan(uuid, text, int, numeric, text, uuid) from anon, authenticated;
revoke execute on function public.online_order_price(uuid, text, int) from anon, authenticated;
revoke execute on function public.online_payment_complete(text, numeric, text, text) from anon, authenticated;
revoke execute on function public.admin_update_payment(uuid, text, int, numeric, text) from anon;
revoke execute on function public.admin_delete_payment(uuid) from anon;
revoke execute on function public._clean_survey_questions(jsonb) from anon, authenticated;
revoke execute on function public._appointments_notify() from anon;
revoke execute on function public.staff_services_guard() from anon;
revoke execute on function public.services_guard() from anon;
revoke execute on function public._chosen_services(uuid, uuid[], jsonb, boolean) from anon, authenticated;
revoke execute on function public._staff_by_token(text) from anon, authenticated;
revoke execute on function public._manual_appointment(businesses, uuid[], date, text, text, text, text, uuid, jsonb) from anon, authenticated;
revoke execute on function public._required_services(uuid[]) from anon, authenticated;
revoke execute on function public._owner_does(uuid[]) from anon, authenticated;
revoke execute on function public._staff_hide_services() from anon;
-- Supabase da permiso a los visitantes en las funciones nuevas: esta es solo para el dueño
revoke execute on function public.owner_staff_link(uuid, text) from anon;
revoke execute on function public.owner_set_team_services(jsonb) from anon;
revoke execute on function public.staff_schedule_days_normalize() from anon;

-- Las tablas: sin acceso directo para visitantes anónimos
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- ---------------------------------------------------------------------
-- 9. FOTOS (logos) · solo existe en Supabase
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public) values ('logos', 'logos', true)
      on conflict (id) do update set public = true;

    execute 'drop policy if exists "logos_owner_select" on storage.objects';
    execute 'drop policy if exists "logos_owner_insert" on storage.objects';
    execute 'drop policy if exists "logos_owner_update" on storage.objects';
    execute 'drop policy if exists "logos_owner_delete" on storage.objects';
    -- Cada negocio puede leer sus propias fotos (Supabase lo pide para reemplazar o borrar archivos)
    execute $p$create policy "logos_owner_select" on storage.objects for select to authenticated
      using (bucket_id = 'logos' and (storage.foldername(name))[1] = public.my_business_id()::text)$p$;
    execute $p$create policy "logos_owner_insert" on storage.objects for insert to authenticated
      with check (bucket_id = 'logos' and (storage.foldername(name))[1] = public.my_business_id()::text)$p$;
    execute $p$create policy "logos_owner_update" on storage.objects for update to authenticated
      using (bucket_id = 'logos' and (storage.foldername(name))[1] = public.my_business_id()::text)$p$;
    execute $p$create policy "logos_owner_delete" on storage.objects for delete to authenticated
      using (bucket_id = 'logos' and (storage.foldername(name))[1] = public.my_business_id()::text)$p$;
  end if;
end;
$$;

-- Comprobantes de pago: a diferencia de "logos", este almacén es privado. Solo el negocio que
-- subió su captura y el administrador (que es quien las revisa) pueden verla; para mostrarla se
-- genera una URL firmada de corta duración, nunca un enlace público fijo.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public) values ('payment-proofs', 'payment-proofs', false)
      on conflict (id) do update set public = false;

    execute 'drop policy if exists "payment_proofs_select" on storage.objects';
    execute 'drop policy if exists "payment_proofs_insert" on storage.objects';
    execute $p$create policy "payment_proofs_select" on storage.objects for select to authenticated
      using (bucket_id = 'payment-proofs'
             and ((storage.foldername(name))[1] = public.my_business_id()::text or public.is_platform_admin()))$p$;
    execute $p$create policy "payment_proofs_insert" on storage.objects for insert to authenticated
      with check (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = public.my_business_id()::text)$p$;
  end if;
end;
$$;
alter table public.businesses alter column timezone set default 'Etc/GMT+4';

-- Cuba a UTC−4 todo el año (ver default_timezone arriba). Las citas futuras se quedan a la misma
-- hora que eligió el cliente. Si a un negocio no se le pueden mover (dos citas se pisarían), se deja
-- como estaba para no frenar el despliegue: el administrador lo cambia a mano desde su panel.
do $$
declare
  r record;
begin
  for r in select id, name from public.businesses where timezone = 'America/Havana' loop
    begin
      perform public._move_business_timezone(r.id, 'Etc/GMT+4', true);
    exception when others then
      raise notice 'No se pudo pasar % a Etc/GMT+4: %', r.name, sqlerrm;
    end;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 10. Avisa a la API de Supabase de que hay funciones o tablas nuevas
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';
