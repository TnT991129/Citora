\set ON_ERROR_STOP 1
-- Ayudante: comprueba que una sentencia falla con un mensaje concreto
create or replace function public.expect_error(p_sql text, p_msg text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'ESPERABA ERROR % y no falló: %', p_msg, p_sql;
exception when others then
  if sqlerrm not like '%' || p_msg || '%' then
    raise exception 'ESPERABA % pero fue: % (en %)', p_msg, sqlerrm, p_sql;
  end if;
  raise notice 'ok error %', p_msg;
end $$;
grant execute on function public.expect_error(text, text) to anon, authenticated;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'leo@test.com'),
  ('22222222-2222-2222-2222-222222222222', 'mar@test.com'),
  ('99999999-9999-9999-9999-999999999999', 'osmel@test.com');
insert into platform_admins values ('99999999-9999-9999-9999-999999999999');
update platform_settings set card_number = '9200 1111 2222 3333', admin_whatsapp = '+5355555555';

create temp table ctx (k text primary key, v text);
grant all on ctx to anon, authenticated;

-- ===== Dueño 1 crea su negocio =====
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select create_business('Barbería Leo', 'Barberia-Leo', 'barberia', '+53 5 555 1234', 'Calle 1', '#0ea5e9',
  '[{"name":"Corte","price":500,"duration_min":30},{"name":"Barba","price":300,"duration_min":30},{"name":"","price":1}]',
  (select jsonb_agg(jsonb_build_object('weekday', d, 'is_open', true, 'slots', jsonb_build_array('11:00','09:00','10:00','14:00','09:00'))) from generate_series(0,6) d)
) as created \gset
\echo :created
insert into ctx values ('biz1', (:'created'::jsonb)->>'id');
select expect_error($$select create_business('Otra', 'otra-mas', 'x', '1', '', '#000000', '[]', '[]')$$, 'YA_TIENE_NEGOCIO');
select get_my_business_status()->>'status' as st \gset
\echo status dueño1: :st
do $$ begin assert (select count(*) from services) = 2, 'deben ser 2 servicios (uno vacío ignorado)'; end $$;
do $$ begin assert (select slots from schedule_days where weekday = 1) = '{09:00,10:00,11:00,14:00}'::time[], 'turnos ordenados sin duplicados'; end $$;

-- ===== Dueño 2: enlaces reservados y ocupados =====
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select expect_error($$select create_business('Panel', 'panel', 'x', '1', '', '#000000', '[]', '[]')$$, 'ENLACE_NO_DISPONIBLE');
select expect_error($$select create_business('Leo2', 'barberia-leo', 'x', '1', '', '#000000', '[]', '[]')$$, 'ENLACE_NO_DISPONIBLE');
select create_business('Spa Mar', 'spa-mar', 'spa', '55551111', '', '#db2777', '[{"name":"Masaje","price":1000,"duration_min":60}]', '[]');

-- ===== Visitante anónimo reserva =====
reset request.jwt.claim.sub;
set role anon;
do $$ begin assert (get_public_business('barberia-leo')->>'accepting')::boolean, 'debe aceptar reservas en prueba'; end $$;
do $$ begin assert get_public_business('no-existe') is null; end $$;
select expect_error('select * from appointments', 'permission denied');
select expect_error('select * from businesses', 'permission denied');

insert into ctx values ('day', ((now() at time zone 'America/Havana')::date + 2)::text);
insert into ctx select 'corte', (get_public_business('barberia-leo')->'services'->0->>'id');
insert into ctx select 'barba', (get_public_business('barberia-leo')->'services'->1->>'id');

do $$ declare d date := (select v from ctx where k='day')::date; n int; begin
  select count(*) into n from get_available_slots('barberia-leo', d, 30) where available;
  assert n = 4, 'deben haber 4 turnos libres, hay ' || n;
end $$;

-- Reserva corte a las 10:00
insert into ctx select 't1', create_booking('barberia-leo', array[(select v from ctx where k='corte')::uuid], (select v from ctx where k='day')::date, '10:00', 'Juan Pérez', '+53 5 111 2222', 'Hola');

do $$ declare d date := (select v from ctx where k='day')::date; begin
  assert not (select available from get_available_slots('barberia-leo', d, 30) where slot = '10:00'), '10:00 ocupado';
  assert (select available from get_available_slots('barberia-leo', d, 30) where slot = '09:00'), '09:00 libre para 30 min';
  assert not (select available from get_available_slots('barberia-leo', d, 90) where slot = '09:00'), '09:00 NO libre para 90 min (solapa con 10:00)';
end $$;

select expect_error($$select create_booking('barberia-leo', array['$$ || (select v from ctx where k='corte') || $$'::uuid], '$$ || (select v from ctx where k='day') || $$', '10:00', 'Ana', '55553333')$$, 'TURNO_OCUPADO');
select expect_error($$select create_booking('barberia-leo', array['$$ || (select v from ctx where k='corte') || $$'::uuid], '$$ || (select v from ctx where k='day') || $$', '10:30', 'Ana', '55553333')$$, 'TURNO_INVALIDO');
select expect_error($$select create_booking('barberia-leo', array['$$ || (select v from ctx where k='corte') || $$'::uuid], '2020-01-01', '10:00', 'Ana', '55553333')$$, 'TURNO_INVALIDO');
select expect_error($$select create_booking('barberia-leo', array[gen_random_uuid()], '$$ || (select v from ctx where k='day') || $$', '09:00', 'Ana', '55553333')$$, 'SERVICIOS_INVALIDOS');
select expect_error($$select create_booking('barberia-leo', array['$$ || (select v from ctx where k='corte') || $$'::uuid], '$$ || (select v from ctx where k='day') || $$', '09:00', 'A', '55553333')$$, 'NOMBRE_INVALIDO');
select expect_error($$select create_booking('barberia-leo', array['$$ || (select v from ctx where k='corte') || $$'::uuid], '$$ || (select v from ctx where k='day') || $$', '09:00', 'Ana', '123')$$, 'TELEFONO_INVALIDO');

-- Mismo teléfono: 2 citas pendientes como máximo
select create_booking('barberia-leo', array[(select v from ctx where k='corte')::uuid, (select v from ctx where k='barba')::uuid], (select v from ctx where k='day')::date, '14:00', 'Juan Pérez', '53 5 111-2222') is not null as segunda_ok;
select expect_error($$select create_booking('barberia-leo', array['$$ || (select v from ctx where k='corte') || $$'::uuid], '$$ || (select v from ctx where k='day') || $$', '09:00', 'Juan', '+53 5 111 2222')$$, 'LIMITE_CITAS');
do $$ begin assert (select count(*) from get_available_slots('barberia-leo', (select v from ctx where k='day')::date, 30) where available) = 2, 'libres 09:00 y 11:00'; end $$;
select create_booking('barberia-leo', array[(select v from ctx where k='corte')::uuid], (select v from ctx where k='day')::date, '09:00', 'Otra Persona', '(+53) 52 22 33 44') is not null as otro_telefono_ok;
reset role;
do $$ begin assert (select count(distinct customer_phone) from appointments) = 2, 'teléfonos normalizados'; end $$;
delete from appointments where customer_name = 'Otra Persona';
set role anon;

-- Página de la cita, cambio de fecha y cancelación
do $$ declare j jsonb := get_booking((select v from ctx where k='t1')); begin
  assert j->>'status' = 'pendiente';
  assert (j->>'total')::numeric = 500;
  assert (j->>'can_change')::boolean;
  assert j->'business'->>'name' = 'Barbería Leo';
  -- 10:00 en La Habana (UTC-4 en octubre) = 14:00 UTC
  assert to_char((j->>'starts_at')::timestamptz at time zone 'UTC', 'HH24:MI') = '14:00', 'zona horaria: ' || (j->>'starts_at');
end $$;
select reschedule_booking((select v from ctx where k='t1'), (select v from ctx where k='day')::date, '11:00');
select expect_error($$select reschedule_booking('$$ || (select v from ctx where k='t1') || $$', '$$ || (select v from ctx where k='day') || $$', '09:00')$$, 'LIMITE_CAMBIOS');
do $$ declare d date := (select v from ctx where k='day')::date; begin
  assert (select available from get_available_slots('barberia-leo', d, 30) where slot = '10:00'), '10:00 vuelve a estar libre';
  assert not (select available from get_available_slots('barberia-leo', d, 30) where slot = '11:00'), '11:00 ocupado';
end $$;
select cancel_booking((select v from ctx where k='t1'));
select expect_error($$select cancel_booking('$$ || (select v from ctx where k='t1') || $$')$$, 'CITA_NO_MODIFICABLE');
do $$ declare d date := (select v from ctx where k='day')::date; begin
  assert (select available from get_available_slots('barberia-leo', d, 30) where slot = '11:00'), '11:00 libre tras cancelar';
end $$;

-- Día cerrado (lo añade el dueño)
reset role;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into closed_days (business_id, day) values (my_business_id(), (select v from ctx where k='day')::date + 1);
do $$ begin assert (select count(*) from get_available_slots('barberia-leo', (select v from ctx where k='day')::date + 1, 30)) = 0, 'día cerrado sin turnos'; end $$;

-- ===== El dueño 1 ve sus citas; el dueño 2 no =====
do $$ begin assert (select count(*) from appointments) = 2, 'dueño 1 ve 2 citas'; end $$;
do $$ begin assert (select count(*) from appointment_services) = 3; end $$;
select owner_create_appointment(array[(select v from ctx where k='corte')::uuid], (select v from ctx where k='day')::date, '12:30', 'Cliente Manual', '5555', null) is not null as manual_ok;
select expect_error($$select owner_create_appointment(null, '$$ || (select v from ctx where k='day') || $$', '14:15', 'Choca', '5555')$$, 'TURNO_OCUPADO');
update appointments set status = 'confirmada', token = 'hack' where customer_name = 'Cliente Manual';
do $$ begin assert (select token from appointments where customer_name = 'Cliente Manual') <> 'hack', 'token protegido'; end $$;
-- El dueño no puede regalarse un plan
update businesses set plan = 'ultra', paid_until = now() + interval '10 years', name = 'Barbería Leo VIP';
do $$ begin
  assert (select paid_until from businesses) is null, 'paid_until protegido';
  assert (select name from businesses) = 'Barbería Leo VIP', 'el nombre sí se puede cambiar';
end $$;
select expect_error($$update businesses set slug = 'admin'$$, 'ENLACE_INVALIDO');

set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ begin
  assert (select count(*) from appointments) = 0, 'dueño 2 no ve citas ajenas';
  assert (select count(*) from businesses) = 1, 'dueño 2 solo ve su negocio';
  assert (select count(*) from services) = 1;
end $$;
update businesses set name = 'Hackeado' where slug = 'barberia-leo';
select expect_error($$insert into services (business_id, name) values ('$$ || (select v from ctx where k='biz1') || $$', 'Intruso')$$, 'row-level security');
select expect_error('select admin_list_businesses()', 'NO_AUTORIZADO');
select expect_error($$select admin_activate_plan('$$ || (select v from ctx where k='biz1') || $$', 'ultra', 12)$$, 'NO_AUTORIZADO');
do $$ begin assert (select count(*) from platform_settings) = 0, 'el dueño no lee los ajustes directamente'; end $$;
do $$ begin assert get_payment_info()->>'card_number' = '9200 1111 2222 3333'; end $$;

-- ===== Fin de la prueba: la app se inhabilita =====
reset role;
update businesses set trial_ends_at = now() - interval '1 minute' where slug = 'barberia-leo';
do $$ begin assert (select name from businesses where slug='barberia-leo') = 'Barbería Leo VIP', 'dueño 2 no pudo renombrar'; end $$;
set role anon;
do $$ begin assert not (get_public_business('barberia-leo')->>'accepting')::boolean, 'no acepta reservas vencido'; end $$;
do $$ begin assert get_public_business('barberia-leo')->'services' is null, 'vencido no expone servicios'; end $$;
do $$ begin assert (select count(*) from get_available_slots('barberia-leo', (select v from ctx where k='day')::date, 30)) = 0; end $$;
select expect_error($$select create_booking('barberia-leo', array['$$ || (select v from ctx where k='corte') || $$'::uuid], '$$ || (select v from ctx where k='day') || $$', '09:00', 'Ana', '55553333')$$, 'NEGOCIO_INACTIVO');
reset role;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$ begin
  assert get_my_business_status()->>'status' = 'vencido';
  assert (select count(*) from appointments) = 0, 'vencido: el dueño no ve citas';
  assert (select count(*) from services) = 2, 'pero sus datos siguen ahí';
end $$;

-- ===== El administrador activa el plan Plus =====
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
do $$ begin assert jsonb_array_length(admin_list_businesses()) = 2; end $$;
select admin_activate_plan((select v from ctx where k='biz1')::uuid, 'plus', 1, 2000, 'Captura WhatsApp') as hasta;
select admin_activate_plan((select v from ctx where k='biz1')::uuid, 'plus', 2) as hasta_sumado;
do $$ begin
  assert (select count(*) from payments) = 2;
  assert (select paid_until from businesses where slug='barberia-leo') > now() + interval '85 days', 'meses acumulados';
end $$;
select admin_extend_trial((select id from businesses where slug='spa-mar'), 5);
update platform_settings set price_plus = 2100;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$ begin
  assert get_my_business_status()->>'status' = 'activo';
  assert get_my_business_status()->>'effective_plan' = 'plus';
  assert (select count(*) from appointments) = 3, 'vuelve a ver sus citas';
  assert (select count(*) from payments) = 2, 've sus pagos';
end $$;
reset role;
set role anon;
do $$ begin
  assert (get_public_business('barberia-leo')->>'accepting')::boolean;
  assert get_public_business('barberia-leo')->>'plan' = 'plus';
  assert (get_public_prices()->>'plus')::int = 2100;
end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
select admin_deactivate_business((select v from ctx where k='biz1')::uuid);
reset role;
set role anon;
do $$ begin assert not (get_public_business('barberia-leo')->>'accepting')::boolean, 'desactivado'; end $$;
\echo TODAS LAS PRUEBAS PASARON
