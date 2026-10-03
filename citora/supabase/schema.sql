-- =====================================================================
-- CITORA · Base de datos (Fase 1)
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
  price_basico int not null default 1500,
  price_plus int not null default 2000,
  price_ultra int not null default 2500,
  trial_days int not null default 3 check (trial_days between 0 and 60),
  updated_at timestamptz not null default now()
);
insert into public.platform_settings (id) values (1) on conflict (id) do nothing;

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
      'color_primary', b.color_primary, 'accepting', false);
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
      where c.business_id = b.id and c.day >= (now() at time zone b.timezone)::date), '[]'::jsonb)
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

-- Comprueba un turno concreto. Devuelve 'ok', 'invalido' u 'ocupado'.
create or replace function public._check_slot(p_business uuid, p_date date, p_time text, p_duration int, p_exclude uuid default null)
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
  if not _is_range_free(b.id, v_start, v_start + make_interval(mins => greatest(p_duration, 5)), p_exclude) then
    return 'ocupado';
  end if;
  return 'ok';
end;
$$;

-- Turnos de un día con su disponibilidad
create or replace function public.get_available_slots(p_slug text, p_date date, p_duration int)
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
      and _is_range_free(b.id, v_start, v_start + make_interval(mins => greatest(coalesce(p_duration, 60), 5)));
    return next;
  end loop;
end;
$$;

-- Normaliza un teléfono: deja solo los dígitos (así lo usa WhatsApp)
create or replace function public._clean_phone(p text)
returns text language sql immutable as $$
  select regexp_replace(coalesce(p, ''), '\D', '', 'g');
$$;

-- Reserva desde la web pública
create or replace function public.create_booking(
  p_slug text, p_service_ids uuid[], p_date date, p_time text,
  p_name text, p_phone text, p_note text default null)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  b businesses;
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

  v_check := _check_slot(b.id, p_date, p_time, v_dur);
  if v_check = 'invalido' then raise exception 'TURNO_INVALIDO'; end if;
  if v_check = 'ocupado' then raise exception 'TURNO_OCUPADO'; end if;

  v_start := (p_date + p_time::time) at time zone b.timezone;
  v_token := replace(gen_random_uuid()::text, '-', '');
  begin
    insert into appointments (business_id, token, starts_at, ends_at, customer_name, customer_phone,
                              customer_note, total, status, source)
    values (b.id, v_token, v_start, v_start + make_interval(mins => v_dur), v_name, v_phone,
            nullif(left(btrim(coalesce(p_note, '')), 500), ''), v_total, 'pendiente', 'web')
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
    'status', a.status,
    'reschedule_count', a.reschedule_count,
    'can_change', a.status in ('pendiente', 'confirmada')
       and a.starts_at > now() + make_interval(hours => b.cancel_notice_hours),
    'services', coalesce((select jsonb_agg(jsonb_build_object('name', s.name, 'price', s.price,
                 'duration_min', s.duration_min)) from appointment_services s
                 where s.appointment_id = a.id), '[]'::jsonb),
    'business', jsonb_build_object(
      'name', b.name, 'slug', b.slug, 'whatsapp', b.whatsapp, 'address', b.address,
      'logo_url', b.logo_url, 'color_primary', b.color_primary, 'timezone', b.timezone,
      'currency', b.currency, 'cancel_notice_hours', b.cancel_notice_hours)
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
  v_check := _check_slot(b.id, p_date, p_time, v_dur, a.id);
  if v_check = 'invalido' then raise exception 'TURNO_INVALIDO'; end if;
  if v_check = 'ocupado' then raise exception 'TURNO_OCUPADO'; end if;

  v_start := (p_date + p_time::time) at time zone b.timezone;
  begin
    update appointments
       set starts_at = v_start, ends_at = v_start + make_interval(mins => v_dur),
           reschedule_count = reschedule_count + 1, status = 'pendiente'
     where id = a.id;
  exception when exclusion_violation then
    raise exception 'TURNO_OCUPADO';
  end;
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
create or replace function public.owner_create_appointment(
  p_service_ids uuid[], p_date date, p_time text, p_name text, p_phone text, p_note text default null)
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

  select coalesce(sum(duration_min), 0), coalesce(sum(price), 0) into v_dur, v_total
    from services where business_id = b.id and id = any (coalesce(p_service_ids, '{}'));
  if v_dur = 0 then v_dur := 60; end if;

  v_start := (p_date + p_time::time) at time zone b.timezone;
  begin
    insert into appointments (business_id, token, starts_at, ends_at, customer_name, customer_phone,
                              customer_note, total, status, source)
    values (b.id, replace(gen_random_uuid()::text, '-', ''), v_start,
            v_start + make_interval(mins => v_dur), btrim(p_name), _clean_phone(p_phone),
            nullif(btrim(coalesce(p_note, '')), ''), v_total, 'confirmada', 'manual')
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

-- ---------------------------------------------------------------------
-- 8. PERMISOS DE EJECUCIÓN
-- ---------------------------------------------------------------------

revoke execute on all functions in schema public from public;

grant execute on function public.get_public_prices() to anon, authenticated;
grant execute on function public.get_public_business(text) to anon, authenticated;
grant execute on function public.get_available_slots(text, date, int) to anon, authenticated;
grant execute on function public.create_booking(text, uuid[], date, text, text, text, text) to anon, authenticated;
grant execute on function public.get_booking(text) to anon, authenticated;
grant execute on function public.cancel_booking(text) to anon, authenticated;
grant execute on function public.reschedule_booking(text, date, text) to anon, authenticated;
grant execute on function public.check_slug_available(text) to anon, authenticated;

grant execute on function public.create_business(text, text, text, text, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.get_my_business_status() to authenticated;
grant execute on function public.get_payment_info() to authenticated;
grant execute on function public.owner_create_appointment(uuid[], date, text, text, text, text) to authenticated;
grant execute on function public.owner_reschedule_appointment(uuid, date, text) to authenticated;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.admin_list_businesses() to authenticated;
grant execute on function public.admin_activate_plan(uuid, text, int, numeric, text) to authenticated;
grant execute on function public.admin_deactivate_business(uuid) to authenticated;
grant execute on function public.admin_extend_trial(uuid, int) to authenticated;

-- Funciones usadas dentro de las reglas RLS y disparadores
grant execute on function public.my_business_id() to authenticated;
grant execute on function public.my_business_active() to authenticated;
grant execute on function public.business_effective_plan(text, timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.business_status(text, timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.is_valid_slug(text) to anon, authenticated;
grant execute on function public.is_reserved_slug(text) to anon, authenticated;
grant execute on function public._clean_phone(text) to anon, authenticated;
grant execute on function public.businesses_guard() to authenticated;
grant execute on function public.appointments_guard() to authenticated;
grant execute on function public.schedule_days_normalize() to authenticated;

-- Funciones internas: nadie las llama desde fuera
revoke execute on function public._is_range_free(uuid, timestamptz, timestamptz, uuid) from anon, authenticated;
revoke execute on function public._check_slot(uuid, date, text, int, uuid) from anon, authenticated;

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
