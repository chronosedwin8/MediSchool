---
title: Sistema, tareas programadas y respaldos
description: Cómo leer el estado técnico de MediSchool, verificar integraciones, ejecutar tareas programadas a mano y probar la restauración de los respaldos cifrados.
category: administracion
roles: Administrador, Coordinación de enfermería
keywords: estado del sistema, tareas programadas, respaldos, copia de seguridad, restauración, integraciones, monitoreo
order: 6
updated: 2026-09-15
---

Abra **Administración → Sistema**.

## Indicadores

| Indicador | Qué revisar |
|---|---|
| **Base de datos** | Tamaño y versión de PostgreSQL. |
| **Tiempo activo** | Minutos desde el último reinicio del servidor. |
| **Notificaciones en cola** | Si crece sin bajar, revise el canal de correo o WhatsApp. |
| **Tareas fallidas (24 h)** | Debe estar en 0 (verde). Si no, revise *Últimos errores*. |

## Integraciones

Etiquetas con el estado de cada integración: **Phidias real**, **Fotos S3** (con el bucket), **Archivos** cifrados, **SMTP**, **WhatsApp**, **SMS**, **Push**, **Antivirus** y **Planificador**. Un valor *no* significa que la integración no está configurada en el servidor; solicite su configuración al área de tecnología.

## Tareas programadas

MediSchool ejecuta tareas automáticas en segundo plano:

| Tarea | Frecuencia | Función |
|---|---|---|
| `flow.sla` | Cada minuto | Alertas de tránsito, vencimiento de pases, cierres automáticos y reevaluaciones. |
| `meds.schedule` | Cada hora | Genera la agenda de dosis del día. |
| `meds.omissions` | Cada 5 minutos | Alerta de dosis no registradas. |
| `inventory.alerts` | Cada hora | Stock bajo y vencimientos. |
| `publichealth.outbreaks` | Cada hora | Detección de brotes. |
| `publichealth.frequent` | Periódica | Consultas frecuentes. |
| `compliance.retention` | Diaria | Marca registros con retención cumplida. |
| `compliance.access_anomalies` | Cada 10 minutos | Accesos inusuales a historias clínicas. |
| `reporting.refresh` | Cada 15 minutos | Actualiza los datos de estadísticas. |
| `audit.partitions` | Diaria | Prepara el almacenamiento de auditoría. |
| `system.backup` | Diaria (01:00) | Respaldo cifrado, si está habilitado. |

Pulse el nombre de una tarea para **ejecutarla ahora**; verá el resultado en un mensaje. La lista inferior muestra las últimas ejecuciones con su estado.

## Respaldos cifrados

La tarjeta **Respaldos cifrados** indica si el respaldo diario automático está activo y lista los últimos respaldos con tamaño y fecha.

### Probar la restauración (mensual)

1. Pulse **Probar restauración**.
2. MediSchool descifra el último respaldo y verifica que sea un volcado válido de la base de datos.
3. Verá *Respaldo … verificado: descifra y es un volcado válido* o el motivo del fallo.

> **Importante:** un respaldo que nunca se ha probado no es un respaldo. Registre cada prueba mensual en el acta de seguridad del colegio. Para una restauración real, el área de tecnología sigue el procedimiento técnico documentado.

## Qué hacer si algo falla

| Síntoma | Acción |
|---|---|
| Tareas fallidas mayores a 0 | Lea *Últimos errores*; si es de Phidias, revise [Integración con Phidias](/ayuda/integracion-phidias). |
| Notificaciones en cola crecientes | Verifique las credenciales del canal; las notificaciones en la aplicación siguen funcionando. |
| El tablero dice *Reconectando…* | Verifique la red; si persiste para todos, reporte a tecnología. |
| Planificador en *no* | Las alertas automáticas no se generan: informe de inmediato a tecnología. |
