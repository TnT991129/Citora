-- =====================================================================
-- CITORA · Base de datos
-- Ejecutar completo en Supabase > SQL Editor > New query > Run.
-- Se puede volver a ejecutar sin romper nada (usa "if not exists" y
-- "create or replace" siempre que se puede).
-- =====================================================================

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;

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
  price_basico int not null default 1500,  -- precio mensual (hay un solo plan)
  price_plus int not null default 1500,    -- sin uso: se mantiene igual al precio mensual
  price_ultra int not null default 1500,   -- sin uso: se mantiene igual al precio mensual
  trial_days int not null default 3 check (trial_days between 0 and 60),
  updated_at timestamptz not null default now()
);
insert into public.platform_settings (id) values (1) on conflict (id) do nothing;

-- Un solo plan de 1.500 CUP/mes. Al pasar de tres planes a uno se unifica el precio una vez
-- (después el panel de administrador guarda siempre los tres iguales).
update public.platform_settings
   set price_basico = 1500, price_plus = 1500, price_ultra = 1500
 where id = 1 and (price_plus <> price_basico or price_ultra <> price_basico);

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
  color_primary text not null default '#7c3aed' check (color_primary ~ '^#[0-9a-fA-F]{6}$'),
  timezone text not null default 'America/Havana',
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

-- Con quién es cada cita (null = negocio sin profesionales)
alter table public.appointments add column if not exists staff_id uuid references public.staff(id) on delete set null;
create index if not exists appointments_staff_idx on public.appointments (staff_id, starts_at);

-- Dos citas activas no se solapan con el mismo profesional (las citas sin profesional comparten una agenda)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'appointments_no_overlap_staff') then
    alter table public.appointments drop constraint if exists appointments_no_overlap;
    alter table public.appointments add constraint appointments_no_overlap_staff exclude using gist (
      business_id with =,
      (coalesce(staff_id, '00000000-0000-0000-0000-000000000000'::uuid)) with =,
      tstzrange(starts_at, ends_at) with &&
    ) where (status <> 'cancelada');
  end if;
end;
$$;

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
  select p_plan is not null;
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
  if v ~ '^https://[^\s"<>]{4,300}$' then r := r || jsonb_build_object('maps_url', v); end if;

  return r;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. DISPARADORES (triggers)
-- ---------------------------------------------------------------------

-- Protege los campos que solo puede tocar el administrador
create or replace function public.businesses_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  new.slug := lower(new.slug);
  if not is_valid_slug(new.slug) then
    raise exception 'ENLACE_INVALIDO';
  end if;
  new.appearance := _clean_appearance(new.appearance);
  if new.cover_url is not null and new.cover_url !~ '^https://' then
    new.cover_url := null;
  end if;
  if tg_op = 'UPDATE' and not is_platform_admin() and current_user in ('authenticated', 'anon') then
    new.owner_id := old.owner_id;
    new.code := old.code;
    new.plan := old.plan;
    new.paid_until := old.paid_until;
    new.trial_ends_at := old.trial_ends_at;
    new.created_at := old.created_at;
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

-- Evita que alguien cambie el token o el negocio de una cita
create or replace function public.appointments_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    new.token := old.token;
    new.business_id := old.business_id;
    new.created_at := old.created_at;
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

-- ---------------------------------------------------------------------
-- 5. FUNCIONES PÚBLICAS (para la web de reservas, sin sesión)
-- ---------------------------------------------------------------------

create or replace function public.get_public_prices()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'basico', price_basico, 'plus', price_plus, 'ultra', price_ultra, 'trial_days', trial_days)
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
      'name', b.name, 'slug', b.slug, 'logo_url', b.logo_url,
      'color_primary', b.color_primary, 'appearance', b.appearance, 'accepting', false);
  end if;
  return jsonb_build_object(
    'id', b.id,
    'name', b.name,
    'slug', b.slug,
    'business_type', b.business_type,
    'whatsapp', b.whatsapp,
    'address', b.address,
    'description', b.description,
    'logo_url', b.logo_url,
    'color_primary', b.color_primary,
    'cover_url', b.cover_url,
    'appearance', b.appearance,
    'timezone', b.timezone,
    'currency', b.currency,
    'policies', b.policies,
    'min_notice_hours', b.min_notice_hours,
    'max_days_ahead', b.max_days_ahead,
    'cancel_notice_hours', b.cancel_notice_hours,
    'plan', v_plan,
    'accepting', true,
    'today', (now() at time zone b.timezone)::date,
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'description', s.description,
        'price', s.price, 'duration_min', s.duration_min) order by s.position, s.created_at)
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
      select jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name) order by st.position, st.created_at)
      from staff st where st.business_id = b.id and st.active), '[]'::jsonb)
      else '[]'::jsonb end,
    'gallery', case when plan_has(v_plan, 'galeria') then coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'url', g.url, 'caption', g.caption)
                       order by g.position, g.created_at)
      from gallery_photos g where g.business_id = b.id), '[]'::jsonb)
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

-- ¿Está libre la agenda de un profesional (null = la agenda común) en un intervalo?
create or replace function public._lane_free(p_business uuid, p_staff uuid, p_start timestamptz, p_end timestamptz, p_exclude uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from appointments a
    where a.business_id = p_business
      and a.status <> 'cancelada'
      and a.staff_id is not distinct from p_staff
      and tstzrange(a.starts_at, a.ends_at) && tstzrange(p_start, p_end)
      and (p_exclude is null or a.id <> p_exclude)
  );
$$;

-- Busca quién puede atender un hueco. Sin profesionales: la agenda común.
-- Con p_staff: solo ese profesional. Sin p_staff: el que esté libre y tenga menos citas ese día.
create or replace function public._free_staff(p_business uuid, p_start timestamptz, p_end timestamptz,
                                              p_staff uuid default null, p_exclude uuid default null)
returns table (ok boolean, staff_id uuid)
language plpgsql stable security definer set search_path = public as $$
declare
  s record;
begin
  if not exists (select 1 from staff x where x.business_id = p_business and x.active) then
    ok := _lane_free(p_business, null, p_start, p_end, p_exclude);
    staff_id := null;
    return next;
    return;
  end if;
  for s in
    select st.id from staff st
    where st.business_id = p_business and st.active and (p_staff is null or st.id = p_staff)
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
  ok := false;
  staff_id := null;
  return next;
end;
$$;

-- Comprueba un turno concreto. Devuelve 'ok', 'invalido' u 'ocupado'.
drop function if exists public._check_slot(uuid, date, text, int, uuid);
create or replace function public._check_slot(p_business uuid, p_date date, p_time text, p_duration int,
                                              p_exclude uuid default null, p_staff uuid default null)
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
  if not exists (
    select 1 from schedule_days
    where business_id = b.id and weekday = extract(dow from p_date)::int and is_open and v_time = any (slots)
  ) then
    return 'invalido';
  end if;
  v_start := (p_date + v_time) at time zone b.timezone;
  if v_start < now() + make_interval(hours => b.min_notice_hours) then return 'invalido'; end if;
  if not (select f.ok from _free_staff(b.id, v_start, v_start + make_interval(mins => greatest(p_duration, 5)),
                                      p_staff, p_exclude) f) then
    return 'ocupado';
  end if;
  return 'ok';
end;
$$;

-- Turnos de un día con su disponibilidad (con p_staff: solo la agenda de ese profesional)
drop function if exists public.get_available_slots(text, date, int);
create or replace function public.get_available_slots(p_slug text, p_date date, p_duration int, p_staff uuid default null)
returns table (slot text, available boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  b businesses;
  v_today date;
  v_is_open boolean;
  v_slots time[];
  t time;
  v_start timestamptz;
begin
  select * into b from businesses where slug = lower(p_slug);
  if not found or business_effective_plan(b.plan, b.trial_ends_at, b.paid_until) is null then
    return;
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
      and (select f.ok from _free_staff(b.id, v_start, v_start + make_interval(mins => greatest(coalesce(p_duration, 60), 5)),
                                        p_staff) f);
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

-- Comprueba un cupón antes de reservar (no lo gasta)
create or replace function public.check_discount(p_slug text, p_code text, p_service_ids uuid[])
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
  select coalesce(sum(price), 0) into v_sub
    from services where business_id = b.id and active and id = any (coalesce(p_service_ids, '{}'));
  select * into r from _discount_for(b.id, p_code, v_sub);
  return jsonb_build_object('code', r.code, 'percent', r.percent, 'amount', r.amount,
                            'subtotal', v_sub, 'discount', r.discount, 'total', v_sub - r.discount);
end;
$$;

-- Reserva desde la web pública
drop function if exists public.create_booking(text, uuid[], date, text, text, text, text);
drop function if exists public.create_booking(text, uuid[], date, text, text, text, text, text);
create or replace function public.create_booking(
  p_slug text, p_service_ids uuid[], p_date date, p_time text,
  p_name text, p_phone text, p_note text default null, p_code text default null, p_staff uuid default null)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  b businesses;
  v_staff uuid;
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
  select count(*), sum(duration_min), sum(price) into v_count, v_dur, v_total
    from services where business_id = b.id and active and id = any (p_service_ids);
  if v_count = 0 or v_count <> (select count(distinct x) from unnest(p_service_ids) x) then
    raise exception 'SERVICIOS_INVALIDOS';
  end if;

  -- Límites antiabuso
  if (select count(*) from appointments
      where business_id = b.id and customer_phone = v_phone
        and status in ('pendiente', 'confirmada') and starts_at > now()) >= 2 then
    raise exception 'LIMITE_CITAS';
  end if;
  if (select count(*) from appointments
      where business_id = b.id and customer_phone = v_phone
        and created_at > now() - interval '1 day') >= 3 then
    raise exception 'LIMITE_CITAS';
  end if;

  v_check := _check_slot(b.id, p_date, p_time, v_dur, null, p_staff);
  if v_check = 'invalido' then raise exception 'TURNO_INVALIDO'; end if;
  if v_check = 'ocupado' then raise exception 'TURNO_OCUPADO'; end if;

  -- Cupón: se valida y se gasta en la misma transacción que la reserva
  if nullif(btrim(coalesce(p_code, '')), '') is not null then
    select d.code, d.discount into v_code, v_disc from _discount_for(b.id, p_code, v_total, true) d;
    update discounts set uses = uses + 1 where business_id = b.id and code = v_code;
  end if;

  v_start := (p_date + p_time::time) at time zone b.timezone;
  v_token := replace(gen_random_uuid()::text, '-', '');
  select f.staff_id into v_staff from _free_staff(b.id, v_start, v_start + make_interval(mins => v_dur), p_staff) f;
  begin
    insert into appointments (business_id, token, starts_at, ends_at, customer_name, customer_phone,
                              customer_note, total, status, source, discount_code, discount, staff_id)
    values (b.id, v_token, v_start, v_start + make_interval(mins => v_dur), v_name, v_phone,
            nullif(left(btrim(coalesce(p_note, '')), 500), ''), v_total - v_disc, 'pendiente', 'web',
            v_code, v_disc, v_staff)
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'TURNO_OCUPADO';
  end;

  insert into appointment_services (appointment_id, service_id, name, price, duration_min)
  select v_id, s.id, s.name, s.price, s.duration_min
    from services s where s.business_id = b.id and s.id = any (p_service_ids)
    order by s.position;

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
    'discount', a.discount,
    'discount_code', a.discount_code,
    'staff_id', (select st.id from staff st where st.id = a.staff_id and st.active),
    'staff_name', (select st.name from staff st where st.id = a.staff_id),
    'status', a.status,
    'reschedule_count', a.reschedule_count,
    'can_change', a.status in ('pendiente', 'confirmada')
       and a.starts_at > now() + make_interval(hours => b.cancel_notice_hours),
    'services', coalesce((select jsonb_agg(jsonb_build_object('name', s.name, 'price', s.price,
                 'duration_min', s.duration_min)) from appointment_services s
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
      'name', b.name, 'slug', b.slug, 'whatsapp', b.whatsapp, 'address', b.address,
      'logo_url', b.logo_url, 'color_primary', b.color_primary, 'timezone', b.timezone,
      'currency', b.currency, 'cancel_notice_hours', b.cancel_notice_hours, 'appearance', b.appearance)
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
  v_pref uuid;
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
  if a.starts_at <= now() + make_interval(hours => b.cancel_notice_hours) then raise exception 'FUERA_DE_PLAZO'; end if;
  if a.reschedule_count >= 1 then raise exception 'LIMITE_CAMBIOS'; end if;

  v_dur := greatest(5, (extract(epoch from (a.ends_at - a.starts_at)) / 60)::int);
  -- Mismo profesional; si ya no está activo, cualquiera que esté libre
  v_pref := (select st.id from staff st where st.id = a.staff_id and st.active);
  v_check := _check_slot(b.id, p_date, p_time, v_dur, a.id, v_pref);
  if v_check = 'invalido' then raise exception 'TURNO_INVALIDO'; end if;
  if v_check = 'ocupado' then raise exception 'TURNO_OCUPADO'; end if;

  v_start := (p_date + p_time::time) at time zone b.timezone;
  begin
    update appointments
       set starts_at = v_start, ends_at = v_start + make_interval(mins => v_dur),
           reschedule_count = reschedule_count + 1, status = 'pendiente',
           staff_id = (select f.staff_id from _free_staff(b.id, v_start, v_start + make_interval(mins => v_dur),
                                                          v_pref, a.id) f)
     where id = a.id;
  exception when exclusion_violation then
    raise exception 'TURNO_OCUPADO';
  end;
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

-- ---------------------------------------------------------------------
-- 6. FUNCIONES DEL DUEÑO (con sesión)
-- ---------------------------------------------------------------------

-- Crea el negocio al terminar el asistente. Empieza la prueba gratis.
create or replace function public.create_business(
  p_name text, p_slug text, p_type text, p_whatsapp text, p_address text,
  p_color text, p_services jsonb, p_schedule jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_code text;
  v_prefix text;
  v_trial int;
  v_item jsonb;
  v_pos int := 0;
  i int := 0;
begin
  if v_uid is null then raise exception 'SIN_SESION'; end if;
  if exists (select 1 from businesses where owner_id = v_uid) then raise exception 'YA_TIENE_NEGOCIO'; end if;
  if not check_slug_available(p_slug) then raise exception 'ENLACE_NO_DISPONIBLE'; end if;

  select trial_days into v_trial from platform_settings where id = 1;

  v_prefix := upper(left(regexp_replace(lower(p_slug), '[^a-z]', '', 'g') || 'cit', 3));
  loop
    v_code := v_prefix || '-' || lpad((floor(random() * 10000))::int::text, 4, '0');
    exit when not exists (select 1 from businesses where code = v_code);
    i := i + 1;
    if i > 50 then raise exception 'ERROR_CODIGO'; end if;
  end loop;

  insert into businesses (owner_id, slug, code, name, business_type, whatsapp, address,
                          color_primary, trial_ends_at, policies)
  values (v_uid, lower(p_slug), v_code, btrim(p_name), coalesce(nullif(p_type, ''), 'otro'),
          _clean_phone(p_whatsapp), nullif(btrim(coalesce(p_address, '')), ''),
          coalesce(nullif(p_color, ''), '#7c3aed'),
          now() + make_interval(days => coalesce(v_trial, 3)),
          'Llega 5 minutos antes de tu cita. Si no puedes venir, cancela o cambia la fecha desde el enlace de tu cita.')
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_services, '[]'::jsonb)) loop
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

-- Datos para pagar (tarjeta y WhatsApp del administrador)
create or replace function public.get_payment_info()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'SIN_SESION'; end if;
  return (select jsonb_build_object(
    'card_number', card_number, 'card_holder', card_holder, 'admin_whatsapp', admin_whatsapp,
    'basico', price_basico, 'plus', price_plus, 'ultra', price_ultra)
    from platform_settings where id = 1);
end;
$$;

-- Cita creada por el dueño desde su agenda (puede ser a cualquier hora)
drop function if exists public.owner_create_appointment(uuid[], date, text, text, text, text);
create or replace function public.owner_create_appointment(
  p_service_ids uuid[], p_date date, p_time text, p_name text, p_phone text, p_note text default null,
  p_staff uuid default null)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  b businesses;
  v_dur int;
  v_total numeric;
  v_start timestamptz;
  v_id uuid;
begin
  select * into b from businesses where owner_id = auth.uid();
  if not found then raise exception 'SIN_NEGOCIO'; end if;
  if business_effective_plan(b.plan, b.trial_ends_at, b.paid_until) is null then
    raise exception 'NEGOCIO_INACTIVO';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'NOMBRE_INVALIDO'; end if;
  if p_staff is not null and not exists (select 1 from staff where id = p_staff and business_id = b.id) then
    raise exception 'PROFESIONAL_INVALIDO';
  end if;

  select coalesce(sum(duration_min), 0), coalesce(sum(price), 0) into v_dur, v_total
    from services where business_id = b.id and id = any (coalesce(p_service_ids, '{}'));
  if v_dur = 0 then v_dur := 60; end if;

  v_start := (p_date + p_time::time) at time zone b.timezone;
  begin
    insert into appointments (business_id, token, starts_at, ends_at, customer_name, customer_phone,
                              customer_note, total, status, source, staff_id)
    values (b.id, replace(gen_random_uuid()::text, '-', ''), v_start,
            v_start + make_interval(mins => v_dur), btrim(p_name), _clean_phone(p_phone),
            nullif(btrim(coalesce(p_note, '')), ''), v_total, 'confirmada', 'manual', p_staff)
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'TURNO_OCUPADO';
  end;

  insert into appointment_services (appointment_id, service_id, name, price, duration_min)
  select v_id, s.id, s.name, s.price, s.duration_min
    from services s where s.business_id = b.id and s.id = any (coalesce(p_service_ids, '{}'))
    order by s.position;
  return v_id;
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
  begin
    update appointments set starts_at = v_start, ends_at = v_start + make_interval(mins => v_dur)
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
              and p.status <> 'cancelada' and p.starts_at < v_from))
      )
      from appointments a
      where a.business_id = b.id and a.starts_at >= v_from and a.starts_at < v_to),
    'by_day', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', d.day, 'bookings', coalesce(x.n, 0), 'revenue', coalesce(x.r, 0)) order by d.day), '[]'::jsonb)
      from (select g::date as day from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') g) d
      left join (
        select (a.starts_at at time zone b.timezone)::date as day, count(*) as n,
               sum(a.total) filter (where _appt_done(a.status, a.ends_at)) as r
        from appointments a
        where a.business_id = b.id and a.starts_at >= v_from and a.starts_at < v_to and a.status <> 'cancelada'
        group by 1) x on x.day = d.day),
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
      'paid_until', b.paid_until, 'created_at', b.created_at,
      'status', business_status(b.plan, b.trial_ends_at, b.paid_until),
      'owner_email', u.email,
      'appointments_count', (select count(*) from appointments a where a.business_id = b.id)
    ) order by b.created_at desc)
    from businesses b left join auth.users u on u.id = b.owner_id), '[]'::jsonb);
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
      'paid_until', b.paid_until, 'created_at', b.created_at,
      'status', case when b.id is null then 'sin_negocio'
                     else business_status(b.plan, b.trial_ends_at, b.paid_until) end
    ) order by u.created_at desc)
    from auth.users u
    left join businesses b on b.owner_id = u.id
    where not exists (select 1 from platform_admins a where a.user_id = u.id)), '[]'::jsonb);
end;
$$;

create or replace function public.admin_activate_plan(
  p_business uuid, p_plan text, p_months int, p_amount numeric default null, p_note text default null)
returns timestamptz language plpgsql volatile security definer set search_path = public as $$
declare
  b businesses;
  v_until timestamptz;
begin
  if not is_platform_admin() then raise exception 'NO_AUTORIZADO'; end if;
  if p_plan not in ('basico', 'plus', 'ultra') then raise exception 'PLAN_INVALIDO'; end if;
  if p_months is null or p_months not between 1 and 24 then raise exception 'MESES_INVALIDOS'; end if;
  select * into b from businesses where id = p_business for update;
  if not found then raise exception 'NEGOCIO_NO_EXISTE'; end if;

  -- Si aún tiene meses pagados, se suman al final; si no, empiezan hoy
  v_until := greatest(now(), coalesce(b.paid_until, now())) + make_interval(months => p_months);
  update businesses set plan = p_plan, paid_until = v_until where id = b.id;
  insert into payments (business_id, plan, months, amount, note, paid_until, created_by)
  values (b.id, p_plan, p_months, p_amount, nullif(btrim(coalesce(p_note, '')), ''), v_until, auth.uid());
  return v_until;
end;
$$;

-- Inhabilita un negocio ya (por ejemplo, si se activó por error)
create or replace function public.admin_deactivate_business(p_business uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'NO_AUTORIZADO'; end if;
  update businesses
     set paid_until = least(coalesce(paid_until, now()), now()),
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

-- Estadísticas de la plataforma
create or replace function public.admin_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text := 'America/Havana';
  v_first timestamp := date_trunc('month', now() at time zone v_tz) - interval '11 months';
begin
  if not is_platform_admin() then raise exception 'NO_AUTORIZADO'; end if;
  return jsonb_build_object(
    'months', (
      select jsonb_agg(jsonb_build_object(
        'month', to_char(m, 'YYYY-MM'),
        'signups', (select count(*) from businesses b
                    where b.created_at >= m at time zone v_tz and b.created_at < (m + interval '1 month') at time zone v_tz),
        'revenue', (select coalesce(sum(p.amount), 0) from payments p
                    where p.created_at >= m at time zone v_tz and p.created_at < (m + interval '1 month') at time zone v_tz),
        'payments', (select count(*) from payments p
                     where p.created_at >= m at time zone v_tz and p.created_at < (m + interval '1 month') at time zone v_tz),
        'appointments', (select count(*) from appointments a
                         where a.created_at >= m at time zone v_tz and a.created_at < (m + interval '1 month') at time zone v_tz)
      ) order by m)
      from generate_series(v_first, date_trunc('month', now() at time zone v_tz), interval '1 month') m),
    'totals', (select jsonb_build_object(
        'businesses', (select count(*) from businesses),
        'revenue', (select coalesce(sum(amount), 0) from payments),
        'appointments', (select count(*) from appointments),
        'appointments_30d', (select count(*) from appointments where created_at > now() - interval '30 days'),
        'active_30d', (select count(distinct business_id) from appointments where created_at > now() - interval '30 days'),
        'ended_trials', (select count(*) from businesses where trial_ends_at < now()),
        'converted', (select count(*) from businesses b
                      where b.trial_ends_at < now() and exists (select 1 from payments p where p.business_id = b.id)))),
    'by_plan', (select jsonb_build_object(
        'basico', count(*) filter (where business_status(plan, trial_ends_at, paid_until) = 'activo' and plan = 'basico'),
        'plus', count(*) filter (where business_status(plan, trial_ends_at, paid_until) = 'activo' and plan = 'plus'),
        'ultra', count(*) filter (where business_status(plan, trial_ends_at, paid_until) = 'activo' and plan = 'ultra'),
        'prueba', count(*) filter (where business_status(plan, trial_ends_at, paid_until) = 'prueba'),
        'vencido', count(*) filter (where business_status(plan, trial_ends_at, paid_until) = 'vencido'))
      from businesses),
    'by_type', (select coalesce(jsonb_agg(jsonb_build_object('type', t.business_type, 'count', t.n) order by t.n desc), '[]'::jsonb)
      from (select business_type, count(*) as n from businesses group by 1) t),
    'top_businesses', (select coalesce(jsonb_agg(jsonb_build_object(
        'name', t.name, 'slug', t.slug, 'code', t.code, 'count', t.n) order by t.n desc), '[]'::jsonb)
      from (select b.name, b.slug, b.code, count(*) as n
            from appointments a join businesses b on b.id = a.business_id
            where a.created_at > now() - interval '30 days'
            group by b.id order by count(*) desc limit 10) t),
    -- A quién escribir: planes que vencen en 7 días y pruebas que terminan en 2
    'expiring', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', b.id, 'name', b.name, 'code', b.code, 'whatsapp', b.whatsapp,
        'kind', business_status(b.plan, b.trial_ends_at, b.paid_until),
        'ends_at', case when business_status(b.plan, b.trial_ends_at, b.paid_until) = 'activo'
                        then b.paid_until else b.trial_ends_at end)
        order by case when business_status(b.plan, b.trial_ends_at, b.paid_until) = 'activo'
                      then b.paid_until else b.trial_ends_at end), '[]'::jsonb)
      from businesses b
      where (business_status(b.plan, b.trial_ends_at, b.paid_until) = 'activo' and b.paid_until < now() + interval '7 days')
         or (business_status(b.plan, b.trial_ends_at, b.paid_until) = 'prueba' and b.trial_ends_at < now() + interval '2 days')),
    'recent_payments', (select coalesce(jsonb_agg(jsonb_build_object(
        'name', t.name, 'code', t.code, 'plan', t.plan, 'months', t.months, 'amount', t.amount,
        'note', t.note, 'created_at', t.created_at) order by t.created_at desc), '[]'::jsonb)
      from (select b.name, b.code, p.plan, p.months, p.amount, p.note, p.created_at
            from payments p join businesses b on b.id = p.business_id
            order by p.created_at desc limit 15) t)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 8. PERMISOS DE EJECUCIÓN
-- ---------------------------------------------------------------------

revoke execute on all functions in schema public from public;

grant execute on function public.get_public_prices() to anon, authenticated;
grant execute on function public.get_public_business(text) to anon, authenticated;
grant execute on function public.get_available_slots(text, date, int, uuid) to anon, authenticated;
grant execute on function public.create_booking(text, uuid[], date, text, text, text, text, text, uuid) to anon, authenticated;
grant execute on function public.check_discount(text, text, uuid[]) to anon, authenticated;
grant execute on function public.join_waitlist(text, date, text, text, text) to anon, authenticated;
grant execute on function public.get_booking(text) to anon, authenticated;
grant execute on function public.cancel_booking(text) to anon, authenticated;
grant execute on function public.reschedule_booking(text, date, text) to anon, authenticated;
grant execute on function public.check_slug_available(text) to anon, authenticated;

grant execute on function public.create_business(text, text, text, text, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.get_my_business_status() to authenticated;
grant execute on function public.get_payment_info() to authenticated;
grant execute on function public.owner_create_appointment(uuid[], date, text, text, text, text, uuid) to authenticated;
grant execute on function public.owner_reschedule_appointment(uuid, date, text) to authenticated;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.admin_list_businesses() to authenticated;
grant execute on function public.admin_list_owners() to authenticated;
grant execute on function public.admin_activate_plan(uuid, text, int, numeric, text) to authenticated;
grant execute on function public.admin_deactivate_business(uuid) to authenticated;
grant execute on function public.admin_extend_trial(uuid, int) to authenticated;
grant execute on function public.admin_stats() to authenticated;
grant execute on function public.submit_review(text, int, text) to anon, authenticated;
grant execute on function public.owner_customers() to authenticated;
grant execute on function public.owner_stats(date, date) to authenticated;
grant execute on function public.my_plan_has(text) to authenticated;
grant execute on function public.plan_has(text, text) to anon, authenticated;
grant execute on function public._appt_done(text, timestamptz) to anon, authenticated;
grant execute on function public.reviews_guard() to authenticated;
grant execute on function public.discounts_guard() to authenticated;

-- Funciones usadas dentro de las reglas RLS y disparadores
grant execute on function public.my_business_id() to authenticated;
grant execute on function public.my_business_active() to authenticated;
grant execute on function public.business_effective_plan(text, timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.business_status(text, timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.is_valid_slug(text) to anon, authenticated;
grant execute on function public.is_reserved_slug(text) to anon, authenticated;
grant execute on function public._clean_phone(text) to anon, authenticated;
grant execute on function public._clean_appearance(jsonb) to authenticated;
grant execute on function public.businesses_guard() to authenticated;
grant execute on function public.appointments_guard() to authenticated;
grant execute on function public.schedule_days_normalize() to authenticated;

-- Funciones internas: nadie las llama desde fuera
revoke execute on function public._is_range_free(uuid, timestamptz, timestamptz, uuid) from anon, authenticated;
revoke execute on function public._check_slot(uuid, date, text, int, uuid, uuid) from anon, authenticated;
revoke execute on function public._lane_free(uuid, uuid, timestamptz, timestamptz, uuid) from anon, authenticated;
revoke execute on function public._free_staff(uuid, timestamptz, timestamptz, uuid, uuid) from anon, authenticated;
revoke execute on function public._owner_business(text) from anon, authenticated;
revoke execute on function public._discount_for(uuid, text, numeric, boolean) from anon, authenticated;

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

    execute 'drop policy if exists "logos_owner_insert" on storage.objects';
    execute 'drop policy if exists "logos_owner_update" on storage.objects';
    execute 'drop policy if exists "logos_owner_delete" on storage.objects';
    execute $p$create policy "logos_owner_insert" on storage.objects for insert to authenticated
      with check (bucket_id = 'logos' and (storage.foldername(name))[1] = public.my_business_id()::text)$p$;
    execute $p$create policy "logos_owner_update" on storage.objects for update to authenticated
      using (bucket_id = 'logos' and (storage.foldername(name))[1] = public.my_business_id()::text)$p$;
    execute $p$create policy "logos_owner_delete" on storage.objects for delete to authenticated
      using (bucket_id = 'logos' and (storage.foldername(name))[1] = public.my_business_id()::text)$p$;
  end if;
end;
$$;
-- ---------------------------------------------------------------------
-- 10. Avisa a la API de Supabase de que hay funciones o tablas nuevas
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';
