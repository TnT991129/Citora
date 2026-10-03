# Citora · Fase 1

Plataforma para que cualquier negocio con citas cree su propia app de reservas.

- **Portada de Citora** (`/`): presentación, planes y botón "Crear mi app".
- **Creador** (`/crear`): el dueño elige tipo de negocio, nombre, enlace, color, servicios y horario, y crea su cuenta. Empieza su prueba gratis de 3 días con todo incluido.
- **Web de reservas de cada negocio** (`/barberia-leo`): servicios, reservar en 4 pasos, página privada de la cita (cambiar fecha una vez, cancelar, avisar por WhatsApp), "tus próximas citas" guardadas en el móvil.
- **Panel del dueño** (`/panel`): Hoy, Agenda (día y semana), detalle de cita con mensajes de WhatsApp, citas manuales, Servicios, Horario (turnos por día, días cerrados y reglas), Ajustes (logo, color, enlace, políticas) y Plan (cómo pagar).
- **Tu panel de administrador** (`/admin`): lista de negocios, activar plan tras confirmar el pago, dar días de prueba, inhabilitar, y ajustes (tarjeta, WhatsApp, precios, días de prueba).

Cuando termina la prueba o el plan, la app del negocio se inhabilita sola: sus clientes ven "no está recibiendo reservas" y el dueño solo ve la pantalla de pago. No se borra nada.

---

## Puesta en marcha (una sola vez)

### 1. Supabase (base de datos)

1. Entra en [supabase.com](https://supabase.com) y crea un proyecto nuevo llamado `citora` (plan gratis). Guarda la contraseña de la base de datos.
2. Ve a **SQL Editor → New query**, pega todo el contenido de `supabase/schema.sql` y pulsa **Run**. Debe terminar sin errores. Se puede volver a ejecutar sin problema.
3. Ve a **Authentication → Sign In / Providers → Email** y **desactiva "Confirm email"**. Así el dueño entra a su panel al momento. (Si lo dejas activado también funciona: el borrador se guarda y la app se crea cuando confirma el correo, pero el plan gratis envía muy pocos correos por hora).
4. Ve a **Authentication → URL Configuration** y pon en **Site URL** la dirección donde publiques la app (por ejemplo `https://TU-USUARIO.github.io/citora/`). Añade la misma en **Redirect URLs**.
5. Ve a **Project Settings → API** (o **API Keys**) y copia:
   - **Project URL** → será `VITE_SUPABASE_URL`
   - **anon public** (o **Publishable key**) → será `VITE_SUPABASE_ANON_KEY`

### 2. Tu cuenta de administrador

1. En Supabase, **Authentication → Users → Add user → Create new user**: tu correo y una contraseña, con "Auto Confirm User" marcado.
2. En **SQL Editor**, ejecuta (cambiando el correo):
   ```sql
   insert into platform_admins (user_id)
   select id from auth.users where email = 'tu-correo@ejemplo.com';
   ```
3. Cuando la app esté publicada, entra en `/entrar` con ese correo. Irás directo a `/admin`. En **Ajustes** pon tu número de tarjeta, tu WhatsApp (con 53 delante) y revisa precios y días de prueba.

### 3. Publicar en GitHub Pages (gratis)

1. Crea un repositorio nuevo en GitHub llamado `citora`.
2. Sube todos los archivos de esta carpeta, **incluida la carpeta oculta `.github`** (sin ella no se publica sola). No subas `node_modules` ni `.env.local`.
3. En el repositorio: **Settings → Secrets and variables → Actions → New repository secret**, crea dos secretos:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. **Settings → Pages → Source: GitHub Actions**.
5. Ve a la pestaña **Actions**: la acción "Publicar Citora" compila y publica en un par de minutos. Tu app quedará en `https://TU-USUARIO.github.io/citora/`.

Cada vez que subas cambios a `main`, se vuelve a publicar sola.

**Con dominio propio** (por ejemplo `citora.app`): en **Settings → Secrets and variables → Actions → Variables** crea `VITE_BASE` con valor `/`, y configura el dominio en **Settings → Pages**.

---

## Trabajar en tu computadora

```bash
npm install
cp .env.example .env.local   # y pon tus claves de Supabase
npm run dev                  # abre http://localhost:5173
npm run build                # comprueba que todo compila
```

## Cómo cobrar (flujo manual)

1. El dueño va a **Plan**, elige plan y meses, ve tu tarjeta y el importe.
2. Pulsa **Enviar comprobante**: se abre WhatsApp con un mensaje ya escrito (plan, meses, negocio, código, importe) y adjunta la captura.
3. Compruebas que el dinero llegó a tu tarjeta.
4. En `/admin` buscas el negocio por su código, pulsas **Activar plan**, eliges plan y meses y confirmas. Si aún le quedaban meses, se suman al final.

## Seguridad

- Cada tabla tiene reglas RLS: cada dueño solo ve sus datos; los visitantes no leen ninguna tabla directamente.
- Todo lo delicado pasa por funciones en el servidor: reservar, cambiar, cancelar, crear negocio y activar planes. El servidor recalcula siempre precios y duración.
- La base de datos impide dos citas que se solapen en el mismo negocio.
- Límites antiabuso: 2 citas pendientes por teléfono y 3 reservas al día por teléfono en cada negocio.
- El dueño no puede cambiarse el plan, la fecha de pago ni el código: lo bloquea un disparador en la base.
- No hay ninguna clave secreta en el código. La clave "anon/publishable" es pública por diseño.

## Pruebas

- `supabase/test/test.sql`: más de 60 comprobaciones de la base de datos (reservas, solapes, límites, prueba gratis, inhabilitación, activación, permisos).
- `supabase/test/e2e.py`: recorrido completo en el navegador (crear app → reservar → panel → fin de prueba → activar plan).

## Estructura

```
supabase/schema.sql        Base de datos completa (tablas, seguridad, funciones)
src/pages/Landing.tsx      Portada de Citora
src/pages/Create.tsx       Asistente "Crear mi app"
src/pages/public/          Web de reservas de cada negocio
src/pages/panel/           Panel del dueño
src/pages/admin/           Panel de administrador
src/lib/plans.ts           Planes y módulos (qué incluye cada plan)
src/lib/templates.ts       Tipos de negocio y servicios sugeridos
```

## Pendiente para las siguientes fases

- **Fase 2 (Plus):** ficha de clientes, galería de trabajos, opiniones.
- **Fase 3 (Ultra):** complementos, lista de espera, cobros y estadísticas, descuentos, varios empleados, sucursales, recordatorios por email, respaldo.
- **Fase 4:** app instalable en el móvil (PWA) con el icono de cada negocio, avisos de vencimiento por WhatsApp, modo oscuro.
