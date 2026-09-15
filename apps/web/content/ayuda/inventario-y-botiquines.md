---
title: Inventario, botiquines y cadena de frío
description: Cómo gestionar medicamentos e insumos por lote con salida FEFO. Explica ingresos, consumos y ajustes con doble firma, revisiones periódicas de botiquines y registro de temperatura de la nevera en MediSchool.
category: modulos
roles: Enfermería, Médico institucional, Coordinación de enfermería, Administrador
keywords: inventario enfermería, lotes, FEFO, vencimientos, stock mínimo, botiquín escolar, cadena de frío, nevera, doble firma
order: 8
updated: 2026-09-15
---

Abra **Inventario**. *Lotes con FEFO: se usa primero lo que vence primero; los vencidos quedan bloqueados.*

![Inventario con indicadores y existencias por lote](/ayuda/capturas/inventario.jpg "Inventario y botiquines")

## Indicadores

- **Ítems:** medicamentos e insumos registrados.
- **Stock bajo:** ítems por debajo del mínimo.
- **Por vencer (30 días).**
- **Valor del stock.**

## Existencias

1. Use **Buscar ítem** y el filtro **Tipo** (*Medicamentos e insumos*, *Medicamentos* o *Insumos*).
2. Cada ítem muestra su existencia total, el **mínimo** y etiquetas: **Control**, **Nevera**, **N vencidos bloqueados** y **Vence fecha**. Los ítems con stock bajo tienen borde ámbar.
3. Toque el ítem para ver sus **lotes**: número de lote, ubicación, vencimiento (ámbar si vence pronto, rojo si venció) y cantidad.

### Registrar un ingreso (compra o donación)

1. Pulse **Ingreso** en el ítem.
2. Complete **Lote**, **Vencimiento** (obligatorio para medicamentos), **Cantidad**, **Ubicación**, **Origen** (*Compra*, *Donación* o *Traslado*) y **Costo unitario**.
3. Pulse **Registrar ingreso**.

MediSchool sugiere la ubicación: nevera para refrigerados y gabinete de control para medicamentos de control.

### Consumo automático en las atenciones

Cuando una atención incluye un tratamiento con **Insumo de inventario**, la cantidad se descuenta **al cerrar la atención**, del lote que vence primero. No es necesario registrar esos consumos a mano.

### Registrar un movimiento

En el lote, pulse **Movimiento**:

1. Elija el **Tipo**: *Consumo*, *Vencido (disposición)*, *Averiado*, *Devolución*, *Ajuste positivo* o *Ajuste negativo*.
2. Escriba la **Cantidad** y el **Motivo**.
3. Si es un ajuste, un averiado o un medicamento de control, verá *Requiere doble firma*: otro profesional de salud escribe su **Correo del segundo responsable** y su **Contraseña**.
4. Pulse **Registrar**.

> **Importante:** la doble firma evita pérdidas no justificadas. No comparta su contraseña para firmar por otra persona.

## Botiquines

La pestaña **Botiquines** muestra cada botiquín (por ejemplo, de portería, polideportivo, buses o salidas pedagógicas) con su ubicación, su contenido esperado, la **Última revisión**, la frecuencia (*cada N días*) y el estado **Al día** o **Revisión pendiente**.

### Revisar un botiquín

1. Pulse **Revisar ahora**.
2. Para cada elemento, escriba la cantidad presente (se muestra la esperada) y desmarque **Vigente** si está vencido.
3. Agregue **Observaciones**.
4. Pulse **Guardar revisión**. Verá *Botiquín completo* o *Revisión registrada con faltantes*.

Reponga los faltantes con un **Movimiento** del inventario central.

## Cadena de frío

La pestaña **Cadena de frío** muestra la nevera, su **Rango permitido** (por ejemplo, 2 a 8 °C) y la gráfica de temperatura de los últimos 14 días, con la banda verde del rango.

1. Lea el termómetro de la nevera.
2. Escriba la **Temperatura actual (°C)** y pulse **Registrar**.

Si la lectura está fuera de rango verá *Temperatura fuera de rango: se notificó a coordinación* y se genera la alerta urgente *Cadena de frío*. Revise la integridad de los medicamentos refrigerados antes de usarlos.

> **Consejo:** registre la temperatura al menos dos veces al día (inicio y final de la jornada).

## Movimientos

La pestaña **Movimientos** es el historial completo: **Fecha**, **Ítem**, **Lote**, **Tipo**, **Cantidad** (verde para entradas, rojo para salidas) y **Motivo**. Úsela para conciliar el inventario físico.

## Alertas automáticas

Cada hora MediSchool revisa el inventario y notifica a enfermería:

- *Inventario bajo:* un ítem está por debajo del stock mínimo.
- Vencimientos próximos y lotes vencidos, que quedan bloqueados.
