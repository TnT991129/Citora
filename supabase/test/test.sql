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

insert into ctx values ('day', ((now() at time zone 'Etc/GMT+4')::date + 2)::text);
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
  assert (j->>'can_cancel')::boolean and (j->>'can_edit')::boolean;
  assert j->'business'->>'name' = 'Barbería Leo';
  -- Las 10:00 en Cuba (UTC−4 todo el año: no cambia la hora en invierno)
  assert j->'business'->>'timezone' = 'Etc/GMT+4', 'Cuba por defecto: ' || (j->'business')::text;
  assert to_char((j->>'starts_at')::timestamptz at time zone 'UTC', 'HH24:MI') = '14:00', 'guardada en UTC: ' || (j->>'starts_at');
end $$;
select reschedule_booking((select v from ctx where k='t1'), (select v from ctx where k='day')::date, '11:00');
-- Sin límite de cambios: se puede volver a cambiar (aquí, a la misma hora)
select reschedule_booking((select v from ctx where k='t1'), (select v from ctx where k='day')::date, '11:00');
-- Editar solo el nombre y la nota no cambia la hora ni la confirmación
select edit_booking((select v from ctx where k='t1'),
  array(select (x->>'id')::uuid from jsonb_array_elements(get_booking((select v from ctx where k='t1'))->'services') x),
  (select v from ctx where k='day')::date, '11:00', 'Ana Pérez', 'Llego puntual');
do $$ declare j jsonb := get_booking((select v from ctx where k='t1')); begin
  assert j->>'customer_name' = 'Ana Pérez' and j->>'customer_note' = 'Llego puntual', 'edición de nombre y nota';
end $$;
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
-- Apariencia: solo se guardan opciones válidas
update businesses set cover_url = 'javascript:alert(1)', appearance = '{
  "font": "playfair", "buttons": "pill", "announcement": "  20% en cortes  ", "instagram": "@barberia.leo",
  "tiktok": "mal usuario!", "maps_url": "javascript:alert(1)", "show_prices": false, "show_gallery": "no",
  "otra_cosa": 1, "color2": "#ABCDEF", "gradient_angle": 33, "page_bg": "tinted", "cover_style": "gradient", "book_label": "Pedir turno con un texto larguísimo que no cabe en el botón"}';
do $$ declare a jsonb := (select appearance from businesses); begin
  assert (select cover_url from businesses) is null, 'portada sin https descartada';
  assert a->>'font' = 'playfair' and a->>'buttons' = 'pill', 'letra y botones: ' || a;
  assert a->>'announcement' = '20% en cortes', 'aviso recortado';
  assert a->>'instagram' = 'barberia.leo', 'sin la @';
  assert not a ? 'tiktok' and not a ? 'maps_url' and not a ? 'otra_cosa' and not a ? 'show_gallery', 'descarta lo no válido: ' || a;
  assert (a->>'show_prices')::boolean = false;
  assert a->>'color2' = '#abcdef' and not a ? 'gradient_angle', 'segundo color sí, ángulo raro no: ' || a;
  assert a->>'page_bg' = 'tinted' and a->>'cover_style' = 'gradient';
  assert char_length(a->>'book_label') = 30, 'texto del botón limitado a 30';
end $$;
update businesses set appearance = '{}', cover_url = 'https://x.supabase.co/storage/v1/object/public/logos/c.webp';

set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ begin
  assert (select count(*) from appointments) = 0, 'dueño 2 no ve citas ajenas';
  assert (select count(*) from businesses) = 1, 'dueño 2 solo ve su negocio';
  assert (select count(*) from services) = 1;
end $$;
update businesses set name = 'Hackeado' where slug = 'barberia-leo';
select expect_error($$insert into services (business_id, name) values ('$$ || (select v from ctx where k='biz1') || $$', 'Intruso')$$, 'row-level security');
select expect_error('select admin_list_businesses()', 'NO_AUTORIZADO');
select expect_error('select admin_list_owners()', 'NO_AUTORIZADO');
select expect_error($$select admin_activate_plan('$$ || (select v from ctx where k='biz1') || $$', 'ultra', 12)$$, 'NO_AUTORIZADO');
do $$ begin assert (select count(*) from platform_settings) = 0, 'el dueño no lee los ajustes directamente'; end $$;
do $$ begin assert get_payment_info()->>'card_number' = '9200 1111 2222 3333'; end $$;
do $$ begin assert get_payment_info()->>'community_url' = '', 'sin grupo: enlace vacío'; end $$;

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
do $$ declare o jsonb := admin_list_owners(); begin
  assert jsonb_array_length(o) = 2, 'dos dueños (el administrador no cuenta): ' || o;
  assert (select count(*) from jsonb_array_elements(o) x where x->>'email' = 'leo@test.com' and x->>'status' = 'vencido') = 1;
end $$;
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

-- ===== El dueño declara un pago; el administrador lo aprueba o lo rechaza =====
select expect_error($$select submit_payment_claim(1, 1500)$$, 'FALTA_COMPROBANTE');
-- La captura tiene que estar en la carpeta del propio negocio: ni un enlace de fuera ni la de otro
select expect_error($$select submit_payment_claim(1, 1500, null, 'https://x.test/captura1.jpg')$$, 'FALTA_COMPROBANTE');
select expect_error($$select submit_payment_claim(1, 1500, null, '00000000-0000-0000-0000-000000000001/pago-1.jpg')$$, 'FALTA_COMPROBANTE');
select expect_error($$select submit_payment_claim(1, 1500, null, '$$ || my_business_id() || $$/../otro/pago-1.jpg')$$, 'FALTA_COMPROBANTE');
-- Tampoco se puede escribir directo en la tabla (ej. una declaración ya "aprobada")
select expect_error($$insert into payment_claims (business_id, months, proof_path, status) values (my_business_id(), 1, my_business_id() || '/pago-1.jpg', 'aprobado')$$, 'row-level security');
select expect_error($$select submit_payment_claim(1, 1500, null, my_business_id() || '/pago-x.jpg', 'oro')$$, 'PLAN_INVALIDO');
select submit_payment_claim(1, 3000, 'Transferencia Transfermóvil', my_business_id() || '/pago-1.jpg', 'ultra') as claim1 \gset
insert into ctx values ('claim1', :'claim1');
reset role;
do $$ begin assert (select plan from payment_claims where id = (select v from ctx where k='claim1')::uuid) = 'ultra', 'la declaración guarda el plan elegido'; end $$;
set role authenticated;
do $$ begin
  assert (select count(*) from payment_claims where business_id = my_business_id()) = 1;
  assert (select status from payment_claims where business_id = my_business_id()) = 'pendiente';
end $$;
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
select admin_approve_payment_claim(:'claim1');
do $$ begin
  assert (select status from payment_claims where id = (select v from ctx where k='claim1')::uuid) = 'aprobado';
  assert (select count(*) from payments) = 3, 'el pago aprobado también queda en payments';
end $$;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select submit_payment_claim(1, 1500, null, my_business_id() || '/pago-2.jpg') as claim2 \gset
insert into ctx values ('claim2', :'claim2');
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
select admin_reject_payment_claim(:'claim2', 'No coincide el comprobante');
do $$ begin
  assert (select status from payment_claims where id = (select v from ctx where k='claim2')::uuid) = 'rechazado';
  assert (select count(*) from payments) = 3, 'el rechazado no suma pago';
end $$;
select expect_error($$select admin_approve_payment_claim('$$ || :'claim2' || $$')$$, 'NO_DISPONIBLE');
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ begin assert (select count(*) from payment_claims) = 0, 'dueño 2 no ve las declaraciones ajenas'; end $$;

-- ===== El administrador regala la app para siempre: su pago deja de contar en las estadísticas =====
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
select admin_activate_plan((select id from businesses where slug='spa-mar'), 'basico', 1, 500, 'Pago de prueba');
select (admin_stats()->'totals'->>'revenue')::numeric as revenue_antes \gset
insert into ctx values ('revenue_antes', :'revenue_antes');
do $$ begin assert (select comped from businesses where slug='spa-mar') = false; end $$;
select admin_grant_free((select id from businesses where slug='spa-mar'));
do $$ begin
  assert (select comped from businesses where slug='spa-mar'), 'queda marcado como cortesía';
  assert (select plan from businesses where slug='spa-mar') = 'ultra';
  assert (select paid_until from businesses where slug='spa-mar') > now() + interval '99 years', 'vencimiento muy lejano';
  assert business_effective_plan(
    (select plan from businesses where slug='spa-mar'),
    (select trial_ends_at from businesses where slug='spa-mar'),
    (select paid_until from businesses where slug='spa-mar')) = 'ultra', 'sigue con acceso completo';
end $$;
select (admin_stats()->'totals'->>'revenue')::numeric as revenue_despues \gset
insert into ctx values ('revenue_despues', :'revenue_despues');
do $$ begin
  assert (select v from ctx where k='revenue_despues')::numeric = (select v from ctx where k='revenue_antes')::numeric - 500, 'el pago de la cortesía deja de contar en los ingresos';
  assert (admin_stats()->'by_plan'->>'cortesia')::int = 1;
  assert not exists (
    select 1 from jsonb_array_elements(admin_stats()->'recent_payments') x where x->>'code' = (select code from businesses where slug='spa-mar')
  ), 'sus pagos ya no aparecen en los últimos pagos';
end $$;
-- Deshacer la cortesía (si se regaló por error): vuelve a su plan y a su fecha de pago de antes
select expect_error($$select admin_revoke_free('00000000-0000-0000-0000-000000000000')$$, 'NEGOCIO_NO_EXISTE');
select admin_revoke_free((select id from businesses where slug='spa-mar'));
do $$ begin
  assert (select comped from businesses where slug='spa-mar') = false, 'ya no es cortesía';
  assert (select plan from businesses where slug='spa-mar') = 'basico', 'vuelve a su plan de antes';
  assert (select paid_until from businesses where slug='spa-mar') between now() + interval '25 days' and now() + interval '35 days', 'vuelve a su fecha de pago de antes (1 mes)';
  assert (select comped_prev_plan is null and comped_prev_paid_until is null from businesses where slug='spa-mar');
end $$;
select expect_error($$select admin_revoke_free((select id from businesses where slug='spa-mar'))$$, 'NEGOCIO_NO_EXISTE');
-- Regalar dos veces no pisa el estado de antes
select admin_grant_free((select id from businesses where slug='spa-mar'));
select admin_grant_free((select id from businesses where slug='spa-mar'));
do $$ begin assert (select comped_prev_plan from businesses where slug='spa-mar') = 'basico', 'regalar dos veces no pisa lo guardado'; end $$;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select expect_error($$select admin_revoke_free((select id from businesses where slug='spa-mar'))$$, 'NO_AUTORIZADO');
-- El dueño no puede tocar lo guardado
update businesses set comped_prev_plan = 'ultra', comped_prev_paid_until = now() + interval '50 years' where owner_id = auth.uid();
reset role;
do $$ begin
  assert (select comped_prev_paid_until from businesses where slug='spa-mar') < now() + interval '1 year', 'el dueño no cambia lo guardado';
end $$;
set role authenticated;
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
-- Un pago real posterior le quita la cortesía (ya no sería gratis)
select admin_activate_plan((select id from businesses where slug='spa-mar'), 'ultra', 1, 3000, 'Pago real después de la cortesía (plan Equipo)');
do $$ begin assert (select comped from businesses where slug='spa-mar') = false, 'pagar de verdad quita la cortesía'; end $$;
select expect_error($$select admin_grant_free('00000000-0000-0000-0000-000000000000')$$, 'NEGOCIO_NO_EXISTE');
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select expect_error($$select admin_grant_free((select id from businesses where slug='spa-mar'))$$, 'NO_AUTORIZADO');
-- El dueño no puede marcarse a sí mismo como cortesía (se saldría de las estadísticas de cobros)
update businesses set comped = true where owner_id = auth.uid();
reset role;
do $$ begin assert (select comped from businesses where slug='spa-mar') = false, 'el dueño no puede ponerse cortesía'; end $$;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

reset role;
set role anon;
do $$ begin
  assert (get_public_business('barberia-leo')->>'accepting')::boolean;
  -- Aprobar la declaración de pago lo pasó al plan que eligió (Equipo = 'ultra')
  assert get_public_business('barberia-leo')->>'plan' = 'ultra';
  assert (get_public_prices()->>'plus')::int = 2100;
end $$;

-- ===== Fase 2: opiniones, historial del cliente, ficha de clientes, galería, estadísticas =====
reset role;
-- Dos citas ya pasadas de Juan (una de hace más de 60 días)
insert into appointments (business_id, token, starts_at, ends_at, customer_name, customer_phone, total, status) values
  ((select v from ctx where k='biz1')::uuid, 'pasada1', now() - interval '3 days', now() - interval '3 days' + interval '30 minutes', 'Juan Pérez', '5351112222', 500, 'confirmada'),
  ((select v from ctx where k='biz1')::uuid, 'vieja1', now() - interval '90 days', now() - interval '90 days' + interval '30 minutes', 'Juan Pérez', '5351112222', 500, 'completada');
set role anon;
do $$ declare j jsonb := get_booking('pasada1'); begin
  assert (j->>'can_review')::boolean, 'una cita pasada se puede valorar';
  assert jsonb_typeof(j->'review') = 'null', 'aún sin opinión';
  assert (j->'customer'->>'visits')::int = 2, 'visitas de Juan: ' || (j->'customer');
  assert (j->'customer'->>'bookings')::int = 3, 'reservas de Juan sin contar canceladas';
  assert not (get_booking('vieja1')->>'can_review')::boolean, 'más de 60 días: no se valora';
  assert not (get_booking((select v from ctx where k='t1'))->>'can_review')::boolean, 'cancelada: no se valora';
end $$;
select expect_error($$select submit_review('pasada1', 6)$$, 'VALORACION_INVALIDA');
select expect_error($$select submit_review('vieja1', 5)$$, 'OPINION_FUERA_DE_PLAZO');
select expect_error($$select submit_review('$$ || (select v from ctx where k='t1') || $$', 5)$$, 'OPINION_NO_PERMITIDA');
select expect_error($$select submit_review('no-existe', 5)$$, 'CITA_NO_EXISTE');
select submit_review('pasada1', 4, '  Muy buen corte  ');
select submit_review('pasada1', 5, 'Excelente');
do $$ declare j jsonb := get_public_business('barberia-leo'); begin
  assert (j->'rating'->>'count')::int = 1, 'una sola opinión por cita';
  assert (j->'rating'->>'avg')::numeric = 5;
  assert j->'reviews'->0->>'name' = 'Juan', 'solo el nombre de pila';
  assert j->'reviews'->0->>'comment' = 'Excelente';
  assert get_booking('pasada1')->'review'->>'rating' = '5';
end $$;
select expect_error('select * from reviews', 'permission denied');

-- El dueño solo puede ocultar y responder
reset role;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update reviews set rating = 1, comment = 'falso', hidden = true, reply = ' Gracias, Juan ';
do $$ begin
  assert (select rating from reviews) = 5, 'el dueño no cambia la nota';
  assert (select comment from reviews) = 'Excelente', 'ni el comentario';
  assert (select reply from reviews) = 'Gracias, Juan';
  assert (select hidden from reviews);
end $$;
do $$ declare c jsonb := owner_customers(); j jsonb; begin
  assert jsonb_array_length(c) = 2, 'dos clientes: ' || c;
  select x into j from jsonb_array_elements(c) x where x->>'phone' = '5351112222';
  assert j->>'name' = 'Juan Pérez';
  assert (j->>'visits')::int = 2 and (j->>'bookings')::int = 3 and (j->>'cancelled')::int = 1, 'ficha: ' || j;
  assert (j->>'spent')::numeric = 1000;
  assert j->>'next_at' is not null, 'tiene una cita próxima';
end $$;
insert into customer_notes (business_id, phone, note, tags) values (my_business_id(), '5351112222', 'Prefiere degradado', '{vip}');
do $$ declare j jsonb; begin
  select x into j from jsonb_array_elements(owner_customers()) x where x->>'phone' = '5351112222';
  assert j->>'note' = 'Prefiere degradado' and j->'tags'->>0 = 'vip';
end $$;
insert into gallery_photos (business_id, url, caption) values (my_business_id(), 'https://x.supabase.co/storage/v1/object/public/logos/a.jpg', 'Degradado');
select expect_error($$insert into gallery_photos (business_id, url) values (my_business_id(), 'javascript:alert(1)')$$, 'check');
do $$ begin
  assert (select moderation_status from gallery_photos where business_id = my_business_id()) = 'pendiente', 'empieza sin revisar';
  assert (select count(*) from gallery_photos where business_id = my_business_id()) = 1;
end $$;
update gallery_photos set moderation_status = 'aprobada' where business_id = my_business_id();
do $$ begin
  assert (select moderation_status from gallery_photos where business_id = my_business_id()) = 'pendiente', 'el dueño no puede autoaprobarse';
end $$;
-- Simula lo que hace moderate-photo (con la clave de servicio, no como "authenticated")
reset role;
update gallery_photos set moderation_status = 'aprobada' where business_id = (select id from businesses where slug = 'barberia-leo');
-- Respaldo de la moderación: solo se aprueba sola la que lleva más de un día sin poder revisarse
insert into gallery_photos (business_id, url, caption, moderation_status, created_at) values
  ((select id from businesses where slug = 'barberia-leo'), 'https://x.co/vieja.jpg', 'vieja', 'pendiente', now() - interval '25 hours'),
  ((select id from businesses where slug = 'barberia-leo'), 'https://x.co/nueva.jpg', 'nueva', 'pendiente', now() - interval '2 hours');
select _approve_unmoderated_photos();
do $$ begin
  assert (select moderation_status from gallery_photos where caption = 'vieja') = 'aprobada', 'la de más de un día se aprueba';
  assert (select moderation_status from gallery_photos where caption = 'nueva') = 'pendiente', 'la reciente sigue esperando revisión';
end $$;
delete from gallery_photos where caption in ('vieja', 'nueva');
set role authenticated;

-- ===== Bonos =====
insert into packages (business_id, name, sessions, price) values (my_business_id(), '5 cortes', 5, 2000);
insert into ctx select 'pkg1', id::text from packages where business_id = my_business_id() limit 1;
insert into customer_packages (business_id, package_id, customer_phone, package_name, sessions_total, sessions_left)
  values (my_business_id(), (select v from ctx where k='pkg1')::uuid, '5351112222', '5 cortes', 5, 5);
update customer_packages set sessions_left = sessions_left - 1
  where business_id = my_business_id() and customer_phone = '5351112222';
do $$ begin
  assert (select sessions_left from customer_packages where customer_phone = '5351112222') = 4, 'se descontó una sesión del bono';
end $$;
select expect_error($$insert into customer_packages (business_id, customer_phone, package_name, sessions_total, sessions_left) values (my_business_id(), '5351112222', 'x', 3, 5)$$, 'check');
-- Un solo plan: cualquier negocio pagando tiene también las estadísticas
do $$ begin assert owner_stats(current_date - 30, current_date) is not null; end $$;
select expect_error('select admin_stats()', 'NO_AUTORIZADO');

set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ begin
  assert (select count(*) from reviews) = 0, 'dueño 2 no ve opiniones ajenas';
  assert (select count(*) from customer_notes) = 0;
  assert (select count(*) from gallery_photos) = 0;
  assert (select count(*) from packages) = 0, 'ni los bonos ajenos';
  assert (select count(*) from customer_packages) = 0;
end $$;
select expect_error($$insert into gallery_photos (business_id, url) values ('$$ || (select v from ctx where k='biz1') || $$', 'https://x.com/a.jpg')$$, 'row-level security');

reset role;
set role anon;
do $$ declare j jsonb := get_public_business('barberia-leo'); begin
  assert (j->'rating'->>'count')::int = 0, 'la opinión oculta no cuenta';
  assert jsonb_array_length(j->'reviews') = 0;
  assert jsonb_array_length(j->'gallery') = 1;
end $$;

-- Estadísticas del administrador; con Ultra el dueño ve las suyas
reset role;
set role authenticated;
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
do $$ declare s jsonb := admin_stats(); begin
  assert (s->'totals'->>'businesses')::int = 2;
  -- Leo pagó Equipo (declaración aprobada) y Spa Mar también, tras quitarle la cortesía
  assert (s->'by_plan'->>'ultra')::int = 2, 'por plan: ' || (s->'by_plan')::text;
  assert (s->'by_plan'->>'basico')::int = 0;
  assert (s->'by_plan'->>'prueba')::int = 0;
  assert jsonb_array_length(s->'months') = 12;
  assert (s->'totals'->>'converted')::int = 1, 'conversión: ' || (s->'totals');
  assert jsonb_array_length(s->'recent_payments') = 5, 'Leo 3 pagos y Spa Mar 2';
end $$;
select admin_activate_plan((select v from ctx where k='biz1')::uuid, 'ultra', 1);
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$ declare s jsonb := owner_stats(current_date - 100, current_date + 10); begin
  assert (s->'summary'->>'done')::int = 2, 'resumen: ' || (s->'summary');
  assert (s->'summary'->>'revenue')::numeric = 1000;
  assert (s->'summary'->>'cancelled')::int = 1;
  assert (s->'summary'->>'bookings')::int = 4;
  assert jsonb_array_length(s->'by_day') = 111;
  assert jsonb_array_length(s->'by_weekday') = 7;
  assert s->'top_services'->0->>'name' = 'Corte', 'servicio más pedido';
end $$;
select expect_error($$select owner_stats(current_date, current_date - 1)$$, 'RANGO_INVALIDO');

-- ===== Fase 3: cupones y lista de espera (el negocio 1 tiene Ultra) =====
insert into discounts (business_id, code, percent, uses) values (my_business_id(), ' promo10 ', 10, 99);
insert into discounts (business_id, code, amount, max_uses) values (my_business_id(), 'MENOS200', 200, 1);
insert into discounts (business_id, code, percent, valid_until) values (my_business_id(), 'VIEJO', 50, current_date - 1);
do $$ begin assert (select uses from discounts where code = 'PROMO10') = 0, 'código en mayúsculas y usos a 0'; end $$;
select expect_error($$insert into discounts (business_id, code, percent, amount) values (my_business_id(), 'AMBOS', 10, 10)$$, 'check');
update discounts set uses = 50 where code = 'PROMO10';
do $$ begin assert (select uses from discounts where code = 'PROMO10') = 0, 'el dueño no toca los usos'; end $$;
reset role;
set role anon;
do $$ declare j jsonb := check_discount('barberia-leo', 'promo10', array[(select v from ctx where k='corte')::uuid]); begin
  assert (j->>'discount')::numeric = 50 and (j->>'total')::numeric = 450, 'cupón 10%: ' || j;
end $$;
select expect_error($$select check_discount('barberia-leo', 'NOEXISTE', '{}')$$, 'CUPON_INVALIDO');
select expect_error($$select check_discount('barberia-leo', 'VIEJO', '{}')$$, 'CUPON_VENCIDO');
select expect_error('select * from discounts', 'permission denied');
insert into ctx select 'tc', create_booking('barberia-leo', array[(select v from ctx where k='corte')::uuid], (select v from ctx where k='day')::date, '10:00', 'Ana Cupón', '5355550000', null, 'menos200');
do $$ declare j jsonb := get_booking((select v from ctx where k='tc')); begin
  assert (j->>'total')::numeric = 300 and (j->>'discount')::numeric = 200 and j->>'discount_code' = 'MENOS200', 'reserva con cupón: ' || j;
end $$;
select expect_error($$select create_booking('barberia-leo', array['$$ || (select v from ctx where k='corte') || $$'::uuid], '$$ || (select v from ctx where k='day') || $$', '11:00', 'Luis', '5355550001', null, 'MENOS200')$$, 'CUPON_AGOTADO');
do $$ begin assert (select available from get_available_slots('barberia-leo', (select v from ctx where k='day')::date, 30) where slot = '11:00'), 'un cupón rechazado no ocupa el turno'; end $$;

select join_waitlist('barberia-leo', (select v from ctx where k='day')::date, 'Pepe Espera', '+53 5 999 0000', 'cualquier hora');
select join_waitlist('barberia-leo', (select v from ctx where k='day')::date, 'Pepe Espera', '5359990000');
select expect_error($$select join_waitlist('barberia-leo', '2020-01-01', 'Pepe', '5359990000')$$, 'TURNO_INVALIDO');
select expect_error($$select join_waitlist('barberia-leo', current_date + 1, 'Pepe', '123')$$, 'TELEFONO_INVALIDO');
select expect_error('select * from waitlist', 'permission denied');
reset role;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$ begin
  assert (select count(*) from waitlist) = 1, 'apuntarse dos veces el mismo día no duplica';
  assert (select uses from discounts where code = 'MENOS200') = 1, 'el cupón se gastó una vez';
end $$;
update waitlist set status = 'avisado';
do $$ begin assert (select status from waitlist) = 'avisado'; end $$;
update appointments set reminded_at = now() where token = (select v from ctx where k='tc');
do $$ begin assert (select reminded_at from appointments where token = (select v from ctx where k='tc')) is not null, 'recordatorio marcado'; end $$;

-- ===== Políticas: límite de cambios por cita y de citas pendientes (configurables) =====
update businesses set max_reschedules = 1, reschedule_notice_hours = 1 where id = my_business_id();
insert into ctx select 'tl', create_booking('barberia-leo', array[(select v from ctx where k='corte')::uuid],
  (select v from ctx where k='day')::date, '09:00', 'Lili Límite', '5355557777');
select reschedule_booking((select v from ctx where k='tl'), (select v from ctx where k='day')::date, '11:00');
select expect_error($$select reschedule_booking('$$ || (select v from ctx where k='tl') || $$', '$$ || (select v from ctx where k='day') || $$', '09:00')$$, 'LIMITE_CAMBIOS');
-- El nombre se puede seguir editando aunque ya no queden cambios de hora
select edit_booking((select v from ctx where k='tl'),
  array(select (x->>'id')::uuid from jsonb_array_elements(get_booking((select v from ctx where k='tl'))->'services') x),
  (select v from ctx where k='day')::date, '11:00', 'Lili L.', null);
do $$ begin assert (get_booking((select v from ctx where k='tl'))->>'customer_name') = 'Lili L.', 'nombre editado pese al límite de cambios'; end $$;
-- Pero si intenta cambiar también la hora, choca con el límite
select expect_error($$select edit_booking('$$ || (select v from ctx where k='tl') || $$',
  array(select (x->>'id')::uuid from jsonb_array_elements(get_booking('$$ || (select v from ctx where k='tl') || $$')->'services') x),
  '$$ || (select v from ctx where k='day') || $$', '14:30', 'Lili L.', null)$$, 'LIMITE_CAMBIOS');
select cancel_booking((select v from ctx where k='tl'));

-- "Citas pendientes por clienta" también configurable (antes era un 2 fijo). Se usan las 09:00
-- porque las 10:00 ya las ocupa "Ana Cupón" (prueba de cupones de más arriba).
update businesses set max_pending_bookings = 1 where id = my_business_id();
insert into ctx select 'tp1', create_booking('barberia-leo', array[(select v from ctx where k='corte')::uuid],
  (select v from ctx where k='day')::date, '09:00', 'Pato Prueba', '5355558888');
select expect_error($$select create_booking('barberia-leo', array['$$ || (select v from ctx where k='corte') || $$'::uuid], '$$ || (select v from ctx where k='day') || $$', '14:00', 'Pato Prueba', '5355558888')$$, 'LIMITE_CITAS');
select cancel_booking((select v from ctx where k='tp1'));
-- "Sin límite" (null): el mismo teléfono puede tener varias citas pendientes a la vez
update businesses set max_pending_bookings = null where id = my_business_id();
insert into ctx select 'tp2', create_booking('barberia-leo', array[(select v from ctx where k='corte')::uuid],
  (select v from ctx where k='day')::date, '09:00', 'Rita Repite', '5355559999');
insert into ctx select 'tp3', create_booking('barberia-leo', array[(select v from ctx where k='corte')::uuid],
  (select v from ctx where k='day')::date, '11:00', 'Rita Repite', '5355559999');
do $$ begin
  assert (select count(*) from appointments where customer_phone = '5355559999' and status <> 'cancelada') = 2,
    'sin límite: 2 citas pendientes con el mismo teléfono';
end $$;
select cancel_booking((select v from ctx where k='tp2'));
select cancel_booking((select v from ctx where k='tp3'));

-- "Citas creadas por día" es un límite distinto (y también configurable), con su propio error
update businesses set max_daily_bookings = 2, max_pending_bookings = null where id = my_business_id();
insert into ctx select 'td1', create_booking('barberia-leo', array[(select v from ctx where k='corte')::uuid],
  (select v from ctx where k='day')::date, '09:00', 'Dani Diario', '5355556666');
select cancel_booking((select v from ctx where k='td1'));
insert into ctx select 'td2', create_booking('barberia-leo', array[(select v from ctx where k='corte')::uuid],
  (select v from ctx where k='day')::date, '09:00', 'Dani Diario', '5355556666');
select expect_error($$select create_booking('barberia-leo', array['$$ || (select v from ctx where k='corte') || $$'::uuid], '$$ || (select v from ctx where k='day') || $$', '11:00', 'Dani Diario', '5355556666')$$, 'LIMITE_DIARIO');
select cancel_booking((select v from ctx where k='td2'));
update businesses set max_daily_bookings = null where id = my_business_id();
-- "Sin límite": tercera reserva del mismo teléfono en el día ya no choca
insert into ctx select 'td3', create_booking('barberia-leo', array[(select v from ctx where k='corte')::uuid],
  (select v from ctx where k='day')::date, '09:00', 'Dani Diario', '5355556666');
select cancel_booking((select v from ctx where k='td3'));

-- ===== Bloquear horas sueltas (Horario) =====
insert into closed_slots (business_id, day, start_time, end_time, reason)
  values (my_business_id(), (select v from ctx where k='day')::date, '10:00', '11:00', 'Almuerzo');
select expect_error($$select create_booking('barberia-leo', array['$$ || (select v from ctx where k='corte') || $$'::uuid], '$$ || (select v from ctx where k='day') || $$', '10:00', 'Hora Bloqueada', '5355557777')$$, 'TURNO_INVALIDO');
do $$ declare d date := (select v from ctx where k='day')::date; begin
  assert not (select available from get_available_slots('barberia-leo', d, 30) where slot = '10:00'), '10:00 bloqueada por almuerzo';
  assert (select available from get_available_slots('barberia-leo', d, 30) where slot = '11:00'), '11:00 sigue libre';
end $$;
delete from closed_slots where business_id = my_business_id();

update businesses set max_reschedules = null, reschedule_notice_hours = 6, max_pending_bookings = 2, max_daily_bookings = 3 where id = my_business_id();

set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ begin
  assert (select count(*) from waitlist) = 0, 'dueño 2 no ve la lista de espera ajena';
  assert (select count(*) from discounts) = 0, 'ni los cupones ajenos';
end $$;

-- ===== Varios profesionales (el dueño 2 está en prueba = Ultra) =====
insert into schedule_days (business_id, weekday, is_open, slots)
  select my_business_id(), d, true, '{10:00,11:00}' from generate_series(0, 6) d;
insert into staff (business_id, name, position) values (my_business_id(), 'Ana', 0), (my_business_id(), 'Bea', 1);
select expect_error($$insert into staff (business_id, name) values ('$$ || (select v from ctx where k='biz1') || $$', 'Intrusa')$$, 'row-level security');
reset role;
set role anon;
insert into ctx select 'masaje', get_public_business('spa-mar')->'services'->0->>'id';
insert into ctx select 'ana', x->>'id' from jsonb_array_elements(get_public_business('spa-mar')->'staff') x where x->>'name' = 'Ana';
do $$ begin assert jsonb_array_length(get_public_business('spa-mar')->'staff') = 2, 'dos profesionales públicos'; end $$;
-- Dos clientes a la misma hora: cada uno con un profesional
insert into ctx select 's1', create_booking('spa-mar', array[(select v from ctx where k='masaje')::uuid], (select v from ctx where k='day')::date, '10:00', 'Cliente Uno', '5350000001');
insert into ctx select 's2', create_booking('spa-mar', array[(select v from ctx where k='masaje')::uuid], (select v from ctx where k='day')::date, '10:00', 'Cliente Dos', '5350000002');
do $$ begin
  assert get_booking((select v from ctx where k='s1'))->>'staff_name' is not null;
  assert get_booking((select v from ctx where k='s1'))->>'staff_name' <> get_booking((select v from ctx where k='s2'))->>'staff_name', 'uno con cada profesional';
  assert not (select available from get_available_slots('spa-mar', (select v from ctx where k='day')::date, 60) where slot = '10:00'), '10:00 ya sin nadie libre';
end $$;
select expect_error($$select create_booking('spa-mar', array['$$ || (select v from ctx where k='masaje') || $$'::uuid], '$$ || (select v from ctx where k='day') || $$', '10:00', 'Cliente Tres', '5350000003')$$, 'TURNO_OCUPADO');
-- El cliente elige profesional
insert into ctx select 's3', create_booking('spa-mar', array[(select v from ctx where k='masaje')::uuid], (select v from ctx where k='day')::date, '11:00', 'Cliente Tres', '5350000003', null, null, (select v from ctx where k='ana')::uuid);
do $$ declare d date := (select v from ctx where k='day')::date; ana uuid := (select v from ctx where k='ana')::uuid; begin
  assert get_booking((select v from ctx where k='s3'))->>'staff_name' = 'Ana', 'eligió a Ana';
  assert not (select available from get_available_slots('spa-mar', d, 60, ana) where slot = '11:00'), 'Ana ocupada a las 11';
  assert (select available from get_available_slots('spa-mar', d, 60) where slot = '11:00'), 'pero Bea sigue libre a las 11';
end $$;
select expect_error($$select create_booking('spa-mar', array['$$ || (select v from ctx where k='masaje') || $$'::uuid], '$$ || (select v from ctx where k='day') || $$', '11:00', 'Cliente Cuatro', '5350000004', null, null, '$$ || (select v from ctx where k='ana') || $$')$$, 'TURNO_OCUPADO');

-- ===== Horario propio de un profesional (Equipo) =====
insert into ctx select 'day2', ((select v from ctx where k='day')::date + 3)::text;
do $$ declare d2 date := (select v from ctx where k='day2')::date; ana uuid := (select v from ctx where k='ana')::uuid; begin
  assert (select available from get_available_slots('spa-mar', d2, 60, ana) where slot = '10:00'), 'Ana libre antes de cerrar su horario propio';
end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
insert into staff_schedule_days (staff_id, weekday, is_open, slots)
  select (select v from ctx where k='ana')::uuid, d, false, '{}' from generate_series(0, 6) d;
reset role;
set role anon;
do $$ declare d2 date := (select v from ctx where k='day2')::date; ana uuid := (select v from ctx where k='ana')::uuid; begin
  assert not (select available from get_available_slots('spa-mar', d2, 60, ana) where slot = '10:00'), 'Ana ya no trabaja (horario propio cerrado)';
  assert (select available from get_available_slots('spa-mar', d2, 60) where slot = '10:00'), 'el hueco sigue libre para Bea (sin horario propio: usa el del negocio)';
end $$;
select expect_error($$select create_booking('spa-mar', array['$$ || (select v from ctx where k='masaje') || $$'::uuid], '$$ || (select v from ctx where k='day2') || $$', '10:00', 'Cliente Cinco', '5350000005', null, null, '$$ || (select v from ctx where k='ana') || $$')$$, 'TURNO_INVALIDO');

-- ===== Enlace privado de un profesional (cambia sus servicios y su horario) =====
reset role;
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
insert into ctx select 'tok_ana', owner_staff_link((select v from ctx where k='ana')::uuid);
insert into ctx select 'bea', id::text from staff where name = 'Bea';
do $$ begin
  assert char_length((select v from ctx where k='tok_ana')) >= 32, 'enlace largo';
  assert owner_staff_link((select v from ctx where k='ana')::uuid) = (select v from ctx where k='tok_ana'), 'ver no cambia el enlace';
end $$;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select expect_error($$select owner_staff_link('$$ || (select v from ctx where k='ana') || $$')$$, 'PROFESIONAL_INVALIDO');
reset role;
set role anon;
select expect_error($$select owner_staff_link('$$ || (select v from ctx where k='ana') || $$')$$, 'permission denied');
select expect_error($$select staff_portal('no-vale')$$, 'ENLACE_CADUCADO');
select expect_error($$select staff_portal(repeat('a', 64))$$, 'ENLACE_CADUCADO');
do $$ declare p jsonb := staff_portal((select v from ctx where k='tok_ana')); begin
  assert p->'staff'->>'name' = 'Ana', 'su nombre: ' || p::text;
  assert (p->>'all_services')::boolean, 'sin servicios elegidos hace todos';
  assert p->'business'->>'name' = 'Spa Mar' and not (p->'business' ? 'owner_id') and not (p->'staff' ? 'edit_token'), 'sin datos privados';
  assert jsonb_array_length(p->'bookable') >= 1, 'haciendo todo, puede apuntar cualquier servicio: ' || p::text;
end $$;
-- Haciendo todos los servicios, no tiene ninguno propio que cambiar
select expect_error($$select staff_portal_save_service('$$ || (select v from ctx where k='tok_ana') || $$', null, 'Uñas', 100, 30)$$, 'SIN_SERVICIOS_PROPIOS');
-- El dueño les asigna el masaje a las dos (compartido)
reset role;
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
insert into staff_services values ((select v from ctx where k='ana')::uuid, (select v from ctx where k='masaje')::uuid),
                                  ((select v from ctx where k='bea')::uuid, (select v from ctx where k='masaje')::uuid);
reset role;
set role anon;
insert into ctx select 'pest', staff_portal_save_service((select v from ctx where k='tok_ana'), null, ' Pestañas ', 2000, 90)::text;
do $$ declare p jsonb := staff_portal((select v from ctx where k='tok_ana')); begin
  assert not (p->>'all_services')::boolean, 'ya tiene servicios propios';
  assert jsonb_array_length(p->'services') = 2, 'masaje y pestañas: ' || p::text;
  assert (select (x->>'shared')::boolean from jsonb_array_elements(p->'services') x where x->>'id' = (select v from ctx where k='masaje')), 'el masaje es compartido';
  assert not (select (x->>'shared')::boolean from jsonb_array_elements(p->'services') x where x->>'id' = (select v from ctx where k='pest')), 'pestañas es suyo';
  assert (select x->>'name' from jsonb_array_elements(p->'services') x where x->>'id' = (select v from ctx where k='pest')) = 'Pestañas', 'nombre sin espacios';
end $$;
select staff_portal_save_service((select v from ctx where k='tok_ana'), (select v from ctx where k='pest')::uuid, 'Pestañas pelo a pelo', 2500, 120, 'Dura 2 horas', true);
select expect_error($$select staff_portal_save_service('$$ || (select v from ctx where k='tok_ana') || $$', '$$ || (select v from ctx where k='masaje') || $$', 'Mío', 1, 30)$$, 'SERVICIO_COMPARTIDO');
select expect_error($$select staff_portal_save_service('$$ || (select v from ctx where k='tok_ana') || $$', null, '', 100, 30)$$, 'DATOS_INVALIDOS');
select expect_error($$select staff_portal_save_service('$$ || (select v from ctx where k='tok_ana') || $$', null, 'X', -1, 30)$$, 'DATOS_INVALIDOS');
select expect_error($$select staff_portal_save_service('$$ || (select v from ctx where k='tok_ana') || $$', null, 'X', 100, 2)$$, 'DATOS_INVALIDOS');
-- Su horario: se ordena, y lo raro se rechaza
select staff_portal_save_schedule((select v from ctx where k='tok_ana'), '[{"weekday":1,"is_open":true,"slots":["10:00","09:00"]},{"weekday":0,"is_open":false,"slots":[]}]');
do $$ declare p jsonb := staff_portal((select v from ctx where k='tok_ana')); begin
  assert jsonb_array_length(p->'schedule') = 2, 'dos días: ' || p::text;
  assert p->'schedule'->1->'slots'->>0 = '09:00', 'horas ordenadas: ' || p::text;
  assert jsonb_array_length(p->'business_schedule') = 7, 've el horario del negocio';
end $$;
select expect_error($$select staff_portal_save_schedule('$$ || (select v from ctx where k='tok_ana') || $$', '[{"weekday":9,"is_open":true,"slots":[]}]')$$, 'DATOS_INVALIDOS');
select expect_error($$select staff_portal_save_schedule('$$ || (select v from ctx where k='tok_ana') || $$', '[{"weekday":1,"is_open":true,"slots":["25:99"]}]')$$, 'DATOS_INVALIDOS');
select expect_error($$select staff_portal_save_schedule('$$ || (select v from ctx where k='tok_ana') || $$', '{"no":"lista"}')$$, 'DATOS_INVALIDOS');
reset role;
do $$ begin
  assert (select price from services where id = (select v from ctx where k='pest')::uuid) = 2500, 'precio cambiado';
  assert (select business_id from services where id = (select v from ctx where k='pest')::uuid) = (select business_id from staff where name = 'Ana'), 'en su negocio';
  assert (select count(*) from staff_schedule_days where staff_id = (select v from ctx where k='ana')::uuid) = 2, 'lo raro no cambió nada';
end $$;
-- El dueño crea uno nuevo: el anterior deja de valer; y al anularlo, ninguno
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
insert into ctx select 'tok_ana2', owner_staff_link((select v from ctx where k='ana')::uuid, 'nuevo');
reset role;
set role anon;
select expect_error($$select staff_portal('$$ || (select v from ctx where k='tok_ana') || $$')$$, 'ENLACE_CADUCADO');
do $$ begin assert staff_portal((select v from ctx where k='tok_ana2'))->'staff'->>'name' = 'Ana', 'el nuevo vale'; end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ begin assert owner_staff_link((select v from ctx where k='ana')::uuid, 'anular') is null; end $$;
reset role;
set role anon;
select expect_error($$select staff_portal('$$ || (select v from ctx where k='tok_ana2') || $$')$$, 'ENLACE_CADUCADO');
-- Una profesional nueva con servicios propios: empieza sin ninguno y los crea ella
reset role;
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
insert into staff (business_id, name, position, own_services) values (my_business_id(), 'Cami', 9, true);
insert into ctx select 'cami', id::text from staff where name = 'Cami';
insert into ctx select 'tok_cami', owner_staff_link((select v from ctx where k='cami')::uuid);
reset role;
set role anon;
do $$ declare c jsonb := (select x from jsonb_array_elements(get_public_business('spa-mar')->'staff') x where x->>'name' = 'Cami'); begin
  assert not (c->>'all_services')::boolean and jsonb_array_length(c->'service_ids') = 0, 'Cami no hace nada todavía: ' || c::text;
  assert not (staff_portal((select v from ctx where k='tok_cami'))->>'all_services')::boolean, 'tiene servicios propios';
  assert not exists (select 1 from get_available_slots('spa-mar', (select v from ctx where k='day2')::date, 60, (select v from ctx where k='cami')::uuid, null, array[(select v from ctx where k='masaje')::uuid]) where available),
    'no se puede reservar masaje con Cami';
end $$;
insert into ctx select 'cejas', staff_portal_save_service((select v from ctx where k='tok_cami'), null, 'Cejas', 800, 30)::text;
select staff_portal_save_profile((select v from ctx where k='tok_cami'), '  Cejas y pestañas ');
select expect_error($$select staff_portal_save_profile('$$ || (select v from ctx where k='tok_cami') || $$', repeat('x', 41))$$, 'DATOS_INVALIDOS');
do $$ begin
  assert staff_portal((select v from ctx where k='tok_cami'))->'staff'->>'specialty' = 'Cejas y pestañas', 'especialidad guardada';
  assert (select x->>'specialty' from jsonb_array_elements(get_public_business('spa-mar')->'staff') x where x->>'name' = 'Cami') = 'Cejas y pestañas', 'y se ve en la página';
end $$;
do $$ begin
  assert exists (select 1 from get_available_slots('spa-mar', (select v from ctx where k='day2')::date, 30, (select v from ctx where k='cami')::uuid, null, array[(select v from ctx where k='cejas')::uuid]) where available),
    'sus cejas sí se pueden reservar con ella';
  assert (select x->'service_ids'->>0 from jsonb_array_elements(get_public_business('spa-mar')->'staff') x where x->>'name' = 'Cami') = (select v from ctx where k='cejas'), 'y salen en su lista';
end $$;
-- Todo el equipo con servicios propios: el masaje no es de nadie del equipo, es del dueño, y se
-- reserva en la agenda del negocio (antes se quedaba sin horas)
reset role;
delete from staff_services where staff_id in ((select v from ctx where k='ana')::uuid, (select v from ctx where k='bea')::uuid);
update staff set own_services = true where name in ('Ana', 'Bea');
set role anon;
do $$ declare d2 date := (select v from ctx where k='day2')::date; m uuid := (select v from ctx where k='masaje')::uuid; c uuid := (select v from ctx where k='cejas')::uuid; begin
  assert exists (select 1 from get_available_slots('spa-mar', d2, 60, null, null, array[m]) where available), 'el masaje del dueño se puede reservar';
  assert not exists (select 1 from get_available_slots('spa-mar', d2, 60, null, null, array[m, c]) where available), 'masaje (dueño) + cejas (Cami) juntos no: nadie hace los dos';
end $$;
insert into ctx select 'r_dueno', create_booking('spa-mar', array[(select v from ctx where k='masaje')::uuid], (select v from ctx where k='day2')::date, '10:00', 'Cliente Dueño', '5350000071');
reset role;
do $$ begin
  assert (select staff_id from appointments where token = (select v from ctx where k='r_dueno')) is null, 'va a la agenda del dueño';
end $$;
set role anon;
-- Al cambiar la fecha sigue siendo del dueño (antes podía pasar a cualquier profesional)
select reschedule_booking((select v from ctx where k='r_dueno'), (select v from ctx where k='day2')::date, '11:00');
reset role;
do $$ begin
  assert (select staff_id from appointments where token = (select v from ctx where k='r_dueno')) is null, 'sigue con el dueño tras moverla';
end $$;
update appointments set status = 'cancelada' where token = (select v from ctx where k='r_dueno');
update staff set own_services = false where name in ('Ana', 'Bea');

-- El profesional de una cita tiene que ser del mismo negocio
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select expect_error($$update appointments set staff_id = gen_random_uuid() where token = '$$ || (select v from ctx where k='s1') || $$'$$, 'PROFESIONAL_INVALIDO');

-- Su panel: apunta una cita con sus cejas, la ve en su agenda, la confirma y ve sus números
set role anon;
select expect_error($$select staff_portal_create_appointment('$$ || (select v from ctx where k='tok_cami') || $$', array['$$ || (select v from ctx where k='masaje') || $$'::uuid], current_date + 3, '15:00', 'Clienta Uno', '5350000091')$$, 'SERVICIOS_INVALIDOS');
insert into ctx select 'cita_cami', staff_portal_create_appointment((select v from ctx where k='tok_cami'), array[(select v from ctx where k='cejas')::uuid], current_date + 3, '15:00', 'Clienta Cejas', '5350000092')::text;
select expect_error($$select staff_portal_create_appointment('$$ || (select v from ctx where k='tok_cami') || $$', array['$$ || (select v from ctx where k='cejas') || $$'::uuid], current_date + 3, '15:10', 'Otra', '5350000093')$$, 'TURNO_OCUPADO');
do $$ declare ag jsonb := staff_portal_agenda((select v from ctx where k='tok_cami'), current_date, current_date + 7); begin
  assert jsonb_array_length(ag) = 1, 'su agenda: ' || ag::text;
  assert ag->0->>'customer_name' = 'Clienta Cejas' and ag->0->'services'->>0 = 'Cejas' and ag->0->>'status' = 'confirmada';
end $$;
select expect_error($$select staff_portal_agenda('$$ || (select v from ctx where k='tok_cami') || $$', current_date, current_date + 100)$$, 'RANGO_INVALIDO');
select staff_portal_set_status((select v from ctx where k='tok_cami'), (select v from ctx where k='cita_cami')::uuid, 'no_asistio');
select expect_error($$select staff_portal_set_status('$$ || (select v from ctx where k='tok_cami') || $$', '$$ || (select v from ctx where k='cita_cami') || $$', 'pendiente')$$, 'DATOS_INVALIDOS');
-- Las citas de otra persona, no
reset role;
insert into ctx select 'cita_otra', id::text from appointments where staff_id is distinct from (select v from ctx where k='cami')::uuid and business_id = (select business_id from staff where name = 'Cami') limit 1;
set role anon;
select expect_error($$select staff_portal_set_status('$$ || (select v from ctx where k='tok_cami') || $$', '$$ || (select v from ctx where k='cita_otra') || $$', 'cancelada')$$, 'CITA_NO_EXISTE');
do $$ declare s jsonb := staff_portal_stats((select v from ctx where k='tok_cami'), 30); begin
  assert s ? 'appointments' and s ? 'revenue' and s ? 'customers' and s ? 'top_services' and s ? 'upcoming', 'sus números: ' || s::text;
  assert (s->>'upcoming')::int = 0, 'la de las cejas ya no está pendiente: ' || s::text;
end $$;
reset role;
do $$ begin assert (select status from appointments where id = (select v from ctx where k='cita_cami')::uuid) = 'no_asistio'; end $$;
delete from appointments where id = (select v from ctx where k='cita_cami')::uuid;
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

-- Si Cami deja el equipo, sus servicios se ocultan (si no, saldrían como del dueño); si vuelve, se ven
update staff set active = false where id = (select v from ctx where k='cami')::uuid;
reset role;
do $$ begin
  assert not (select active from services where id = (select v from ctx where k='cejas')::uuid), 'cejas oculto al desactivar a Cami';
  assert (select hidden_with_staff from services where id = (select v from ctx where k='cejas')::uuid) = (select v from ctx where k='cami')::uuid;
  assert (select active from services where id = (select v from ctx where k='masaje')::uuid), 'el masaje compartido no se toca';
end $$;
set role authenticated;
update staff set active = true where id = (select v from ctx where k='cami')::uuid;
reset role;
do $$ begin assert (select active from services where id = (select v from ctx where k='cejas')::uuid), 'cejas visible al volver'; end $$;
delete from staff where id = (select v from ctx where k='cami')::uuid;
do $$ begin assert not (select active from services where id = (select v from ctx where k='cejas')::uuid), 'cejas oculto al quitar a Cami'; end $$;
delete from services where id = (select v from ctx where k='cejas')::uuid;

-- El dueño también atiende: su nombre y su especialidad salen en la página
reset role;
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
update businesses set owner_name = 'Mar', owner_specialty = 'Masajes' where id = my_business_id();
reset role;
set role anon;
do $$ begin
  assert get_public_business('spa-mar')->>'owner_name' = 'Mar' and get_public_business('spa-mar')->>'owner_specialty' = 'Masajes', 'el dueño en la página';
end $$;

-- Se deja todo como estaba para las pruebas siguientes
reset role;
delete from staff_services where staff_id in ((select v from ctx where k='ana')::uuid, (select v from ctx where k='bea')::uuid);
delete from services where id = (select v from ctx where k='pest')::uuid;
delete from staff_schedule_days where staff_id = (select v from ctx where k='ana')::uuid;
insert into staff_schedule_days (staff_id, weekday, is_open, slots)
  select (select v from ctx where k='ana')::uuid, d, false, '{}' from generate_series(0, 6) d;
set role anon;

-- ===== Notificaciones push: guardar y quitar suscripciones =====
select save_customer_push_subscription((select v from ctx where k='s1'), 'https://fcm.example/ep1', 'p256dh-test', 'auth-test');
select expect_error($$select save_customer_push_subscription('no-existe', 'e', 'p', 'a')$$, 'CITA_NO_EXISTE');
reset role;  -- las suscripciones solo se leen con la clave de servicio, no como anon
do $$ begin assert (select count(*) from push_subscriptions where kind = 'customer') = 1, 'suscripción de cliente guardada'; end $$;
set role anon;
select delete_push_subscription('https://fcm.example/ep1');
reset role;  -- las suscripciones solo se leen con la clave de servicio, no como anon
do $$ begin assert (select count(*) from push_subscriptions where kind = 'customer') = 0, 'suscripción de cliente borrada'; end $$;
set role anon;
reset role;
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select save_owner_push_subscription('https://fcm.example/ep-owner', 'p256dh-o', 'auth-o');
reset role;  -- las suscripciones solo se leen con la clave de servicio, no como authenticated
do $$ begin assert (select count(*) from push_subscriptions where kind = 'owner') = 1, 'suscripción del dueño guardada'; end $$;
set role authenticated;
select expect_error($$select save_admin_push_subscription('https://fcm.example/ep-admin', 'p', 'a')$$, 'NO_AUTORIZADO');
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
select save_admin_push_subscription('https://fcm.example/ep-admin', 'p256dh-a', 'auth-a');
reset role;  -- las suscripciones solo se leen con la clave de servicio, no como authenticated
do $$ begin assert (select count(*) from admin_push_subscriptions) = 1, 'suscripción del administrador guardada'; end $$;
set role authenticated;
select delete_push_subscription('https://fcm.example/ep-admin');
reset role;  -- las suscripciones solo se leen con la clave de servicio, no como authenticated
do $$ begin assert (select count(*) from admin_push_subscriptions) = 0, 'suscripción del administrador borrada'; end $$;
set role authenticated;
select admin_deactivate_business((select v from ctx where k='biz1')::uuid);
reset role;
set role anon;
do $$ begin assert not (get_public_business('barberia-leo')->>'accepting')::boolean, 'desactivado'; end $$;
-- ===== Medición de visitas (anónima) =====
reset role;
set role anon;
-- Un visitante de Instagram en el móvil: portada, crear y dos pasos del asistente
select track_event('aaaaaaaa-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-0000000000b1', 'visita', 'portada', null, null, 'Instagram', 'movil');
select track_event('aaaaaaaa-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-0000000000b1', 'visita', 'crear');
select track_event('aaaaaaaa-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-0000000000b1', 'crear_paso', null, null, 0);
select track_event('aaaaaaaa-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-0000000000b1', 'crear_paso', null, null, 1);
-- Otro, directo desde el ordenador, que solo mira la portada
select track_event('aaaaaaaa-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-0000000000b2', 'visita', 'portada', null, null, null, 'ordenador');
-- Un cliente que visita la web de un negocio y reserva
select track_event('aaaaaaaa-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-0000000000b3', 'visita', 'negocio', 'Spa-Mar');
select track_event('aaaaaaaa-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-0000000000b3', 'reserva_hecha', 'reservar', 'spa-mar');
-- Lo que no es un evento conocido se ignora sin error
select track_event('aaaaaaaa-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-0000000000b1', 'inventado');
select track_event(null, null, 'visita');
-- Freno: como mucho 60 por visitante y hora
do $$ begin
  for i in 1..70 loop
    perform track_event('aaaaaaaa-0000-0000-0000-00000000000d', 'aaaaaaaa-0000-0000-0000-0000000000b4', 'visita', 'entrar');
  end loop;
end $$;
select expect_error('select * from analytics_events', 'permission denied');
reset role;
do $$ begin
  assert (select count(*) from analytics_events where visitor_id = 'aaaaaaaa-0000-0000-0000-00000000000d') = 60, 'freno de 60 por hora';
  assert not exists (select 1 from analytics_events where name not in ('visita', 'crear_paso', 'negocio_creado', 'reserva_hecha'));
  assert (select source from analytics_events where visitor_id = 'aaaaaaaa-0000-0000-0000-00000000000a' and page = 'portada') = 'instagram', 'fuente en minúsculas';
  assert (select slug from analytics_events where page = 'negocio') = 'spa-mar', 'enlace en minúsculas';
end $$;
-- Una cuenta de dueño autenticada tampoco puede leer la tabla ni las cifras
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ begin assert (select count(*) from analytics_events) = 0, 'el dueño no ve las visitas'; end $$;
select expect_error('select admin_traffic(30)', 'NO_AUTORIZADO');
-- El administrador sí
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
do $$ declare t jsonb := admin_traffic(30); begin
  assert (t->>'visitors')::int = 2, 'visitantes de la portada: ' || (t->>'visitors');
  assert (t->'funnel'->>'crear')::int = 1;
  assert (t->'funnel'->'pasos'->>0)::int = 1 and (t->'funnel'->'pasos'->>1)::int = 1 and (t->'funnel'->'pasos'->>2)::int = 0, 'embudo: ' || (t->'funnel')::text;
  assert jsonb_array_length(t->'by_day') = 30;
  assert (t->'devices'->>'movil')::int = 1 and (t->'devices'->>'ordenador')::int = 1;
  assert exists (select 1 from jsonb_array_elements(t->'sources') x where x->>'source' = 'instagram' and (x->>'visitors')::int = 1);
  assert exists (select 1 from jsonb_array_elements(t->'sources') x where x->>'source' = 'directo');
  assert (t->'business_totals'->>'visitors')::int = 1 and (t->'business_totals'->>'bookings')::int = 1;
  assert (t->'business_pages'->0->>'name') = 'Spa Mar', 'nombre del negocio: ' || (t->'business_pages')::text;
  assert jsonb_array_length(admin_traffic(7)->'by_day') = 7;
  assert jsonb_array_length(admin_traffic(1)->'by_day') = 1, 'hoy: un solo día';
  assert jsonb_array_length(admin_traffic(2)->'by_day') = 2, 'hoy y ayer: dos días';
  assert jsonb_array_length(t->'by_hour') = 24, 'visitantes por hora';
  assert (select sum(x::int) from jsonb_array_elements_text(t->'by_hour') x) >= 2, 'las horas suman los visitantes';
end $$;
-- Actividad de los negocios
do $$ declare a jsonb := admin_business_activity(); leo jsonb; begin
  assert jsonb_array_length(a) = (select count(*) from businesses), 'todos los negocios';
  select x into leo from jsonb_array_elements(a) x where x->>'slug' = 'barberia-leo';
  -- (el administrador no puede leer las citas directamente: solo esta función le da las cifras)
  assert (leo->>'bookings_total')::int >= 1, 'tiene reservas: ' || leo::text;
  assert (leo->>'bookings_7d')::int <= (leo->>'bookings_30d')::int and (leo->>'bookings_30d')::int <= (leo->>'bookings_total')::int, 'cifras coherentes: ' || leo::text;
  assert (leo->>'customers')::int >= 1 and leo ? 'last_booking_at' and leo ? 'bookings_7d' and leo ? 'web_30d';
  -- Primeros pasos del dueño (panel de administrador)
  assert leo ? 'customized' and leo ? 'push_on' and leo ? 'link_visits' and leo ? 'paid' and leo ? 'web_7d', 'primeros pasos: ' || leo::text;
  assert (leo->>'web_total')::int + (leo->>'manual_total')::int = (leo->>'bookings_total')::int, 'web + a mano = todas: ' || leo::text;
  assert (leo->>'web_7d')::int <= (leo->>'web_30d')::int and (leo->>'web_30d')::int <= (leo->>'web_total')::int, 'reservas web coherentes: ' || leo::text;
  assert (leo->>'link_visits')::int >= 0 and jsonb_typeof(leo->'customized') = 'boolean' and jsonb_typeof(leo->'paid') = 'boolean';
  assert (a->0->>'bookings_30d')::int >= (a->-1->>'bookings_30d')::int, 'de más a menos reservas';
end $$;
-- Sin restricciones (como la base misma), las reservas coinciden exactamente con las citas reales
reset role;
do $$ begin
  assert not exists (
    select 1 from jsonb_array_elements(admin_business_activity()) x
    where (x->>'bookings_total')::int <> (select count(*) from appointments a where a.business_id = (x->>'id')::uuid and a.status <> 'cancelada')
  ), 'las reservas de cada negocio coinciden con sus citas';
end $$;
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select expect_error('select admin_business_activity()', 'NO_AUTORIZADO');
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
reset role;
select _purge_analytics();
do $$ begin assert (select count(*) from analytics_events) > 0, 'la limpieza solo borra lo de hace más de 13 meses'; end $$;
set role authenticated;

-- ===== Opciones de precio de un servicio (Spa Mar: abre a las 10 y 11, con dos profesionales) =====
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
with n as (
  insert into services (business_id, name, price, duration_min, position, options)
  values (my_business_id(), 'Corte a elegir', 0, 30, 50,
          '[{"name":" Niño ","price":400},{"name":"Adulto","price":600},{"id":"o9","name":"Con barba","price":"800"}]')
  returning id)
insert into ctx select 'opc', id::text from n;
do $$ declare o jsonb := (select options from services where id = (select v from ctx where k = 'opc')::uuid); begin
  assert o = '[{"id":"o10","name":"Niño","price":400},{"id":"o11","name":"Adulto","price":600},{"id":"o9","name":"Con barba","price":800}]'::jsonb, o::text;
  assert (select price from services where id = (select v from ctx where k = 'opc')::uuid) = 400, 'el precio es el de la más barata';
end $$;
select expect_error($$update services set options = '[{"name":"Sola","price":1}]' where id = '$$ || (select v from ctx where k = 'opc') || $$'$$, 'OPCIONES_INVALIDAS');
select expect_error($$update services set options = '[{"name":"A","price":-1},{"name":"B","price":1}]' where id = '$$ || (select v from ctx where k = 'opc') || $$'$$, 'OPCIONES_INVALIDAS');
select expect_error($$update services set options = '[{"name":"","price":1},{"name":"B","price":1}]' where id = '$$ || (select v from ctx where k = 'opc') || $$'$$, 'OPCIONES_INVALIDAS');

reset request.jwt.claim.sub;
set role anon;
insert into ctx values ('dia_opc', ((now() at time zone 'Etc/GMT+4')::date + 40)::text);
do $$ begin
  assert jsonb_array_length((select x from jsonb_array_elements(get_public_business('spa-mar')->'services') x
                             where x->>'name' = 'Corte a elegir')->'options') = 3, 'la web pública ve las opciones';
end $$;
select expect_error($$select create_booking('spa-mar', array['$$ || (select v from ctx where k = 'opc') || $$'::uuid], '$$ || (select v from ctx where k = 'dia_opc') || $$', '10:00', 'Olga Opción', '5355551212')$$, 'FALTA_OPCION');
select expect_error($$select create_booking('spa-mar', array['$$ || (select v from ctx where k = 'opc') || $$'::uuid], '$$ || (select v from ctx where k = 'dia_opc') || $$', '10:00', 'Olga Opción', '5355551212', p_options => '{"$$ || (select v from ctx where k = 'opc') || $$":"o99"}')$$, 'FALTA_OPCION');
insert into ctx select 'topc', create_booking('spa-mar', array[(select v from ctx where k = 'opc')::uuid, (select v from ctx where k = 'masaje')::uuid],
  (select v from ctx where k = 'dia_opc')::date, '10:00', 'Olga Opción', '5355551212',
  p_options => jsonb_build_object((select v from ctx where k = 'opc'), 'o11'));
do $$ declare b jsonb := get_booking((select v from ctx where k = 'topc')); begin
  assert (b->>'total')::numeric = 1600, 'Adulto 600 + Masaje 1000: ' || (b->>'total');
  assert exists (select 1 from jsonb_array_elements(b->'services') x
                 where x->>'name' = 'Corte a elegir · Adulto' and x->>'option_id' = 'o11' and (x->>'price')::numeric = 600), b::text;
end $$;

-- El dueño sube el precio: la cita que no cambia de opción mantiene el suyo
reset role;
update services set options = '[{"id":"o10","name":"Niño","price":400},{"id":"o11","name":"Adulto","price":700},{"id":"o9","name":"Con barba","price":800}]'
  where id = (select v from ctx where k = 'opc')::uuid;
set role anon;
select edit_booking((select v from ctx where k = 'topc'), array[(select v from ctx where k = 'opc')::uuid, (select v from ctx where k = 'masaje')::uuid],
  (select v from ctx where k = 'dia_opc')::date, '10:00', 'Olga Opción', 'nota',
  p_options => jsonb_build_object((select v from ctx where k = 'opc'), 'o11'));
do $$ begin assert (get_booking((select v from ctx where k = 'topc'))->>'total')::numeric = 1600, 'misma opción, mismo precio'; end $$;
select edit_booking((select v from ctx where k = 'topc'), array[(select v from ctx where k = 'opc')::uuid],
  (select v from ctx where k = 'dia_opc')::date, '10:00', 'Olga Opción', 'nota',
  p_options => jsonb_build_object((select v from ctx where k = 'opc'), 'o10'));
do $$ declare b jsonb := get_booking((select v from ctx where k = 'topc')); begin
  assert (b->>'total')::numeric = 400, 'cambia a Niño: ' || (b->>'total');
  assert b->'services'->0->>'name' = 'Corte a elegir · Niño', b::text;
end $$;

-- Varias opciones a la vez: solo si el dueño lo permite, y se suman
select expect_error($$select create_booking('spa-mar', array['$$ || (select v from ctx where k = 'opc') || $$'::uuid], '$$ || (select v from ctx where k = 'dia_opc') || $$', '11:00', 'Vera Varias', '5355551414', p_options => '{"$$ || (select v from ctx where k = 'opc') || $$":["o10","o9"]}')$$, 'FALTA_OPCION');
reset role;
update services set multi_options = true where id = (select v from ctx where k = 'opc')::uuid;
set role anon;
select expect_error($$select create_booking('spa-mar', array['$$ || (select v from ctx where k = 'opc') || $$'::uuid], '$$ || (select v from ctx where k = 'dia_opc') || $$', '11:00', 'Vera Varias', '5355551414', p_options => '{"$$ || (select v from ctx where k = 'opc') || $$":[]}')$$, 'FALTA_OPCION');
select expect_error($$select create_booking('spa-mar', array['$$ || (select v from ctx where k = 'opc') || $$'::uuid], '$$ || (select v from ctx where k = 'dia_opc') || $$', '11:00', 'Vera Varias', '5355551414', p_options => '{"$$ || (select v from ctx where k = 'opc') || $$":["o10","o99"]}')$$, 'FALTA_OPCION');
insert into ctx select 'tvar', create_booking('spa-mar', array[(select v from ctx where k = 'opc')::uuid],
  (select v from ctx where k = 'dia_opc')::date, '11:00', 'Vera Varias', '5355551414',
  p_options => jsonb_build_object((select v from ctx where k = 'opc'), jsonb_build_array('o9', 'o10', 'o10')));
do $$ declare b jsonb := get_booking((select v from ctx where k = 'tvar')); begin
  assert (b->>'total')::numeric = 1200, 'Niño 400 + Con barba 800: ' || (b->>'total');
  assert b->'services'->0->>'name' = 'Corte a elegir · Niño + Con barba' and b->'services'->0->>'option_id' = 'o10,o9', b::text;
end $$;
-- Las mismas opciones en otro orden: la cita no cambia
reset role;
update services set options = '[{"id":"o10","name":"Niño","price":450},{"id":"o11","name":"Adulto","price":700},{"id":"o9","name":"Con barba","price":800}]'
  where id = (select v from ctx where k = 'opc')::uuid;
set role anon;
select edit_booking((select v from ctx where k = 'tvar'), array[(select v from ctx where k = 'opc')::uuid],
  (select v from ctx where k = 'dia_opc')::date, '11:00', 'Vera Varias', null,
  p_options => jsonb_build_object((select v from ctx where k = 'opc'), jsonb_build_array('o10', 'o9')));
do $$ begin assert (get_booking((select v from ctx where k = 'tvar'))->>'total')::numeric = 1200, 'mismas opciones, mismo precio'; end $$;

-- Cita a mano del dueño con una opción
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select expect_error($$select owner_create_appointment(array['$$ || (select v from ctx where k = 'opc') || $$'::uuid], '$$ || (select v from ctx where k = 'dia_opc') || $$', '16:00', 'Mano Opción', '5355551313')$$, 'FALTA_OPCION');
insert into ctx select 'mopc', owner_create_appointment(array[(select v from ctx where k = 'opc')::uuid],
  (select v from ctx where k = 'dia_opc')::date, '16:00', 'Mano Opción', '5355551313',
  p_options => jsonb_build_object((select v from ctx where k = 'opc'), 'o9'))::text;
do $$ begin
  assert (select total from appointments where id = (select v from ctx where k = 'mopc')::uuid) = 800, 'Con barba 800';
end $$;
reset role;
delete from appointments where id = (select v from ctx where k = 'mopc')::uuid or token in ((select v from ctx where k = 'topc'), (select v from ctx where k = 'tvar'));
delete from services where id = (select v from ctx where k = 'opc')::uuid;

-- ===== Zona horaria de cada negocio =====
reset role;
-- Dos citas seguidas, lejos de cualquier otra: al moverlas no deben pisarse entre ellas
insert into appointments (business_id, token, starts_at, ends_at, customer_name, customer_phone, status, source)
select id, 'zona1', date_trunc('hour', now()) + interval '200 days', date_trunc('hour', now()) + interval '200 days 1 hour',
       'Ana Zona', '5355550001', 'confirmada', 'manual' from businesses where slug = 'spa-mar';
insert into appointments (business_id, token, starts_at, ends_at, customer_name, customer_phone, status, source)
select id, 'zona2', date_trunc('hour', now()) + interval '200 days 1 hour', date_trunc('hour', now()) + interval '200 days 2 hours',
       'Bea Zona', '5355550002', 'pendiente', 'manual' from businesses where slug = 'spa-mar';
create temp table zona_antes as
  select token, starts_at, ends_at, starts_at at time zone 'Etc/GMT+4' as hora_local
  from appointments where token in ('zona1', 'zona2');
do $$ begin assert (select timezone from businesses where slug = 'spa-mar') = 'Etc/GMT+4'; end $$;

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select expect_error($$select admin_set_timezone((select id from businesses where slug='spa-mar'), 'Europe/Madrid')$$, 'NO_AUTORIZADO');
update businesses set timezone = 'Europe/Madrid' where slug = 'spa-mar';
reset role;
do $$ begin assert (select timezone from businesses where slug = 'spa-mar') = 'Etc/GMT+4', 'el dueño no se cambia la zona'; end $$;

set role authenticated;
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
select expect_error($$select admin_set_timezone((select id from businesses where slug='spa-mar'), 'Marte/Olimpo')$$, 'ZONA_INVALIDA');
select expect_error($$select admin_set_timezone('00000000-0000-0000-0000-000000000000', 'Europe/Madrid')$$, 'NEGOCIO_NO_EXISTE');
do $$ begin
  assert admin_set_timezone((select id from businesses where slug='spa-mar'), 'Europe/Madrid') >= 2, 'mueve las citas futuras';
  assert (select x->>'timezone' from jsonb_array_elements(admin_list_owners()) x where x->>'slug' = 'spa-mar') = 'Europe/Madrid';
end $$;
reset role;
do $$ begin
  assert (select timezone from businesses where slug = 'spa-mar') = 'Europe/Madrid';
  assert not exists (select 1 from appointments a join zona_antes z using (token)
                     where a.starts_at at time zone 'Europe/Madrid' <> z.hora_local
                        or a.ends_at - a.starts_at <> z.ends_at - z.starts_at),
    'las citas se ven a la misma hora y duran lo mismo';
  assert not exists (select 1 from appointments a join zona_antes z using (token) where a.starts_at = z.starts_at),
    'el momento real sí cambió';
end $$;
-- Sin mantener las horas: las citas se quedan en su momento real
create temp table zona_madrid as select token, starts_at from appointments where token in ('zona1', 'zona2');
set role authenticated;
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
do $$ begin
  assert admin_set_timezone((select id from businesses where slug='spa-mar'), 'Etc/GMT+4', false) = 0;
  assert admin_set_timezone((select id from businesses where slug='spa-mar'), 'Etc/GMT+4') = 0, 'misma zona: nada que hacer';
end $$;
reset role;
do $$ begin
  assert (select timezone from businesses where slug = 'spa-mar') = 'Etc/GMT+4';
  assert not exists (select 1 from appointments a join zona_madrid z using (token) where a.starts_at <> z.starts_at),
    'sin mantener horas, las citas no se mueven';
end $$;
delete from appointments where token in ('zona1', 'zona2');

-- Paso de Cuba a UTC−4 fijo (final de schema.sql): la cita de las 10:00 sigue a las 10:00
reset role;
update businesses set timezone = 'America/Havana' where slug = 'spa-mar';
insert into appointments (business_id, token, starts_at, ends_at, customer_name, customer_phone, status, source)
select id, 'cuba1', '2027-01-20 15:00+00', '2027-01-20 16:00+00', 'Cuca Cuba', '5355550003', 'confirmada', 'manual'
  from businesses where slug = 'spa-mar';
do $$ begin assert to_char((select starts_at from appointments where token = 'cuba1') at time zone 'America/Havana', 'HH24:MI') = '10:00'; end $$;
select _move_business_timezone((select id from businesses where slug = 'spa-mar'), 'Etc/GMT+4', true);
do $$ begin
  assert (select timezone from businesses where slug = 'spa-mar') = 'Etc/GMT+4';
  assert (select starts_at from appointments where token = 'cuba1') = '2027-01-20 14:00+00', 'a las 10:00 de UTC−4';
  assert to_char((select starts_at from appointments where token = 'cuba1') at time zone 'Etc/GMT+4', 'HH24:MI') = '10:00';
end $$;
set role authenticated;
select expect_error($$select _move_business_timezone(gen_random_uuid(), 'Etc/GMT+4', true)$$, 'permission denied');
reset role;
delete from appointments where token = 'cuba1';

-- Los negocios nuevos empiezan con la zona de los ajustes (o la de Cuba si está mal escrita)
insert into auth.users (id, email) values
  ('33333333-3333-3333-3333-333333333333', 'madrid@test.com'),
  ('44444444-4444-4444-4444-444444444444', 'erratas@test.com');
update platform_settings set default_timezone = 'Europe/Madrid';
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select create_business('Zona Madrid', 'zona-madrid', 'otro', '55550100', null, '#0ea5e9', '[]', '[]');
reset role;
update platform_settings set default_timezone = 'Europe/Madrdi';
set role authenticated;
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
select create_business('Zona Erratas', 'zona-erratas', 'otro', '55550101', null, '#0ea5e9', '[]', '[]');
reset role;
do $$ begin
  assert (select timezone from businesses where slug = 'zona-madrid') = 'Europe/Madrid', 'zona de los ajustes';
  assert (select timezone from businesses where slug = 'zona-erratas') = 'Etc/GMT+4', 'zona mal escrita: la de Cuba';
end $$;
update platform_settings set default_timezone = 'Etc/GMT+4';
delete from auth.users where id in ('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444');
set role authenticated;

-- ===== Aviso de que se acaba la prueba gratis =====
reset role;
do $$ declare
  hoy timestamptz := '2026-11-10 13:00+00';  -- 9:00 en Cuba
  t text[];
begin
  t := _expiry_push_text('prueba', '2026-11-13 20:00+00', 'Etc/GMT+4', 'Spa Mar', hoy);
  assert t[1] = 'Te quedan 3 días de prueba gratis', t[1];
  assert t[2] = 'Tu prueba gratis termina el 13/11. Suscríbete en Más → Mensualidad para que tus clientes sigan reservando en Spa Mar. Si no, tu app se borra 5 días después.', t[2];
  t := _expiry_push_text('prueba', '2026-11-11 20:00+00', 'Etc/GMT+4', 'Spa Mar', hoy);
  assert t[1] = 'Mañana termina tu prueba gratis' and t[2] like 'Tu prueba gratis termina mañana a las 16:00.%', t::text;
  -- A las 2:00 UTC del día 11 en Cuba todavía es el día 10 (las 22:00)
  t := _expiry_push_text('prueba', '2026-11-11 02:00+00', 'Etc/GMT+4', 'Spa Mar', hoy);
  assert t[1] = 'Hoy termina tu prueba gratis' and t[2] like '%hoy a las 22:00.%', t::text;
  t := _expiry_push_text('activo', '2026-11-12 20:00+00', 'Etc/GMT+4', 'Spa Mar', hoy);
  assert t[1] = 'Tu mensualidad vence en 2 días' and t[2] like 'Vence el 12/11. Paga en Más → Mensualidad%', t::text;
end $$;
set role authenticated;
select expect_error($$select _expiry_push_text('prueba', now(), 'UTC', 'x')$$, 'permission denied');
reset role;
do $$ declare t text[]; begin
  t := _expiry_push_text_en('prueba', now() + interval '3 days', 'UTC', 'Nails Miami');
  assert t[1] = '3 days left in your free trial', 'aviso en inglés: ' || t[1];
  assert _l('en', 'hola', 'hi') = 'hi' and _l('es', 'hola', 'hi') = 'hola' and _l(null, 'hola', 'hi') = 'hola', 'idioma de los avisos';
end $$;
set role authenticated;

-- ===== Encuestas a los dueños =====
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select expect_error($$select admin_create_survey('Hola', null, '[{"type":"estrellas","text":"¿Te gusta?"}]')$$, 'NO_AUTORIZADO');
select expect_error('select admin_list_surveys()', 'NO_AUTORIZADO');
do $$ begin assert get_my_survey() is null, 'sin encuestas todavía'; end $$;
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
select expect_error($$select admin_create_survey('Hola', null, '[]')$$, 'ENCUESTA_INVALIDA');
select expect_error($$select admin_create_survey('Hola', null, '[{"type":"color","text":"¿Te gusta?"}]')$$, 'ENCUESTA_INVALIDA');
select expect_error($$select admin_create_survey('', null, '[{"type":"texto","text":"¿Algo más?"}]')$$, 'ENCUESTA_INVALIDA');
insert into ctx values ('encuesta', admin_create_survey('¿Qué te parece Citora?', '  Tres preguntas  ',
  '[{"type":"estrellas","text":" ¿Te está gustando Citora? "},{"type":"si_no","text":"¿Te resulta útil?"},{"type":"texto","text":"¿Qué cambiarías?"}]', true)::text);

set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ declare s jsonb := get_my_survey(); begin
  assert s->>'id' = (select v from ctx where k = 'encuesta'), 'el dueño ve la encuesta: ' || coalesce(s::text, 'null');
  assert s->>'intro' = 'Tres preguntas';
  assert s->'questions' = '[{"id":"p1","type":"estrellas","text":"¿Te está gustando Citora?"},{"id":"p2","type":"si_no","text":"¿Te resulta útil?"},{"id":"p3","type":"texto","text":"¿Qué cambiarías?"}]'::jsonb, s::text;
end $$;
select expect_error($$select submit_survey_answer('$$ || (select v from ctx where k = 'encuesta') || $$', '{"p1":7,"p2":true}')$$, 'RESPUESTA_INVALIDA');
select expect_error($$select submit_survey_answer('$$ || (select v from ctx where k = 'encuesta') || $$', '{"p1":5}')$$, 'RESPUESTA_INVALIDA');
select expect_error($$select submit_survey_answer('$$ || (select v from ctx where k = 'encuesta') || $$', '{"p1":5,"p2":"si"}')$$, 'RESPUESTA_INVALIDA');
select submit_survey_answer((select v from ctx where k = 'encuesta')::uuid, '{"p1":4,"p2":true,"p3":"  Más colores  ","p9":"ignorada"}');
do $$ begin assert get_my_survey() is null, 'ya respondió: no se le vuelve a pedir'; end $$;
-- Puede cambiar su respuesta (texto vacío = sin respuesta)
select submit_survey_answer((select v from ctx where k = 'encuesta')::uuid, '{"p1":5,"p2":true,"p3":"  "}');
do $$ begin
  assert (select count(*) from owner_surveys) = 0, 'el dueño no lee las encuestas directamente';
  assert (select count(*) from owner_survey_answers) = 0, 'ni las respuestas de nadie';
end $$;

set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
do $$ declare s jsonb := (select x from jsonb_array_elements(admin_list_surveys()) x where x->>'id' = (select v from ctx where k = 'encuesta')); begin
  assert jsonb_array_length(s->'answers') = 1, s::text;
  assert s->'answers'->0->'answers' = '{"p1":5,"p2":true}'::jsonb, s::text;
  assert s->'answers'->0->>'name' = 'Spa Mar';
  assert not exists (select 1 from jsonb_array_elements(s->'pending') x where x->>'name' = 'Spa Mar'), 'quien respondió no está en pendientes';
end $$;
select admin_set_survey_active((select v from ctx where k = 'encuesta')::uuid, false);
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select expect_error($$select submit_survey_answer('$$ || (select v from ctx where k = 'encuesta') || $$', '{"p1":5,"p2":true}')$$, 'ENCUESTA_CERRADA');
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
select admin_delete_survey((select v from ctx where k = 'encuesta')::uuid);
select expect_error($$select admin_delete_survey('$$ || (select v from ctx where k = 'encuesta') || $$')$$, 'NO_DISPONIBLE');
reset role;
do $$ begin
  assert not exists (select 1 from owner_surveys), 'encuesta borrada';
  assert not exists (select 1 from owner_survey_answers), 'con sus respuestas';
end $$;
set role authenticated;

-- Encuesta solo para algunos negocios
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
select expect_error($$select admin_create_survey('Solo unos', null, '[{"type":"si_no","text":"¿Te sirve?"}]', false, array['00000000-0000-0000-0000-000000000000'::uuid])$$, 'ENCUESTA_SIN_DESTINO');
insert into ctx values ('encuesta2', admin_create_survey('Solo para Spa Mar', null, '[{"type":"si_no","text":"¿Te sirve?"}]', true,
  array[(select id from businesses where slug = 'spa-mar'), '00000000-0000-0000-0000-000000000000'::uuid])::text);
do $$ declare s jsonb := (select x from jsonb_array_elements(admin_list_surveys()) x where x->>'id' = (select v from ctx where k = 'encuesta2')); begin
  assert jsonb_array_length(s->'business_ids') = 1, 'solo se guardan negocios que existen: ' || s::text;
  assert jsonb_array_length(s->'pending') = 1 and s->'pending'->0->>'name' = 'Spa Mar', 'pendiente solo a quien va: ' || s::text;
end $$;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$ begin assert get_my_survey() is null, 'a Barbería Leo no le llega'; end $$;
select expect_error($$select submit_survey_answer('$$ || (select v from ctx where k = 'encuesta2') || $$', '{"p1":true}')$$, 'ENCUESTA_CERRADA');
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ begin assert get_my_survey()->>'id' = (select v from ctx where k = 'encuesta2'), 'a Spa Mar sí'; end $$;
select submit_survey_answer((select v from ctx where k = 'encuesta2')::uuid, '{"p1":true}');
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
select admin_delete_survey((select v from ctx where k = 'encuesta2')::uuid);

-- ===== Repartir los servicios del salón entre el equipo =====
reset role;
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select owner_set_team_services(jsonb_build_object(
  (select v from ctx where k='ana'), jsonb_build_array((select v from ctx where k='masaje')),
  (select v from ctx where k='bea'), '[]'::jsonb));
do $$ begin
  assert (select own_services from staff where name = 'Bea') and (select own_services from staff where name = 'Ana'), 'las dos con servicios propios';
  assert (select count(*) from staff_services where staff_id = (select v from ctx where k='ana')::uuid) = 1, 'Ana hace el masaje';
  assert not exists (select 1 from staff_services where staff_id = (select v from ctx where k='bea')::uuid), 'Bea no hace nada';
end $$;
-- Un servicio o un profesional de otro negocio: no se guarda nada
select expect_error($$select owner_set_team_services(jsonb_build_object('$$ || (select v from ctx where k='ana') || $$', jsonb_build_array('$$ || (select v from ctx where k='corte') || $$')))$$, 'SERVICIOS_INVALIDOS');
select expect_error($$select owner_set_team_services(jsonb_build_object(gen_random_uuid()::text, '[]'::jsonb))$$, 'PROFESIONAL_INVALIDO');
select expect_error($$select owner_set_team_services('[1]')$$, 'DATOS_INVALIDOS');
do $$ begin assert (select count(*) from staff_services where staff_id = (select v from ctx where k='ana')::uuid) = 1, 'sigue igual tras el error'; end $$;
-- Otro dueño (Leo, que a estas alturas tiene el negocio inhabilitado) no puede tocar al equipo de Spa Mar
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select expect_error($$select owner_set_team_services(jsonb_build_object('$$ || (select v from ctx where k='ana') || $$', '[]'::jsonb))$$, 'NO_DISPONIBLE');
reset role;
-- Como estaba: hacen todo
delete from staff_services where staff_id in ((select v from ctx where k='ana')::uuid, (select v from ctx where k='bea')::uuid);
update staff set own_services = false where name in ('Ana', 'Bea');
set role authenticated;
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';

-- ===== Dos planes: Solo (sin equipo) y Equipo (versión 1.4) =====
do $$ begin
  assert plan_has('ultra', 'empleados') and not plan_has('basico', 'empleados') and not plan_has('plus', 'empleados'), 'equipo solo en Equipo';
  assert plan_has('basico', 'clientes') and not plan_has(null, 'clientes'), 'lo demás, en los dos';
  assert (select price_ultra from platform_settings) = 3000 or (select plans_v2 from platform_settings), 'Equipo empieza en 3.000';
end $$;
-- Spa Mar (con Ana y Bea) pasa a Solo: su equipo no se ve, las citas van a su agenda y el enlace no sirve
reset role;
update businesses set plan = 'basico' where slug = 'spa-mar';
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
insert into ctx select 'tok_solo', owner_staff_link((select v from ctx where k='ana')::uuid, 'nuevo');
select expect_error($$insert into staff (business_id, name) values (my_business_id(), 'Nueva')$$, 'row-level security');
reset role;
set role anon;
do $$ begin
  assert jsonb_array_length(get_public_business('spa-mar')->'staff') = 0, 'sin plan Equipo no sale el equipo';
end $$;
select expect_error($$select staff_portal('$$ || (select v from ctx where k='tok_solo') || $$')$$, 'SIN_PLAN_EQUIPO');
insert into ctx select 'r_solo', create_booking('spa-mar', array[(select v from ctx where k='masaje')::uuid], (select v from ctx where k='day2')::date, '11:00', 'Cliente Solo', '5350000081');
reset role;
do $$ begin
  assert (select staff_id from appointments where token = (select v from ctx where k='r_solo')) is null, 'con Solo, la cita va a la agenda del negocio';
end $$;
update appointments set status = 'cancelada' where token = (select v from ctx where k='r_solo');
update businesses set plan = 'ultra' where slug = 'spa-mar';
set role anon;
do $$ begin assert jsonb_array_length(get_public_business('spa-mar')->'staff') > 0, 'con Equipo vuelve a salir'; end $$;
reset role;
set role authenticated;

-- ===== Primeros pasos (versión 1.4) =====
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$ declare p jsonb := get_my_progress(); begin
  assert p ? 'web_total' and p ? 'web_real' and p ? 'push_on' and p ? 'visits_7d' and p ? 'bookings' and p ? 'revenue', 'progreso: ' || p::text;
  assert (p->>'web_real')::int <= (p->>'web_total')::int and (p->>'web_total')::int <= (p->>'bookings')::int, 'progreso coherente: ' || p::text;
  assert jsonb_typeof(p->'push_on') = 'boolean';
end $$;
-- El dueño guarda sus pasos; lo que no es un objeto o es enorme se ignora
update businesses set onboarding = '{"tools":["recordatorios","cupones"],"skipped":["servicios"],"steps":{"ver":"2026-11-16T10:00:00Z"}}'
  where owner_id = '11111111-1111-1111-1111-111111111111';
do $$ begin assert (select onboarding->'tools'->>1 from businesses where owner_id = '11111111-1111-1111-1111-111111111111') = 'cupones', 'herramientas guardadas'; end $$;
update businesses set onboarding = '[1,2]' where owner_id = '11111111-1111-1111-1111-111111111111';
update businesses set onboarding = jsonb_build_object('x', (select string_agg(md5(i::text), '') from generate_series(1, 600) i)) where owner_id = '11111111-1111-1111-1111-111111111111';
do $$ begin assert (select onboarding->'skipped'->>0 from businesses where owner_id = '11111111-1111-1111-1111-111111111111') = 'servicios', 'se conserva si no es válido'; end $$;
-- Sin negocio: nada
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
do $$ begin assert get_my_progress() is null, 'el administrador no tiene progreso'; end $$;
-- Evento nuevo del asistente
reset role;
set role anon;
select track_event(gen_random_uuid(), gen_random_uuid(), 'paso_saltado', 'crear', null, 3, null, 'movil');
reset role;
do $$ begin assert exists (select 1 from analytics_events where name = 'paso_saltado' and step = 3), 'paso saltado medido'; end $$;
set role authenticated;

-- ===== Corregir y borrar pagos =====
reset role;
insert into auth.users (id, email) values
  ('33333333-3333-3333-3333-333333333333', 'pepe@test.com'),
  ('44444444-4444-4444-4444-444444444444', 'ana@test.com'),
  ('55555555-5555-5555-5555-555555555555', 'luz@test.com');
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select create_business('Uñas Pepe', 'unas-pepe', 'unas', '55553333', '', '#db2777', '[{"name":"Manicura","price":800,"duration_min":45}]', '[]');
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
select create_business('Salón Ana', 'salon-ana', 'peluqueria', '55554444', '', '#db2777', '[{"name":"Corte","price":800,"duration_min":45}]', '[]');
set request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
select create_business('Spa Luz', 'spa-luz', 'spa', '55555555', '', '#db2777', '[{"name":"Masaje","price":800,"duration_min":45}]', '[]');
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
select admin_activate_plan((select id from businesses where slug='unas-pepe'), 'basico', 1, 1500, 'Primer pago');
reset role;
insert into ctx select 'pago_pepe', id::text from payments where business_id = (select id from businesses where slug='unas-pepe');
insert into ctx select 'hasta_pepe', paid_until::text from businesses where slug='unas-pepe';
set role authenticated;
-- Un dueño no puede tocar los pagos
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select expect_error($$select admin_update_payment('$$ || (select v from ctx where k='pago_pepe') || $$', 'basico', 3, 0)$$, 'NO_AUTORIZADO');
select expect_error($$select admin_delete_payment('$$ || (select v from ctx where k='pago_pepe') || $$')$$, 'NO_AUTORIZADO');
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
select expect_error($$select admin_update_payment('$$ || (select v from ctx where k='pago_pepe') || $$', 'basico', 0, 1500)$$, 'MESES_INVALIDOS');
select expect_error($$select admin_update_payment('$$ || (select v from ctx where k='pago_pepe') || $$', 'basico', 1, -5)$$, 'IMPORTE_INVALIDO');
select expect_error($$select admin_delete_payment(gen_random_uuid())$$, 'PAGO_NO_EXISTE');
-- De 1 a 2 meses del plan Equipo y otro importe: un mes más, el plan cambia y el historial también
select admin_update_payment((select v from ctx where k='pago_pepe')::uuid, 'ultra', 2, 6000, 'Corregido');
do $$ begin
  assert exists (select 1 from jsonb_array_elements(admin_stats()->'recent_payments') x
                 where x->>'id' = (select v from ctx where k='pago_pepe') and (x->>'amount')::numeric = 6000 and x->>'note' = 'Corregido'), 'historial corregido';
end $$;
reset role;
do $$ begin
  assert (select paid_until from businesses where slug='unas-pepe') = (select v from ctx where k='hasta_pepe')::timestamptz + interval '1 month', 'un mes más';
  assert (select plan from businesses where slug='unas-pepe') = 'ultra', 'plan del pago corregido';
  assert (select paid_until from payments where id = (select v from ctx where k='pago_pepe')::uuid) = (select paid_until from businesses where slug='unas-pepe'), 'el pago cuadra';
end $$;
-- Un segundo pago (hecho más tarde) y se borra el primero: el segundo se recalcula desde su propia fecha
set role authenticated;
select admin_activate_plan((select id from businesses where slug='unas-pepe'), 'basico', 1, 1500);
reset role;
update payments set created_at = created_at + interval '1 minute'
 where business_id = (select id from businesses where slug='unas-pepe') and id <> (select v from ctx where k='pago_pepe')::uuid;
set role authenticated;
select admin_delete_payment((select v from ctx where k='pago_pepe')::uuid);
reset role;
do $$ declare p payments; begin
  select * into p from payments where business_id = (select id from businesses where slug='unas-pepe');
  assert p.paid_until = p.created_at + interval '1 month', 'recalculado: ' || p.paid_until;
  assert (select paid_until from businesses where slug='unas-pepe') = p.paid_until, 'el negocio pierde los 2 meses borrados';
  assert (select plan from businesses where slug='unas-pepe') = 'basico', 'plan del pago que queda';
end $$;
-- Se borra el último pago: vuelve a su prueba (sigue vigente)
insert into ctx select 'pago_pepe2', id::text from payments where business_id = (select id from businesses where slug='unas-pepe');
set role authenticated;
select admin_delete_payment((select v from ctx where k='pago_pepe2')::uuid);
reset role;
do $$ begin
  assert (select paid_until from businesses where slug='unas-pepe') is null, 'sin pagos, sin fecha de pago';
  assert (get_public_business('unas-pepe')->>'accepting')::boolean, 'vuelve a su prueba';
end $$;
-- Si se le inhabilitó, corregir un pago no le devuelve los días
set role authenticated;
select admin_activate_plan((select id from businesses where slug='spa-luz'), 'basico', 1, 1500);
select admin_deactivate_business((select id from businesses where slug='spa-luz'));
reset role;
insert into ctx select 'pago_luz', id::text from payments where business_id = (select id from businesses where slug='spa-luz');
set role authenticated;
select admin_update_payment((select v from ctx where k='pago_luz')::uuid, 'basico', 3, 4500);
-- Inhabilitar una prueba sin pagos deja vacía la fecha de pago
select admin_deactivate_business((select id from businesses where slug='salon-ana'));
reset role;
do $$ begin
  assert (select paid_until from businesses where slug='spa-luz') <= now(), 'sigue inhabilitado';
  assert (select paid_until from businesses where slug='salon-ana') is null, 'prueba inhabilitada sin fecha de pago';
end $$;

-- ===== Borrado automático de pruebas vencidas hace más de 5 días =====
update businesses set trial_ends_at = now() - interval '6 days' where slug in ('unas-pepe', 'salon-ana', 'spa-luz');
-- Uñas Pepe tiene un comprobante sin revisar: se espera a que se revise
insert into payment_claims (business_id, months, proof_path) select id, 1, id::text || '/c.jpg' from businesses where slug='unas-pepe';
do $$ declare n int; begin
  n := _purge_expired_trials();
  assert n = 1, 'solo se borra Salón Ana, se borraron ' || n;
  assert not exists (select 1 from businesses where slug = 'salon-ana'), 'Salón Ana borrado';
  assert not exists (select 1 from auth.users where id = '44444444-4444-4444-4444-444444444444'), 'su cuenta también';
  assert exists (select 1 from purged_trials where name = 'Salón Ana'), 'queda la ficha para las estadísticas';
  assert exists (select 1 from businesses where slug = 'unas-pepe'), 'con comprobante pendiente no se borra';
  assert exists (select 1 from businesses where slug = 'spa-luz'), 'quien pagó alguna vez no se borra';
  assert exists (select 1 from businesses where slug = 'spa-mar'), 'los que pagan no se tocan';
end $$;
-- Revisado el comprobante (rechazado): a 4 días todavía no se borra, a 6 sí
update payment_claims set status = 'rechazado' where business_id = (select id from businesses where slug='unas-pepe');
update businesses set trial_ends_at = now() - interval '4 days' where slug = 'unas-pepe';
do $$ begin assert _purge_expired_trials() = 0, 'a 4 días todavía no'; end $$;
update businesses set trial_ends_at = now() - interval '6 days' where slug = 'unas-pepe';
do $$ begin assert _purge_expired_trials() = 1, 'ahora sí'; end $$;
set role authenticated;
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
do $$ declare s jsonb := admin_stats(); begin
  assert (s->'totals'->>'purged')::int = 2, 'pruebas borradas: ' || (s->'totals')::text;
  assert (s->'months'->-1->>'signups')::int >= 2, 'las borradas siguen contando como negocios nuevos';
end $$;
select expect_error($$select _purge_expired_trials()$$, 'permission denied');

-- ===== Clientes por turno: solo con el plan Equipo (o en la prueba) =====
reset role;
insert into ctx select 'mar_antes', jsonb_build_object('plan', plan, 'paid', paid_until, 'trial', trial_ends_at, 'cap', slot_capacity, 'comped', comped)::text
  from businesses where slug = 'spa-mar';
update businesses set slot_capacity = 2, plan = 'ultra', paid_until = now() + interval '10 days', comped = false where slug = 'spa-mar';
insert into appointments (business_id, token, starts_at, ends_at, customer_name, customer_phone, status, source)
select id, 'silla1', date_trunc('hour', now()) + interval '300 days', date_trunc('hour', now()) + interval '300 days 1 hour',
       'Silla Uno', '5355550101', 'confirmada', 'manual' from businesses where slug = 'spa-mar';
do $$ declare b uuid := (select id from businesses where slug = 'spa-mar'); t timestamptz := date_trunc('hour', now()) + interval '300 days'; begin
  assert _free_lane(b, null, t, t + interval '1 hour') = 1, 'Equipo: queda la segunda silla';
end $$;
update businesses set plan = 'basico' where slug = 'spa-mar';
do $$ declare b uuid := (select id from businesses where slug = 'spa-mar'); t timestamptz := date_trunc('hour', now()) + interval '300 days'; begin
  assert _free_lane(b, null, t, t + interval '1 hour') is null, 'Solo: una sola silla aunque tenga 2 guardadas';
  assert _free_lane(b, null, t + interval '1 hour', t + interval '2 hours') = 0, 'Solo: la hora siguiente sí está libre';
  assert (select slot_capacity from businesses where id = b) = 2, 'el número guardado se conserva';
end $$;
-- En la prueba gratis (con Equipo) sí puede
update businesses set paid_until = null, trial_ends_at = now() + interval '2 days' where slug = 'spa-mar';
do $$ declare b uuid := (select id from businesses where slug = 'spa-mar'); t timestamptz := date_trunc('hour', now()) + interval '300 days'; begin
  assert _free_lane(b, null, t, t + interval '1 hour') = 1, 'en la prueba: dos a la vez';
end $$;
delete from appointments where token = 'silla1';
update businesses b set plan = x.v->>'plan', paid_until = (x.v->>'paid')::timestamptz, trial_ends_at = (x.v->>'trial')::timestamptz,
       slot_capacity = (x.v->>'cap')::int, comped = (x.v->>'comped')::boolean
  from (select v::jsonb as v from ctx where k = 'mar_antes') x where b.slug = 'spa-mar';
set role authenticated;

-- ===== Dos versiones: Cuba (citora-app.com) e internacional (/int/) =====
do $$ begin
  assert _is_cuban_phone('+53 5 555 1234') and _is_cuban_phone('55551234') and _is_cuban_phone('72041234'), 'números de Cuba';
  assert not _is_cuban_phone('+34600000000') and not _is_cuban_phone('13055551234') and not _is_cuban_phone('5355'), 'números de fuera';
  assert (select count(*) from businesses where market <> 'cu') = 0, 'los negocios de antes son de Cuba';
end $$;
reset role;
insert into auth.users (id, email) values
  ('66666666-6666-6666-6666-666666666666', 'miami@test.com'),
  ('77777777-7777-7777-7777-777777777777', 'cuba@test.com');
set role authenticated;
set request.jwt.claim.sub = '66666666-6666-6666-6666-666666666666';
-- En la versión de Cuba, un WhatsApp de fuera no vale
select expect_error($$select create_business('Nails Miami', 'nails-miami', 'unas', '+1 305 555 1234', '', '#db2777', '[]', '[]')$$, 'WHATSAPP_NO_CUBANO');
select expect_error($$select create_business('Nails Miami', 'nails-miami', 'unas', '+1 305 555 1234', '', '#db2777', '[]', '[]',
  'CUP', false, null, 'otra')$$, 'MERCADO_INVALIDO');
-- En la internacional sí, y con la hora del móvil
select create_business('Nails Miami', 'nails-miami', 'unas', '+1 305 555 1234', '', '#db2777', '[]', '[]',
  'USD', false, null, 'int', 'America/New_York');
do $$ begin
  assert (select market from businesses where slug = 'nails-miami') = 'int', 'negocio internacional';
  assert (select timezone from businesses where slug = 'nails-miami') = 'America/New_York', 'con la hora del móvil';
end $$;
-- Mensualidad en USD: precios de fuera y PayPal en vez de la tarjeta
reset role;
update platform_settings set price_int_basico = 12, price_int_ultra = 25, paypal_client_id = 'AbC-123_x';
set role authenticated;
do $$ declare i jsonb := get_payment_info(); begin
  assert i->>'currency' = 'USD' and (i->>'basico')::numeric = 12 and (i->>'ultra')::numeric = 25, 'precios en USD';
  assert i->>'card_number' = '' and i->>'paypal_client_id' = 'AbC-123_x', 'PayPal y no la tarjeta';
end $$;
-- El pago en línea solo lo hace la función de PayPal (clave de servicio), nunca el navegador
select expect_error($$select online_order_price(my_business_id(), 'ultra', 2)$$, 'permission denied');
select expect_error($$select online_payment_complete('PEDIDO-1', 50, 'USD', 'CAP-1')$$, 'permission denied');
reset role;
do $$ declare b uuid := (select id from businesses where slug = 'nails-miami'); begin
  assert online_order_price(b, 'ultra', 2) = 50, 'precio en USD por meses';
  assert online_order_price(b, 'basico', 3) = 32.40, '3 meses: 10 % menos';
  assert online_order_price(b, 'ultra', 6) = 127.50, '6 meses: 15 % menos';
  insert into online_orders (business_id, provider_order_id, plan, months, amount) values (b, 'PEDIDO-1', 'ultra', 2, 50);
end $$;
select expect_error($$select online_payment_complete('PEDIDO-1', 1, 'USD', 'CAP-1')$$, 'IMPORTE_INVALIDO');
select expect_error($$select online_payment_complete('PEDIDO-X', 50, 'USD', 'CAP-1')$$, 'PEDIDO_NO_EXISTE');
select online_payment_complete('PEDIDO-1', 50, 'USD', 'CAP-1');
select online_payment_complete('PEDIDO-1', 50, 'USD', 'CAP-1');
do $$ declare b uuid := (select id from businesses where slug = 'nails-miami'); begin
  assert (select count(*) from payments where business_id = b) = 1, 'el mismo pago cuenta una sola vez';
  assert (select currency from payments where business_id = b) = 'USD', 'pago en USD';
  assert (select plan from businesses where id = b) = 'ultra', 'con el plan pagado';
  assert (select paid_until from businesses where id = b) > now() + interval '55 days', 'dos meses pagados';
  assert (select status from online_orders where provider_order_id = 'PEDIDO-1') = 'pagada', 'pedido pagado';
end $$;
set role authenticated;
-- El dueño no puede pasarse a la versión de Cuba (ni cambiando su negocio a mano)
update businesses set market = 'cu', name = 'Nails Miami Beach' where slug = 'nails-miami';
do $$ begin
  assert (select market from businesses where slug = 'nails-miami') = 'int', 'la versión no la cambia el dueño';
  assert (select name from businesses where slug = 'nails-miami') = 'Nails Miami Beach', 'lo demás sí';
end $$;
-- Fuera de Cuba se cobra en la moneda del país (EUR, MXN…); una inventada vuelve a USD
update businesses set currency = 'EUR' where slug = 'nails-miami';
do $$ begin assert (select currency from businesses where slug = 'nails-miami') = 'EUR', 'euros fuera de Cuba'; end $$;
update businesses set currency = 'XYZ' where slug = 'nails-miami';
do $$ begin assert (select currency from businesses where slug = 'nails-miami') = 'USD', 'moneda inventada: USD'; end $$;
-- Fuera de Cuba, nada de pesos cubanos ni de "USD y CUP"
update businesses set currency = 'CUP' where slug = 'nails-miami';
update businesses set usd_prices = true, usd_rate = 300 where slug = 'nails-miami';
do $$ begin
  assert (select currency from businesses where slug = 'nails-miami') = 'USD', 'fuera de Cuba, CUP no';
  assert not (select usd_prices from businesses where slug = 'nails-miami'), 'fuera de Cuba, sin cambio a CUP';
end $$;
-- Una zona inventada no vale: la de los ajustes
set request.jwt.claim.sub = '77777777-7777-7777-7777-777777777777';
do $$ begin assert get_payment_info()->>'currency' = 'CUP', 'sin negocio todavía: lo de Cuba'; end $$;
select create_business('Spa Habana', 'spa-habana', 'spa', '53 5 555 7777', '', '#db2777', '[]', '[]',
  'CUP', false, null, 'cu', 'America/New_York');
do $$ begin
  assert (select market from businesses where slug = 'spa-habana') = 'cu', 'negocio de Cuba';
  assert (select timezone from businesses where slug = 'spa-habana') <> 'America/New_York', 'en Cuba no se usa la hora del móvil';
end $$;
-- Un negocio de Cuba no puede cambiar su WhatsApp a uno de fuera (sí a otro de Cuba)
select expect_error($$update businesses set whatsapp = '+34600000000' where slug = 'spa-habana'$$, 'WHATSAPP_NO_CUBANO');
update businesses set whatsapp = '5355558888' where slug = 'spa-habana';
update businesses set currency = 'EUR' where slug = 'spa-habana';
do $$ begin assert (select currency from businesses where slug = 'spa-habana') = 'CUP', 'en Cuba, CUP o USD'; end $$;
do $$ declare i jsonb := get_payment_info(); begin
  assert i->>'currency' = 'CUP' and i->>'card_number' = '9200 1111 2222 3333' and i->>'paypal_client_id' = '', 'Cuba: tarjeta y CUP';
end $$;
set role anon;
do $$ begin
  assert get_public_business('nails-miami')->>'market' = 'int', 'la web sabe su versión';
  assert get_public_business('spa-habana')->>'market' = 'cu', 'la web sabe su versión (Cuba)';
end $$;
-- Solo el administrador cambia la versión
set role authenticated;
select expect_error($$select admin_set_market((select id from businesses where slug = 'spa-habana'), 'int')$$, 'NO_AUTORIZADO');
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
select expect_error($$select admin_set_market((select id from businesses where slug = 'spa-habana'), 'marte')$$, 'MERCADO_INVALIDO');
reset role;
do $$ begin
  assert (admin_stats()->'totals'->>'revenue_usd')::numeric >= 50, 'los USD van aparte';
  assert (admin_stats()->'totals'->>'revenue')::numeric = (select coalesce(sum(p.amount), 0) from payments p
    left join businesses b on b.id = p.business_id where not coalesce(b.comped, false) and p.currency = 'CUP'), 'los CUP sin los USD';
end $$;
set role authenticated;
select admin_set_market((select id from businesses where slug = 'nails-miami'), 'cu');
do $$ begin
  assert (select market from businesses where slug = 'nails-miami') = 'cu', 'el administrador lo pasa a Cuba';
  assert (select whatsapp from businesses where slug = 'nails-miami') = '13055551234', 'aunque su número sea de fuera';
end $$;
reset role;
-- Contraseña provisional: solo el administrador, y con ella se puede entrar
set role authenticated;
set request.jwt.claim.sub = '66666666-6666-6666-6666-666666666666';
select expect_error($$select admin_set_temp_password('77777777-7777-7777-7777-777777777777')$$, 'NO_AUTORIZADO');
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
select expect_error($$select admin_set_temp_password('99999999-9999-9999-9999-999999999999')$$, 'NO_AUTORIZADO');
select admin_set_temp_password('77777777-7777-7777-7777-777777777777') as temp_pass \gset
insert into ctx values ('temp_pass', :'temp_pass');
reset role;
do $$ declare p text := (select v from ctx where k = 'temp_pass'); begin
  assert p ~ '^[a-z2-9]{8}$' and p !~ '[01ilo]', 'contraseña de 8, fácil de dictar: ' || p;
  assert (select encrypted_password = extensions.crypt(p, encrypted_password) from auth.users
          where id = '77777777-7777-7777-7777-777777777777'), 'con esa contraseña se entra';
end $$;
update platform_settings set price_int_basico = 12.50, price_int_ultra = 23.50, paypal_client_id = '';
delete from businesses where slug in ('nails-miami', 'spa-habana');
delete from auth.users where id in ('66666666-6666-6666-6666-666666666666', '77777777-7777-7777-7777-777777777777');
set role authenticated;

-- ===== Depósito con captura y cancelación si no llega =====
reset role;
update businesses set deposit_enabled = true, deposit_amount = 200, deposit_hours = 2 where slug = 'spa-mar';
insert into appointments (business_id, token, starts_at, ends_at, customer_name, customer_phone, status, source, created_at)
select id, 'deptoken1', now() + interval '200 days', now() + interval '200 days 1 hour', 'Con Depósito', '5355550301', 'pendiente', 'web', now()
  from businesses where slug = 'spa-mar';
insert into appointments (business_id, token, starts_at, ends_at, customer_name, customer_phone, status, source, created_at)
select id, 'deptoken2', now() + interval '201 days', now() + interval '201 days 1 hour', 'Sin Depósito', '5355550302', 'pendiente', 'web', now() - interval '3 hours'
  from businesses where slug = 'spa-mar';
insert into ctx select 'mar_id', id::text from businesses where slug = 'spa-mar';
set role anon;
do $$ begin
  assert (get_booking('deptoken1')->'deposit'->>'sent')::boolean = false, 'aún sin captura';
  assert get_booking('deptoken1')->'deposit'->>'deadline' is not null, 'con plazo para subirla';
  assert _deposit_folder_ok((select v from ctx where k = 'mar_id') || '/deptoken1/captura.jpg'), 'puede subir a la carpeta de su cita';
  assert not _deposit_folder_ok((select v from ctx where k = 'mar_id') || '/otro-token/captura.jpg'), 'no a otra carpeta';
end $$;
select expect_error($$select attach_deposit_proof('deptoken1', 'x/deptoken1/a.jpg')$$, 'FALTA_COMPROBANTE');
select attach_deposit_proof('deptoken1', (select v from ctx where k = 'mar_id') || '/deptoken1/a.jpg');
do $$ begin assert (get_booking('deptoken1')->'deposit'->>'sent')::boolean, 'captura recibida'; end $$;
reset role;
do $$ begin
  assert _cancel_unpaid_deposits() = 1, 'se cancela solo la que no subió la captura a tiempo';
  assert (select status from appointments where token = 'deptoken2') = 'cancelada';
  assert (select status from appointments where token = 'deptoken1') = 'pendiente', 'la que la subió sigue';
end $$;
delete from appointments where token in ('deptoken1', 'deptoken2');
update businesses set deposit_enabled = false, deposit_amount = null, deposit_hours = null where slug = 'spa-mar';
set role authenticated;

-- ===== Invita a otro negocio y gana 1 mes =====
reset role;
insert into auth.users (id, email) values
  ('88888888-8888-8888-8888-888888888888', 'invita@test.com'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'invitada@test.com');
set role authenticated;
set request.jwt.claim.sub = '88888888-8888-8888-8888-888888888888';
select create_business('Uñas Invita', 'unas-invita', 'unas', '55558881', '', '#db2777', '[]', '[]');
reset role;
insert into ctx select 'ref_code', code from businesses where slug = 'unas-invita';
insert into ctx select 'ref_trial', trial_ends_at::text from businesses where slug = 'unas-invita';
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select create_business('Uñas Invitada', 'unas-invitada', 'unas', '55558882', '', '#db2777', '[]', '[]',
  'CUP', false, null, 'cu', null, lower((select v from ctx where k = 'ref_code')));
-- El dueño no puede quitarse la invitación ni darse el regalo
update businesses set referred_by = null, referral_rewarded = true where slug = 'unas-invitada';
reset role;
do $$ begin
  assert (select referred_by from businesses where slug = 'unas-invitada') = (select id from businesses where slug = 'unas-invita'), 'invitada por su código';
  assert not (select referral_rewarded from businesses where slug = 'unas-invitada'), 'el regalo aún no';
end $$;
set role authenticated;
set request.jwt.claim.sub = '88888888-8888-8888-8888-888888888888';
do $$ begin
  assert get_my_referrals() = '{"invited": 1, "rewarded": 0}'::jsonb, 'una invitada, sin pagar: ' || get_my_referrals()::text;
end $$;
-- Primer pago de la invitada: un mes más para ella y la prueba de quien invitó se alarga un mes
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
select admin_activate_plan((select id from businesses where slug = 'unas-invitada'), 'basico', 1, 1500);
reset role;
do $$ declare inv uuid := (select id from businesses where slug = 'unas-invitada'); begin
  assert (select paid_until from businesses where id = inv) > now() + interval '55 days', 'pagó 1 mes y le regalan otro';
  assert (select referral_rewarded from businesses where id = inv), 'regalo dado';
  assert (select count(*) from payments where business_id = inv and bonus) = 1, 'el mes regalado queda apuntado';
  assert (select trial_ends_at from businesses where slug = 'unas-invita') >= (select v from ctx where k = 'ref_trial')::timestamptz + interval '1 month',
    'quien invitó (en prueba): un mes más de prueba';
  assert (select count(*) from payments where business_id = (select id from businesses where slug = 'unas-invita')) = 0, 'en prueba no se le apunta un pago';
end $$;
-- Un segundo pago ya no regala nada
set role authenticated;
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
select admin_activate_plan((select id from businesses where slug = 'unas-invitada'), 'basico', 1, 1500);
reset role;
do $$ begin
  assert (select count(*) from payments where business_id = (select id from businesses where slug = 'unas-invitada') and bonus) = 1, 'el regalo es una sola vez';
end $$;
delete from businesses where slug in ('unas-invita', 'unas-invitada');
delete from auth.users where id in ('88888888-8888-8888-8888-888888888888', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
set role authenticated;

-- ===== Borrar dueños =====
reset role;
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select expect_error($$select admin_delete_owner('11111111-1111-1111-1111-111111111111')$$, 'NO_AUTORIZADO');
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
select expect_error($$select admin_delete_owner('22222222-2222-2222-2222-222222222222')$$, 'NEGOCIO_ACTIVO');
select expect_error($$select admin_delete_owner('99999999-9999-9999-9999-999999999999')$$, 'NO_AUTORIZADO');
select admin_delete_owner('11111111-1111-1111-1111-111111111111');
reset role;
do $$ begin
  assert not exists (select 1 from businesses where slug = 'barberia-leo'), 'negocio borrado';
  assert not exists (select 1 from auth.users where id = '11111111-1111-1111-1111-111111111111'), 'cuenta borrada';
  assert not exists (select 1 from appointments where business_id = (select v from ctx where k='biz1')::uuid), 'sus citas también';
  assert (select count(*) from payments where business_id is null and business_name like 'Barbería Leo%') >= 1, 'los pagos se conservan';
end $$;
\echo TODAS LAS PRUEBAS PASARON
