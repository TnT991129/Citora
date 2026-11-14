# Próxima actualización: rediseño del panel, salones grandes, dos planes y portada nueva

Secciones 1 a 4: ideas acordadas el 5 de noviembre de 2026. Sección 0: rediseño aprobado el
13 de noviembre de 2026 para hacerlo **la semana del 16 de noviembre**, antes que todo lo demás.

## 0. Rediseño: alta, tutorial, panel del dueño y panel de administrador (lo primero)

**Por qué:** casi ningún negocio pasa de la prueba gratis porque no entiende la app y la deja. El
panel está saturado ("Más" tiene 16 entradas), el tutorial de diapositivas no se entiende y nada
lleva al dueño hasta su primera reserva real.

**Referencia visual aprobada:** `prototipo/index.html` (abrir en el navegador; necesita internet).
Cada pantalla trae al lado una nota "Qué cambia". Se puede abrir una pantalla concreta con
`index.html#p-hoy`, `#a-negocios`, `#p-hoy/ordenador` o `#p-hoy/movil/tutorial3`. **Copiar el
diseño de ahí, no reinventarlo.** La web de los clientes no cambia.

### 0.1 Crear la app (`Create.tsx`)

- Mismos 6 pasos. Debajo de la barra de progreso, cuánto falta ("Unos 3 minutos", "Último paso").
- Cada paso con una frase corta de para qué sirve, no párrafos.
- **Botón "Saltar"** debajo de "Siguiente", solo en los pasos que se cambian después:
  - Moneda → "Saltar, uso CUP".
  - Servicios → "Saltar, los reviso después" (se guardan los de ejemplo de su tipo de negocio).
  - Horario → "Saltar, de lunes a sábado de 9:00 a 18:00".
  - Sin saltar: tipo de negocio, nombre/enlace/WhatsApp y cuenta.
- Moneda con 3 opciones grandes y un precio de ejemplo en cada una.
- En "Tu cuenta", recordatorio de lo que dejó para después.
- **Si salta Servicios**, el panel le avisa: "Tus clientes verán los precios de ejemplo. Revísalos
  antes de compartir" (en Primeros pasos, en Mi negocio y en Servicios) hasta que los revise.

### 0.2 Bienvenida (sustituye a "¡Tu app está lista!")

- "Te damos la bienvenida a {negocio}" (en neutro, sin "Bienvenido/a"), con una vista previa de su
  página de reservas.
- Tres botones: **Hacer el tutorial · 2 minutos**, **Ver mi página como un cliente**, **Ahora no,
  ir a mi panel**. El tutorial ya no se abre solo.

### 0.3 Tutorial paso a paso (sustituye a `Tour.tsx`)

Guiado sobre la pantalla real: oscurece todo menos lo que explica, con una tarjeta y una flecha
que lo señala. En los pasos prácticos hay que **tocar el botón de verdad** para seguir (el resto no
se puede tocar) y hay un "Hazlo por mí". Muestra "Paso X de 9" con barra, "Atrás" y "Salir".
Usa **citas de ejemplo**: no confirma ni envía nada real.

1. Antes de empezar: qué va a aprender (4 cosas) y que usa citas de ejemplo.
2. Hoy: cuántas citas y cuánto dinero.
3. El día hora por hora: tarjetas = clientes, recuadros verdes = huecos libres.
4. *Práctico:* tocar **Confirmar** ("Confirmar es decirle al cliente: Sí, te espero").
5. *Práctico:* tocar **+** (Nueva cita, para lo que piden por WhatsApp o teléfono).
6. La hoja de Nueva cita: quién, qué y cuándo.
7. *Práctico:* tocar **Mi negocio**.
8. *Práctico:* tocar **Compartir** ("Tu enlace es como tu tienda en internet").
9. *Práctico:* tocar **Más**.
10. "Ajustes y avisos": activar los avisos en cada móvil.
11. Resumen de lo aprendido y dónde repetirlo (Más → Tutorial paso a paso).

En ordenador cambian los textos ("a la izquierda" en vez de "abajo", "Nueva cita" en vez de "+").
Durante el tutorial, la pantalla no se anima (si no, el resaltado no coincide con el botón).

### 0.4 Panel del dueño

- **Barra de abajo:** Hoy · Agenda · Clientes · **Mi negocio** (nueva) · Más. Servicios sale de la
  barra. Arriba, junto al nombre: "Prueba · 11 días" (lleva a Mensualidad). En ordenador, menú
  lateral con lo mismo y "Nueva cita".
- **Hoy:** resumen en una línea ("4 citas · 2 por confirmar · 8.300 CUP previstos") en vez de 3
  tarjetas; tarjeta **Primeros pasos**; próxima cita; Hoy/Mañana con la línea de tiempo y
  "Publicar huecos"; "Confirmar" en la propia fila; una sola fila "Mañana tienes N citas · Avisar"
  en vez de la lista de recordatorios; botón **+** flotante. La tarjeta del enlace se va a Mi negocio.
- **Primeros pasos** (hasta la primera reserva real, luego desaparece): revisar servicios y precios ·
  ver tu página como un cliente · hacer una reserva de prueba · activar los avisos en este móvil ·
  compartir el enlace en WhatsApp · recibir la primera reserva (se marca sola).
- **Agenda:** tira de la semana con puntos por cita y la misma lista que Hoy.
- **Clientes:** buscador y filtros "Todos · Fieles · Hace tiempo que no vienen · Nuevos". En
  "Hace tiempo que no vienen", botón **Escribirle** con "Te echamos de menos" ya escrito. Ficha
  en hoja: 3 números (visitas, gastado, no vino), notas, WhatsApp y Nueva cita.
- **Mi negocio:** tarjeta del enlace (botón verde **Compartir**, copiar, ver y cuántas personas lo
  abrieron esta semana). Debajo, "Lo que ven tus clientes" (Servicios, Horario, Apariencia) y
  "Cómo trabajas" (Equipo, Reglas de reserva).
- **Servicios:** lista nombre/duración/precio; se edita en una hoja con "Más opciones" plegado
  (foto, descripción, opciones, depósito, extra). Extras en su propia sección.
- **Horario:** un día por fila con interruptor y horas; días cerrados aparte; "Opciones avanzadas"
  plegado (clientes a la misma hora, antelación, tiempo entre citas).
- **Apariencia en dos niveles:** arriba color (10 colores), logo y portada con vista previa en
  vivo; plegado "Personalizar más" con letra, botones, degradado, textos, redes y qué mostrar.
- **Más en modo sencillo:**
  - "Tus herramientas": solo las activas. Al empezar: Recordatorios, Opiniones y Estadísticas.
  - "Más herramientas", cada una con **Activar**: Lista de espera, Cupones, Bonos, Galería,
    Gastos y Respaldo. No se quita nada, solo se esconde.
  - "Tu cuenta": Mensualidad y Ajustes y avisos (con aviso si no están activados).
  - "Ayuda": Tutorial paso a paso y **Hablar con una persona** (tu WhatsApp).
- **Mensualidad:** días que quedan con barra; "En estos días, Citora te trajo: N reservas, N por tu
  enlace, N CUP"; 1/3/6 meses; pago en 3 pasos numerados con la tarjeta para copiar.
- **Ajustes:** "Avisos en este móvil" arriba y grande; instalar el panel; datos del negocio;
  cuenta (modo oscuro y salir).

### 0.5 Panel de administrador

Pestañas: Inicio · Negocios · Cobros (con número de pendientes) · Números · Ajustes. En ordenador,
menú lateral oscuro.

- **Inicio:**
  - "Buenos días, Osmel · Tienes N cosas para hoy".
  - Lista **Para hoy** con un botón cada cosa: comprobantes por revisar, pruebas que acaban,
    **negocios atascados**, vencidos.
  - 4 números: ingreso del mes, pagando, en prueba y **activación**.
  - **Embudo** de 30 días: visitas → apps creadas → primera reserva → pagan.
- **Negocios** (antes "Dueños"):
  - Buscador y filtros Todos · En prueba · Pagando · Vencidos · **Atascados**.
  - Tabla de columnas fijas: negocio (con "Activo hace…" o el aviso de atascado debajo), estado,
    **primeros pasos x/6** y reservas en 30 días.
  - Al tocar un negocio se abre su ficha al lado. A la vista: WhatsApp, Registrar pago, Dar días y
    Ver su página. Plegado: cortesía, zona horaria, inhabilitar y borrar.
- **Cobros:** comprobantes por revisar con la captura, Aprobar y Rechazar; historial en tabla
  (fecha, negocio, meses, importe) y "Registrar pago a mano".
- **Números:** 4 cifras, cobrado por mes, tipos de negocio y visitas por origen (barra de colores).
  Junta Estadísticas y Tráfico.
- **Ajustes:**
  - En ordenador, dos columnas: qué es cada grupo a la izquierda y sus campos a la derecha.
  - Grupos: dónde te pagan, precio y prueba, contacto, encuestas (se mueven aquí) y técnico.
  - "Guardar cambios" arriba.

### 0.6 Lo que necesita base de datos o datos nuevos

- **Primeros pasos por negocio** (para el panel del dueño y la columna x/6 del administrador):
  guardar en el servidor qué pasos tiene hechos cada negocio. Así se ve en cualquier móvil y lo
  ve el administrador. Algunos salen solos de los datos (primera reserva por la web, avisos activados).
- **Negocios atascados:** creados hace más de X días sin reservas, o sin entrar desde hace X días.
  Ampliar `admin_business_activity` con la última entrada del dueño.
- **Herramientas activas** de cada negocio (modo sencillo de "Más"): una columna en `businesses`.
- **Servicios de ejemplo sin revisar:** marcar si saltó ese paso en el alta.
- **Activación y embudo:** eventos nuevos en `analytics.ts` / `track_event`:
  `enlace_compartido`, `avisos_activados`, `primera_reserva_real`, `tutorial_hecho`,
  `paso_saltado`.
- **Mi negocio:** "lo abrieron N personas esta semana" sale de las visitas que ya se miden.

### 0.7 Ya existe y solo cambia de sitio

"Avisar a todos" de los recordatorios de mañana y "Publicar mis huecos" ya están en Hoy
(`Today.tsx`): se mantienen con el diseño nuevo. Lo mismo con los avisos de vencimiento,
el registro de pagos y las encuestas.

## Lo que ya existe (no hay que hacerlo)

Equipo de profesionales con foto, horario y servicios propios; varias citas a la misma hora;
lista de espera; depósitos; paquetes; cupones; gastos y estadísticas del negocio.

## 1. Mejoras para salones grandes (por orden)

1. **Agenda en columnas por profesional.** Una columna por persona para ver quién está libre y
   dónde cabe una cita. *Empezar por aquí.*
2. **Ausencias por profesional.** Vacaciones, día libre o "hoy sale a las 3" de una sola persona,
   sin cerrar todo el negocio (ahora los días y horas cerradas son de todo el negocio).
   *Empezar por aquí también.*
3. **Estadísticas y comisiones por profesional.** Facturado, clientes atendidos y "no vino" de cada
   uno; con un % de comisión por trabajador, lo que hay que pagarle a fin de mes.
4. **Precio distinto según el profesional.** Ej.: el corte con el maestro cuesta más que con el aprendiz.
5. **Cuentas para trabajadores.** La más valiosa, pero la más grande (cambia los permisos de toda
   la base de datos). Hacerla con calma después de las dos primeras.
   - Recepcionista: ve y crea citas de todos; no ve dinero ni ajustes.
   - Profesional: solo sus citas del día y marcarlas como hechas.
   - Dueño: todo.
6. **Venta de productos y cobro en caja.** Cita más productos (champú, cera…) con control sencillo
   de lo que queda.
7. **Varias sucursales con una sola cuenta.** Para cadenas: un dueño, varios locales, cifras juntas.

## 2. Dos planes de precio

Dividir por número de profesionales, no por funciones.

| | **Citora Solo** | **Citora Equipo** |
|---|---|---|
| Para quién | Quien trabaja por su cuenta | Salones, barberías y spas con varios trabajadores |
| Profesionales | 1 | Varios |
| Varias citas a la misma hora | No | Sí |
| Todo lo actual (reservas, WhatsApp, clientes, cobros, cupones…) | Sí | Sí |
| Mejoras para salones de la sección 1 | No | Sí |
| Precio | 1.500 CUP (el actual) | Por ejemplo, entre 3.000 y 3.500 CUP |

Otros nombres posibles: Personal / Negocio, Profesional / Estudio, Uno / Equipo.
Nombre preferido: **Solo / Equipo** (falta que el dueño de Citora lo confirme).

### Reglas para lanzarlo bien

- **No quitarle nada a nadie de golpe.** Los negocios que ya usan varios profesionales pasan a
  Equipo con su precio actual durante unos meses, avisándoles antes.
- **La prueba gratis con el plan Equipo completo.** Al acabar, cada negocio elige su plan.
- **Lanzar los dos planes cuando Equipo tenga al menos dos mejoras nuevas** (agenda por columnas
  y ausencias por profesional). Si no, solo se diferenciaría en "varios profesionales", que ya existe.

### Qué hay que tocar

- Precios de los dos planes en el panel de administrador (la base de datos ya guarda tres precios
  de plan, ahora todos iguales, y tiene `plan_has` para saber qué incluye cada uno).
- Página de inicio y página del plan con dos tarjetas de precio.
- Asistente de crear negocio y aviso de fin de prueba: elegir plan.
- Paso de los negocios actuales a su plan, respetando el precio antiguo.

## 3. Mejoras de las funciones que ya existen

Revisión del panel hecha el 5 de noviembre de 2026. Ordenadas de más a menos útil.

1. **Recordatorios en cadena.** Ahora se pulsa "Enviar" cliente por cliente. Botón **"Avisar a
   todos"**: al volver de WhatsApp se abre el siguiente. Y que el dueño pueda cambiar el texto
   del mensaje.
2. **Recuperar clientes que dejaron de venir.** La ficha ya dice "⏰ 45 días sin venir". Añadir un
   botón **"Escribirle"** con un mensaje tipo "Te echamos de menos" y, si quiere, un cupón.
3. **Lista de espera más rápida.** El aviso "Se liberó un hueco" ya llega al dueño. Que abra la
   lista de espera con un WhatsApp ya escrito: "Se liberó un hueco hoy a las 4:00, ¿lo quieres?".
4. **Pedir opiniones.** Poner el enlace para opinar en el mensaje de "gracias" después de la cita
   (ahora el cliente solo lo ve si entra en "Mis citas").
5. **Control del depósito.** Marcar "depósito recibido" y, si se quiere, cancelar sola la cita si
   no se paga en X horas.
6. **Citas fijas.** Cliente que viene todos los martes o cada 15 días: crear la cita una vez y que
   se repita sola.
7. **Tiempo de limpieza entre citas.** Ej.: 10 minutos tras cada tinte o pedicura, sin poder
   reservar en ese hueco.
8. **Gastos fijos.** Alquiler, luz o internet se apuntan solos cada mes.
9. **Estadísticas comparadas.** "Este mes ganaste un 12 % más que el anterior", servicios que más
   dejan y mejores clientes.
10. **Cumpleaños de clientes.** Guardar la fecha y avisar al dueño ese día para felicitar con descuento.

Las más rápidas y que más se notan: **1, 2 y 4** (no tocan la base de datos o casi nada).

## 4. Portada nueva con animaciones 3D y modernas

Ya tiene animaciones al aparecer, texto que entra palabra a palabra, elementos flotantes y una
cinta de logos (`landing.css` y `motion.ts`), pero nada en 3D.

- **3D con CSS, sin librerías pesadas.** Three.js o similares pesan cientos de KB y van lentos en
  los Android baratos y con datos móviles de Cuba. Con CSS (`perspective`, `rotate3d`) se consigue
  lo mismo casi sin peso.
- Ideas:
  - **Móvil en 3D** con la app de un negocio dentro, que gira al hacer scroll o al mover el dedo.
  - **Tarjetas que se inclinan** siguiendo el dedo o el ratón (servicios, precios, opiniones).
  - **Capas con profundidad** (parallax) en la portada: fondo, móvil y avisos flotando a
    distintas velocidades.
  - **Pasos de "cómo funciona"** que se dan la vuelta como cartas al llegar a ellos.
  - **Contadores animados** (negocios, citas reservadas) y botones con brillo al pasar.
- **Que no se rompa nada:** respetar "reducir movimiento" del móvil, sin 3D en móviles muy lentos,
  y comprobar que la portada sigue cargando rápido (medirlo antes y después).
- No toca la base de datos ni el panel de los negocios: se puede lanzar sola, cuando se quiera.

## Orden propuesto

0. **Semana del 16 de noviembre:** el rediseño de la sección 0. Por partes: alta y bienvenida →
   tutorial → panel del dueño (Hoy, Mi negocio, Más en modo sencillo, Primeros pasos) → panel de
   administrador. La sección 0 ya incluye "Escribirle" a clientes que no vienen (punto 2 de la
   sección 3); "Avisar a todos" (punto 1) ya está hecho.
1. Mejoras rápidas de la sección 3: pedir opiniones.
2. Agenda en columnas por profesional.
3. Ausencias por profesional.
4. Dividir en Solo / Equipo y lanzar.
5. Después, por este orden: resto de la sección 3, comisiones, precio por profesional, cuentas de
   trabajadores, productos y sucursales.
