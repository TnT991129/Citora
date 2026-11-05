# Próxima actualización: salones grandes, dos planes, mejoras del panel y portada nueva

Ideas acordadas el 5 de noviembre de 2026. Aún no hay nada construido.

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

1. Mejoras rápidas de la sección 3: recordatorios en cadena, recuperar clientes y pedir opiniones.
2. Agenda en columnas por profesional.
3. Ausencias por profesional.
4. Dividir en Solo / Equipo y lanzar.
5. Después, por este orden: resto de la sección 3, comisiones, precio por profesional, cuentas de
   trabajadores, productos y sucursales.
