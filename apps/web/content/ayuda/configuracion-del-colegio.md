---
title: Configuración del colegio
description: Referencia de todos los parámetros de Administración → Configuración, que incluyen datos del colegio, seguridad y sesiones, pases y trazabilidad, medicación y vigilancia, y canales de comunicación, con valores recomendados.
category: administracion
roles: Administrador, Coordinación de enfermería
keywords: configuración, parámetros, tiempo de alerta, duración de sesión, ventana de medicación, brotes, canales, horario de silencio
order: 2
updated: 2026-09-15
---

Abra **Administración → Configuración**. Los cambios aplican a todo el colegio cuando pulsa **Guardar configuración** y quedan registrados en la auditoría.

![Configuración del colegio con tarjetas de seguridad, pases, medicación y canales](/ayuda/capturas/admin-configuracion.jpg "Administración → Configuración")

## Colegio

| Campo | Descripción |
|---|---|
| **Nombre** | Nombre visible en la aplicación, los PDF y los mensajes. |
| **Zona horaria** | Por defecto `America/Bogota`. Define la hora de pases, dosis y reportes. |
| Identificador y perfil legal | Solo lectura. El perfil legal se cambia en *Cumplimiento legal*. |

## Seguridad y sesiones

| Campo | Por defecto | Recomendación |
|---|---|---|
| **MFA obligatorio para roles clínicos y administrativos** | Desactivado | **Actívelo** en producción. |
| **Duración de sesión (min)** | 480 | Entre 240 y 480 según la jornada. |
| **Sesión de kiosco (min)** | 720 | Igual a la jornada de portería. |

## Pases y trazabilidad

| Campo | Por defecto | Efecto |
|---|---|---|
| **Alerta de tránsito (min)** | 10 | *Si el estudiante no llega a enfermería*, avisa al docente y a enfermería. |
| **Vencimiento del pase (min)** | 60 | El pase no atendido pasa a *Vencido*. |
| **Cierre automático tras retorno (min)** | 15 | Cierra el pase si el docente no pulsa *Llegó*. |
| **Reevaluación de observación (min)** | 20 | Valor sugerido al iniciar una observación. |
| **Umbral de consultas frecuentes (30 días)** | 5 | Número de visitas para marcar a un estudiante como consultante frecuente. |

## Medicación y vigilancia

| Campo | Por defecto | Efecto |
|---|---|---|
| **Ventana de la hora correcta (± min)** | 30 | Margen alrededor de la hora programada para administrar la dosis. |
| **Alerta de dosis omitida (min)** | 45 | Aviso si pasada la hora no se registró la dosis. |
| **Exigir fórmula también para medicamentos de venta libre** | Desactivado | Si se activa, toda solicitud de las familias requiere fórmula. |
| **Brotes: ventana (días)** | 7 | Periodo en que se agrupan los casos. |
| **Brotes: casos mínimos** | 3 | Casos del mismo síndrome en un grupo o grado para generar alerta. |
| **Brotes: tasa de ataque (%)** | 10 | Porcentaje de estudiantes afectados del grupo para generar alerta. |

> **Consejo:** si recibe demasiadas alertas de brote en grupos pequeños, aumente los casos mínimos antes que la tasa de ataque.

## Canales de comunicación

- **Correo**, **WhatsApp**, **SMS** y **Push:** active solo los que el colegio tenga contratados y configurados técnicamente (vea *Sistema → Integraciones*). La notificación en la aplicación siempre está activa.
- **Horario de silencio desde / Hasta:** por defecto 20:00 a 06:00. Los avisos no urgentes se retienen; los urgentes siempre se envían.

## Dominio institucional

El colegio tiene registrado su **dominio de correo institucional** (por ejemplo, `colegioaleman.edu.co`). Úselo para todas las cuentas del personal: facilita la verificación de identidad y la recuperación de cuentas.
