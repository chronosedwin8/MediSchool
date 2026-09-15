---
title: Tablero en vivo y pases a enfermería
description: Cómo funciona el pase digital del aula a la enfermería, qué significa cada columna del tablero en vivo, cómo recibir, atender, cancelar pases y registrar atenciones sin pase.
category: modulos
roles: Enfermería, Médico institucional, Coordinación de enfermería, Docente
keywords: tablero en vivo, kanban enfermería, pase digital, recibir estudiante, código QR, alerta de tránsito, atención sin pase
order: 1
updated: 2026-09-15
---

El **pase** es el registro digital que acompaña al estudiante desde que sale del aula hasta que regresa o sale del colegio. El **Tablero en vivo** es donde enfermería ve todos los pases y atenciones del momento.

## Ciclo de vida del pase

```
Solicitado → En tránsito → Recibido en enfermería → En atención ⇄ En observación
   → Retorno al aula → Cerrado
   → Esperando acudiente → Salida autorizada → Entregado en portería → Cerrado
   → Traslado a IPS → Cerrado
(antes de ser recibido: Cancelado o Vencido)
```

MediSchool valida cada cambio de estado: no es posible saltarse pasos ni que un rol haga un cambio que no le corresponde. Cada cambio queda con fecha, hora y responsable.

## El tablero

![Tablero en vivo con indicadores y columnas](/ayuda/capturas/tablero-enfermeria.jpg "Tablero en vivo de enfermería")

### Indicadores

- **Pacientes abiertos:** estudiantes y personal en proceso.
- **Cerrados hoy.**
- **Tránsito promedio hoy:** minutos entre la solicitud y la llegada.
- **Dosis pendientes:** con el número de atrasadas; tóquelo para ir a *Medicación*.

### Columnas

| Columna | Estados | Acciones |
|---|---|---|
| **En camino** | Solicitado, En tránsito | **Recibir**, **Atender**, **Cancelar** |
| **En sala** | Recibido, En atención (y atenciones sin pase abiertas) | **Atender** / **Abrir atención** |
| **Observación** | En observación | **Abrir atención** |
| **Esperando acudiente** | Esperando acudiente | **Ver salida** |
| **Salida autorizada** | Salida autorizada | **Ver salida** |

### Qué muestra cada tarjeta

- Foto, nombre, grupo y asignatura de la que viene.
- Motivo y **urgencia**: *Baja*, *Media*, *Alta* o *Emergencia* (con borde rojo).
- **Cronómetro**: se pone ámbar al superar el tiempo de alerta de tránsito y rojo al doble.
- Alertas: alergias con riesgo de **anafilaxia** (etiqueta roja), condiciones críticas, **No llegó a tiempo**, **Reevaluar en X min** y el estado de la salida (*Esperando confirmación del acudiente* o *Recoge: nombre*).

El tablero se actualiza en tiempo real (*Conectado en tiempo real*). Al llegar un pase nuevo suena un aviso: *Nuevo estudiante en camino* o *¡Pase de EMERGENCIA!*

## Recibir y atender

### Desde la tarjeta

1. Cuando el estudiante llega, pulse **Recibir** en su tarjeta.
2. Pulse **Atender**. MediSchool crea la atención con el motivo del pase y abre la pantalla de atención. Vea [Atenciones e historia clínica](/ayuda/atenciones-historia-clinica).

También puede pulsar **Atender** directamente: el pase pasa a *En atención*.

### Con el código QR o el código corto

1. Pulse **Recibir por QR / código**.
2. Pulse **Escanear con la cámara** y apunte al QR del pase (en el celular del estudiante o del docente), o escriba el **Código del pase** de 6 caracteres.
3. Pulse **Recibir**.

## Cancelar un pase

Solo mientras está *Solicitado* o *En tránsito* (por ejemplo, el docente se equivocó de estudiante):

1. Pulse **Cancelar** en la tarjeta.
2. Escriba el **motivo de la cancelación** y confirme.

## Alerta de tránsito

Si el estudiante no llega en el tiempo configurado (por defecto 10 minutos), la tarjeta muestra **No llegó a tiempo** y el docente y enfermería reciben la notificación *Estudiante no ha llegado a enfermería*. Verifique con el docente y con portería.

Si el pase no se atiende en el tiempo de vencimiento (por defecto 60 minutos), pasa a *Vencido*.

## Atención sin pase (estudiantes o personal)

Para estudiantes que llegan solos o para docentes y empleados:

1. Pulse **Nueva atención**.
2. Busque al estudiante o, en la pestaña de personal, use **Buscar persona del personal**.
3. Opcional: elija una **Plantilla** (cefalea, dolor abdominal, contusión, trauma craneal, epistaxis, fiebre, crisis asmática, hipoglucemia, crisis convulsiva, reacción alérgica, ansiedad, dismenorrea, herida).
4. Elija el **Tipo** y escriba el **Motivo de consulta**.
5. Pulse **Iniciar atención**.

Las atenciones sin pase aparecen en *En sala* u *Observación* con la etiqueta *sin pase*.

## Lo que ve el docente

El docente sigue el estado de sus pases en **Mi clase → Pases de hoy**, recibe avisos cuando el estudiante llega y cuando regresa, y confirma el regreso con **Llegó**. Vea la [guía para docentes](/ayuda/rol-docente).
