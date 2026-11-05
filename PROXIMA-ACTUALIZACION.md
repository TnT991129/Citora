# Próxima actualización: Citora para salones grandes y dos planes

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

## Orden propuesto

1. Agenda en columnas por profesional.
2. Ausencias por profesional.
3. Dividir en Solo / Equipo y lanzar.
4. Después, por este orden: comisiones, precio por profesional, cuentas de trabajadores,
   productos y sucursales.
