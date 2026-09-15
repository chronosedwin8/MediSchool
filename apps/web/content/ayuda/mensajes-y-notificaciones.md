---
title: Mensajes y notificaciones
description: Cómo funcionan las conversaciones entre enfermería y familias, qué eventos generan notificaciones, por qué canales llegan, el horario de silencio y cómo administrar las plantillas de mensajes.
category: modulos
roles: Enfermería, Padre / Acudiente, Coordinación de enfermería, Administrador
keywords: mensajes con familias, notificaciones, WhatsApp, correo, SMS, push, plantillas, horario de silencio
order: 12
updated: 2026-09-15
---

## Mensajes entre enfermería y familias

Los mensajes son conversaciones **por estudiante** entre enfermería y sus acudientes, dentro de MediSchool.

![Mensajes con la lista de conversaciones y el hilo seleccionado](/ayuda/capturas/mensajes.jpg "Mensajes: una conversación por estudiante")

### Iniciar una conversación

1. Abra **Mensajes** y pulse **Nueva conversación**.
2. Elija el **Estudiante**.
3. Escriba el **Mensaje** y pulse **Enviar**.

### Responder

1. Seleccione la conversación en la lista (si no hay ninguna seleccionada verá *Seleccione una conversación*).
2. Escriba y pulse **Enviar**.

El destinatario recibe la notificación *Nuevo mensaje* por sus canales, **sin el contenido** del mensaje. Las familias también pueden escribir desde una atención con **Escribir a enfermería**.

> **Consejo:** los mensajes son parte de la comunicación oficial. Sea claro y cordial, y para asuntos urgentes llame por teléfono.

## Notificaciones

### Canales

| Canal | Descripción |
|---|---|
| **En la aplicación** | Campana de notificaciones y avisos en pantalla. Siempre activo. |
| **Correo electrónico** | Resumen del aviso con enlace al portal. |
| **WhatsApp** | Mensaje breve con enlace, si el colegio lo habilitó y el usuario registró su número. |
| **SMS** | Para avisos importantes cuando el colegio lo habilita. |
| **Notificaciones push** | En el celular o computador donde se activaron. |

El colegio habilita los canales en *Administración → Configuración* y cada persona elige los suyos en *Mi perfil*.

### Horario de silencio

Entre las horas configuradas (por defecto 20:00 a 06:00) no se envían avisos no urgentes, conforme a la Ley 2300 de 2023 sobre desconexión. Los **urgentes** sí llegan: solicitud de recoger al estudiante, traslado a IPS, código de firma, estudiante que no llegó, reevaluación de observación y nevera fuera de rango.

### Eventos que generan notificaciones

| Evento | Destinatarios |
|---|---|
| Nuevo pase a enfermería | Enfermería y médico |
| Ingreso a enfermería / estudiante no ha llegado | Acudientes / docente y enfermería |
| Atención cerrada | Acudientes |
| Se requiere recoger al estudiante (urgente) | Acudientes autorizados |
| Salida registrada | Acudientes |
| Traslado a centro de salud (urgente) | Acudientes |
| Dosis administrada / no administrada | Acudientes |
| Solicitud de medicamento revisada / medicamento por vencer | Acudientes |
| Consentimiento pendiente / código de firma | Acudientes |
| Actualice la ficha de salud / vacunación pendiente | Acudientes |
| Alerta de salud pública (brote) / circular | Familias del alcance |
| Nuevo mensaje | Participantes de la conversación |
| Reevaluación pendiente, inventario bajo, cadena de frío | Enfermería |
| Consultas frecuentes | Coordinación |

> **Nunca** se incluyen diagnósticos, síntomas ni tratamientos en correo, WhatsApp o SMS. Solo el nombre del estudiante, la novedad general y el enlace.

## Administrar notificaciones (administración)

En **Administración → Notificaciones**:

- Consulte los envíos y fíltrelos por **Estado** (en cola, enviado, fallido, suprimido por horario de silencio).
- Edite las **plantillas**: pulse **Editar**, elija el **Canal**, ajuste **Asunto** y **Mensaje** y pulse **Guardar**.

Las plantillas usan variables entre llaves dobles, por ejemplo `{{studentName}}`, `{{time}}` o `{{pickupName}}`. No agregue información clínica a las plantillas.

Si un canal falla (por ejemplo, el correo), las notificaciones se reintentan automáticamente y siguen llegando a la campana de la aplicación.
