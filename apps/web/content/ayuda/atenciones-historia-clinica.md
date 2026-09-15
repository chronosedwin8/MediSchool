---
title: Atenciones e historia clínica escolar
description: Guía completa para registrar una atención de enfermería en MediSchool. Cubre el motivo, los signos vitales, las notas SOAP, el diagnóstico CIE-10, el reporte de accidente, el tratamiento, la observación, el cierre con firma, las adendas y la anulación.
category: modulos
roles: Enfermería, Médico institucional, Coordinación de enfermería
keywords: historia clínica escolar, registrar atención, SOAP, CIE-10, reporte de accidente, cerrar y firmar, adenda, anular atención, traslado IPS
order: 2
updated: 2026-09-15
---

La **atención** es el registro clínico de cada consulta en enfermería. MediSchool la organiza en una sola pantalla con secciones numeradas, guardado automático y firma al cerrar.

## Cómo se inicia una atención

| Situación | Cómo iniciar |
|---|---|
| El estudiante llega con pase | Tablero en vivo → **Recibir** → **Atender** |
| El estudiante llega sin pase o es personal del colegio | Tablero en vivo → **Nueva atención** |
| Desde la ficha del estudiante | Botón **Atender** |
| Emergencia | Modo emergencia → **Iniciar atención de emergencia** |

Si la atención viene de un pase, el motivo que eligió el docente se copia y MediSchool sugiere la **plantilla** correspondiente.

## La pantalla de atención

![Pantalla de atención con encabezado del paciente, plantilla y secciones numeradas](/ayuda/capturas/atencion-clinica.jpg "Pantalla de atención de enfermería")

### Encabezado del paciente

Muestra foto, código, grupo, edad, grupo sanguíneo, **alergias** y **condiciones** (con un banner rojo si hay riesgo de anafilaxia), y el estado de la atención: *Abierta*, *En observación*, *Cerrada y firmada* o *Anulada*. Otras etiquetas indican si viene de un pase (*Pase ABC123*) o si es un registro *Histórico Phidias*.

Botones: **Ficha** (abre la ficha del estudiante) y **PDF** (descarga la atención).

### Plantilla

Si hay plantilla, verá una tarjeta **Plantilla: nombre** con tres columnas: **Valorar** (lo que debe revisar), **Conducta sugerida** y **Signos de alarma** (en rojo). Los diagnósticos frecuentes de la plantilla aparecen como sugerencias en la sección 4.

## Paso a paso

### 1. Motivo y tipo

- **Motivo de consulta:** ajuste el texto si hace falta.
- **Tipo de atención:** *Enfermedad general*, *Accidente / trauma*, *Salud mental / emocional*, *Control de condición crónica*, *Medicamento programado*, *Curación*, *Valoración*, *Tamizaje*, *Primeros auxilios a personal* o *Seguimiento / llamada*.

Debajo se muestra la hora de ingreso, quién atiende, quién lo remitió y de qué clase venía.

### 2. Signos vitales

1. Escriba los valores medidos: *Temperatura*, *Frecuencia cardiaca*, *Frecuencia respiratoria*, *TA sistólica* y *TA diastólica*, *SatO₂*, *Glucometría*, *Dolor (EVA)* y *Glasgow*.
2. Pulse **Registrar toma**.

Puede registrar varias tomas; aparecen en una tabla con la hora. Los valores fuera del rango esperado para la edad se muestran en **ámbar** (alerta) o **rojo** (crítico). Vea [Signos vitales y crecimiento](/ayuda/signos-vitales-y-crecimiento).

### 3. Valoración (SOAP)

- **S — Subjetivo:** lo que refiere el estudiante.
- **O — Objetivo:** hallazgos del examen.
- **Examen físico por sistemas** (desplegable): para cada sistema pulse **Normal** o escriba el **hallazgo**.

### 4. Diagnóstico (CIE-10)

1. En **Buscar diagnóstico**, escriba el nombre o el código (por ejemplo, *cefalea* o *R51*), o toque una sugerencia de la plantilla (**+ R51 Cefalea**).
2. Si agrega varios, marque uno como **principal**. Use **Quitar** para eliminar uno.
3. Escriba la **A — Valoración / impresión**.

> **Nota:** para cerrar la atención necesita al menos la valoración o un diagnóstico.

### Reporte de accidente

Aparece cuando el tipo es *Accidente / trauma* o *Primeros auxilios a personal*:

- **Lugar:** zona del colegio (salón, parques, polideportivo, canchas, piscinas, pasillos, comedor, transporte, salida pedagógica, etc.).
- **Actividad** (recreo, educación física…), **Mecanismo** (caída, golpe con objeto…) y **Severidad**.
- **Testigos (separados por coma)** y **Docente / personal a cargo**.
- **Se notificó a la aseguradora / póliza**.
- **Reportar como accidente laboral (ARL)** (solo para personal).
- **Acciones preventivas sugeridas:** alimentan el análisis de accidentalidad.

### 5. Conducta y tratamiento

- **P — Plan:** conducta e indicaciones.
- **Tratamientos:** escriba la descripción (por ejemplo, *Compresa fría 15 min*), elija el **Insumo de inventario** y la **Cantidad** si usó uno, y pulse **Agregar**. Los insumos se **descuentan del inventario al cerrar** (lote que vence primero).
- **Reposo (minutos).**
- **Resumen para la familia:** texto breve y sin detalles clínicos sensibles que el acudiente verá en el portal.

### Guardado automático

La barra inferior indica *Autoguardado activo*, *Cambios sin guardar*, *Guardando…* o *Guardado HH:MM*. MediSchool guarda cada 5 segundos; también puede pulsar **Guardar**.

## Observación

1. Pulse **Observación** en la barra inferior.
2. En **Reevaluar en** elija 10, 15, 20, 30, 45 o 60 minutos.
3. Escriba el **Motivo de la observación** y pulse **Iniciar**.

La atención y el pase pasan a *En observación*. La tarjeta del tablero muestra **Reevaluar en X min** y, al cumplirse, se genera la alerta *Reevaluación pendiente*. Para terminar, pulse **Terminar observación** y escriba el resultado de la reevaluación.

## Cerrar y firmar

1. Pulse **Cerrar y firmar**.
2. Elija la **Conducta**:
   - Estudiantes: *Retorno al aula*, *Retiro por acudiente*, *Traslado a IPS* o *Reporte a coordinación*.
   - Personal: *Retorno al puesto de trabajo*, *Envío a casa (personal)* o *Traslado a IPS*.
3. Si es **Traslado a IPS**, complete **IPS de destino**, **Transporte** (*Ambulancia*, *Acudiente*, *Vehículo del colegio* u *Otro*), **Acompañante** y **Motivo del traslado**.
4. Revise el **Resumen para la familia** y la casilla **Notificar a los acudientes** (desactivada por defecto en atenciones de salud mental).
5. Pulse **Firmar y cerrar**.

Verá el aviso *Firmada por … · fecha* y *Registro inmutable (secuencia N, hash …). Las correcciones se registran como adendas.* El pase avanza automáticamente (por ejemplo, a *Retorno al aula*) y la familia recibe el aviso *Atención en enfermería*.

Si eligió **Retiro por acudiente**, se abre la **Autorización de salida**. Vea [Salida con acudiente y portería](/ayuda/salida-con-acudiente-y-porteria).

## Evolución y adendas

En la sección **Evolución y adendas**:

- Mientras la atención está abierta, escriba **notas de evolución**.
- Cuando está cerrada, escriba una **adenda** (corrección o información posterior) y pulse **Agregar**.

Cada nota queda con autor y hora: *Evolución*, *Reevaluación*, *Adenda* o *Anulación*.

## Anular

Solo el médico y la coordinación. Vea [Guía del médico institucional](/ayuda/rol-medico#anular-una-atencion).

## Lista de atenciones

En **Atenciones** encontrará la *historia clínica escolar: registros firmados, inmutables y encadenados*.

1. Filtre con **Buscar** (nombre o motivo), **Desde**, **Hasta** (por defecto la última semana) y **Estado** (*Abierta*, *Observación*, *Cerrada*, *Anulada*).
2. Pulse una fila para abrir la atención.
3. **Verificar integridad** comprueba la cadena de hash de las atenciones firmadas.

## Buenas prácticas de registro

- Registre en el momento, no al final del día.
- Sea objetivo en **O** y específico en **P** (qué, cuánto, cuándo reevaluar).
- No copie diagnósticos en el *Resumen para la familia*; use lenguaje sencillo: *Presentó dolor de cabeza leve, descansó 20 minutos y regresó a clase.*
- Si el estudiante presenta un signo de alarma de la plantilla, considere la observación, la llamada a la familia o el traslado.
