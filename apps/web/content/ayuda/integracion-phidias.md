---
title: Integración con Phidias
description: Qué información sincroniza MediSchool desde Phidias, cómo funcionan las sincronizaciones incremental, completa, de fotos e historial, cómo resolver conflictos, qué es la propiedad de los campos y qué hacer si Phidias no responde.
category: administracion
roles: Administrador, Superadministrador
keywords: Phidias, sincronización, estudiantes, fotos, encuestas, conflictos, propiedad de campos, tipo de documento
order: 3
updated: 2026-09-15
---

**Phidias** es la plataforma académica del colegio. MediSchool la usa como **fuente del maestro de estudiantes**, pero guarda su propia copia, de modo que la enfermería funciona aunque Phidias no esté disponible.

## Qué se sincroniza

| Dato | Desde Phidias | Notas |
|---|---|---|
| Secciones, grados y grupos | Sí | Kindergarten, Primaria y Secundaria con sus cursos y grupos. |
| Estudiantes | Sí | Nombres, código, documento, fecha de nacimiento, sexo, grupo y estado de matrícula. |
| Tipo de documento | Sí | **1 → TI** (tarjeta de identidad), **2 → CC** (cédula de ciudadanía), **4 → RC** (registro civil); también CE, pasaporte y PPT. |
| Fotos | Sí (S3) | Se vinculan por el código del estudiante. |
| Historial de atenciones | Sí (encuestas) | Atenciones registradas en las encuestas de enfermería de estudiantes y colaboradores; se importan como registros **históricos** cerrados. |
| Ficha de salud, acudientes, contactos, medicación | **No** | Se gestionan solo en MediSchool y nunca se sobrescriben. |

## Panel de Phidias

Abra **Administración → Phidias**.

![Panel de integración con Phidias con estadísticas, sincronizaciones y conflictos](/ayuda/capturas/admin-phidias.jpg "Administración → Phidias")

- Indicadores: **Estudiantes vinculados**, **Activos**, **Con foto (S3)** y **Atenciones históricas**.
- **Sincronización automática:** interruptor para activar o pausar las tareas programadas.
- Botones de sincronización manual: **Incremental**, **Completa**, **Fotos** e **Historial de encuestas**.
- Tabla de ejecuciones con *Inicio*, *Tipo*, *Estado*, *Nuevos*, *Actualizados*, *Sin cambios*, *Desactivados* y *Errores*.
- **Conflictos por revisar** y **Propiedad de los campos**.

## Tipos de sincronización

| Tipo | Automática | Qué hace |
|---|---|---|
| **Incremental** | Cada hora | Aplica los cambios recientes de estudiantes. |
| **Completa** | Cada noche (02:00) | Revisa todos los estudiantes y **desactiva** a quienes ya no aparecen (retirados). |
| **Fotos** | Cada noche (03:00) | Vincula o actualiza las fotos del bucket de S3. |
| **Historial de encuestas** | Cada hora | Importa atenciones nuevas de las encuestas de enfermería. |

La sincronización es **idempotente**: cada registro se identifica por su ID de Phidias y un resumen de su contenido. Si nada cambió, no escribe nada (verá *Sin cambios*). Ejecutarla dos veces no duplica información.

> **Nota:** si Phidias devuelve cero estudiantes (por ejemplo, por una falla), la sincronización completa se detiene y **no desactiva** a nadie.

## Conflictos

Algunos registros requieren revisión humana:

| Tipo | Significado | Qué hacer |
|---|---|---|
| `MISSING_CODE` | El estudiante no tiene código en Phidias; se asignó uno provisional `PH` + ID. | Solicite a secretaría completar el código en Phidias. |
| `DUPLICATE_CODE` | Dos estudiantes con el mismo código. | Corrija en Phidias. |
| `DUPLICATE_DOCUMENT` | Documento repetido. | Verifique si es la misma persona. |
| `LINKED_BY_DOCUMENT` | Se vinculó un estudiante existente por su documento. | Confirme que es correcto. |
| `APPLY_ERROR` | No se pudo aplicar un cambio. | Revise el detalle y vuelva a sincronizar. |

Después de revisar, pulse **Resuelto** o **Ignorar**.

## Propiedad de los campos

Define quién manda en cada dato:

- **PHIDIAS:** siempre se actualiza desde Phidias.
- **LOCAL:** nunca se sobrescribe.
- **MERGE:** solo se completa si está vacío en MediSchool.

Cámbiela solo si el colegio decide mantener un dato actualizado desde MediSchool en lugar de Phidias.

## Sincronizar un solo estudiante

En la ficha del estudiante, pulse el icono **Sincronizar con Phidias**. Útil cuando secretaría acaba de corregir sus datos.

## Si Phidias no responde

- La operación de enfermería **no se afecta**.
- Las ejecuciones fallidas aparecen con estado *FAILED*. MediSchool reintenta con espera creciente.
- Si el error persiste, verifique con Phidias la vigencia del token de integración.
- Si un estudiante nuevo necesita atención antes de la próxima sincronización, atiéndalo y regularice sus datos después.
