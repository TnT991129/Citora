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
reset role;
set role anon;
do $$ begin
  assert (get_public_business('barberia-leo')->>'accepting')::boolean;
  assert get_public_business('barberia-leo')->>'plan' = 'plus';
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
-- Un solo plan: cualquier negocio pagando tiene también las estadísticas
do $$ begin assert owner_stats(current_date - 30, current_date) is not null; end $$;
select expect_error('select admin_stats()', 'NO_AUTORIZADO');

set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ begin
  assert (select count(*) from reviews) = 0, 'dueño 2 no ve opiniones ajenas';
  assert (select count(*) from customer_notes) = 0;
  assert (select count(*) from gallery_photos) = 0;
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
  assert (s->'by_plan'->>'plus')::int = 1;
  assert (s->'by_plan'->>'prueba')::int = 1;
  assert jsonb_array_length(s->'months') = 12;
  assert (s->'totals'->>'converted')::int = 1, 'conversión: ' || (s->'totals');
  assert jsonb_array_length(s->'recent_payments') = 2;
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
reset role;
set role authenticated;
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
select admin_deactivate_business((select v from ctx where k='biz1')::uuid);
reset role;
set role anon;
do $$ begin assert not (get_public_business('barberia-leo')->>'accepting')::boolean, 'desactivado'; end $$;
\echo TODAS LAS PRUEBAS PASARON
