---
title: Cumplimiento legal y auditoría
description: Cómo usar la matriz legal, los perfiles por país, los reportes obligatorios, la retención y los bloqueos legales, el registro de accesos a historias clínicas y la verificación de la cadena de integridad en MediSchool.
category: administracion
roles: Coordinación de enfermería, Administrador
keywords: cumplimiento legal, matriz legal, auditoría, cadena de hash, retención historia clínica, bloqueo legal, reportes obligatorios, accesos
order: 5
updated: 2026-09-15
---

Abra **Administración → Cumplimiento legal**. Tiene seis pestañas: *Matriz legal*, *Consentimientos*, *Solicitudes ARCO*, *Reportes obligatorios*, *Retención y bloqueos* y *Accesos a historias*.

![Cumplimiento legal con la matriz del perfil activo y los perfiles por país](/ayuda/capturas/admin-cumplimiento.jpg "Administración → Cumplimiento legal")

## Matriz legal

Muestra el **Perfil activo** (por defecto, Colombia) con una lista de verificación calculada con los datos reales del colegio. Cada punto aparece con un visto verde o una advertencia y su detalle, por ejemplo la cobertura de consentimientos obligatorios, las solicitudes ARCO vencidas, los reportes pendientes o el uso de verificación en dos pasos.

Debajo encontrará:

- **Normas modeladas:** leyes y resoluciones que aplica el perfil.
- **Reportes obligatorios:** tipo, autoridad y plazo en horas.

### Perfiles por país

La tarjeta **Perfiles por país** lista Colombia, Estados Unidos, Alemania (UE), México, Argentina, Chile, Perú, Brasil y España. Cada perfil define la edad de mayoría, la retención, los consentimientos obligatorios, los derechos del titular y sus plazos. Pulse **Activar** solo si el colegio opera bajo otra legislación.

> **Importante:** los perfiles son una base técnica. Deben ser validados por el asesor jurídico del colegio.

## Reportes obligatorios

Consulte la guía de [coordinación de enfermería](/ayuda/rol-coordinacion-enfermeria#reportes-obligatorios). Cada reporte muestra el tipo, la autoridad, el vencimiento y el estado (*Borrador* o *Radicado*). Use **Marcar como radicado** con el número de radicado.

## Retención y bloqueos

- **Políticas de retención:** cuánto tiempo se conserva cada tipo de información (por ejemplo, historia clínica 15 años) y qué acción se toma al cumplirse.
- **Bloqueos legales:** impiden aplicar la retención a una persona mientras exista un proceso. Pulse **Liberar** cuando termine.
- **Registros con retención cumplida:** lista de registros que cumplieron su periodo y quedaron **marcados para revisión**.

*Los registros clínicos nunca se eliminan automáticamente: al cumplir la retención se marcan para revisión, salvo bloqueo legal.*

## Accesos a historias

Registro de cada vez que alguien abrió información clínica de un estudiante: quién, cuándo, desde dónde y qué consultó. Active el filtro de **accesos fuera de rol** para ver consultas inusuales, por ejemplo de un usuario que no atiende a ese estudiante o fuera del horario habitual. MediSchool analiza estos accesos periódicamente y alerta a la coordinación.

## Auditoría

En **Administración → Auditoría** está el registro de **todas** las acciones relevantes: inicios de sesión, creación y firma de atenciones, anulaciones, cambios de configuración, administración de medicamentos, entregas en portería, exportaciones y más.

![Auditoría con filtros y verificación de la cadena de hash](/ayuda/capturas/admin-auditoria.jpg "Administración → Auditoría")

1. Filtre por **Acción**, **Entidad**, **Desde** y **Hasta**.
2. Pulse **Cargar más** para ver registros anteriores.
3. Pulse **Verificar cadena de hash** para comprobar que ningún registro fue alterado o eliminado.

### ¿Qué es la cadena de hash?

Cada registro de auditoría, cada atención firmada y cada administración de medicamento guarda un código SHA-256 calculado a partir de su contenido y del código del registro anterior. Si alguien modificara un registro directamente en la base de datos, la cadena se rompería y la verificación lo mostraría. La base de datos, además, **impide** borrar o modificar la auditoría y los registros clínicos firmados.

En **Atenciones → Verificar integridad** puede hacer la misma comprobación sobre las atenciones.
