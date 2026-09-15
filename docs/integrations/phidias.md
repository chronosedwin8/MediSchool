# Integración con Phidias

- **Base URL:** `https://ds-barranquilla.phidias.co/rest` · autenticación `Authorization: Bearer <PHIDIAS_TOKEN>` (variable de entorno, nunca en código).
- **Cliente:** `apps/api/src/modules/phidias/phidias.client.ts` — timeout 90 s, 3 intentos con backoff exponencial y jitter ante 429/5xx, 400 ms mínimos entre llamadas, circuit breaker (5 fallos → 60 s), caché de 5 min, logs sin cuerpos de respuesta. `PHIDIAS_MOCK=true` usa `apps/api/fixtures/phidias/*.json`.

## Llamadas utilizadas

| Uso | Endpoint | Parámetros | Notas |
|---|---|---|---|
| Estudiantes y estructura | `GET /1/course/consolidate` | `limit=10000` | Jerarquía `grado → curso → sección → estudiantes`. ~2 MB, ~2 s. |
| Historial de atenciones (estudiantes) | `GET /1/poll/consolidate` | `pollId=114` (`POLL_ID_ENFERMERIA`) | Encuesta "Registro de Atenciones en la Sala de Primeros Auxilios – Estudiantes". |
| Historial de atenciones (colaboradores) | `GET /1/poll/consolidate` | `pollId=113` (`POLL_ID_ENFERMERIA_COLAB`) | Cambia cada año escolar: actualizar el `.env`. |

| Directorio de personas | `GET /1/people` | `limit=5000`, `page` | `type`: 1 = estudiante, 2 = colaborador, 3 = familiar. **Incluye `username` y `password`: se descartan al recibirlos y nunca se guardan ni se registran.** |
| Acudientes y contactos de emergencia | `GET /1/people/relatives` | `personId` (configurable con `PHIDIAS_RELATIVES_ENDPOINT` / `PHIDIAS_RELATIVES_PARAM`) | **Requiere que Phidias habilite al token los permisos `Person_Relative_Controller::getRelatives` y `people/details`** (hoy responde 401 `denied`). |

### Acudientes y contactos (`RELATIVES`)

- Se consulta por cada estudiante vinculado (≈ 8 min para 1 200 estudiantes por el espaciado entre llamadas); tarea nocturna `phidias.relatives` a las 02:30, botón *Acudientes y contactos* y al sincronizar un solo estudiante.
- Padres, tutores y familiares marcados como responsables o autorizados para recoger → **acudientes** vinculados al estudiante (`people.guardians` + `student_guardians`). Los demás marcados como contacto de emergencia (con teléfono) → **contactos de emergencia**. Otros familiares no se guardan (minimización).
- Un acudiente creado localmente (invitación) con el mismo documento se **vincula**, no se duplica; sus datos de contacto locales se conservan.
- Propiedad de campos: `student_guardian.relationship` e `isPrimary` = PHIDIAS; `canPickUp` y `judicialRestriction` = LOCAL (una restricción judicial nunca se sobrescribe); `emergency_contact.phone` = PHIDIAS.
- Idempotente por hash; los vínculos que desaparecen de Phidias se desactivan (nunca los creados localmente, ni si Phidias responde vacío para todos).
- El formato de respuesta no está documentado públicamente: el adaptador acepta las variantes habituales y la ejecución guarda en `details.responseKeys` los nombres de campos recibidos para validar el mapeo con datos reales en cuanto se habilite el permiso.
- Permiso denegado: la ejecución queda `FAILED` con `details.reason = PERMISSION_DENIED` y el panel muestra qué permiso solicitar.

Otros endpoints disponibles (áreas, periodos, calificaciones, asistencia `/1/attendance/absence/history/details/general?personId&yearId`) no se usan en v1; la asistencia requiere `yearId` interno.

## Mapeo

| Phidias | SGEE |
|---|---|
| grado `KINDERGARTEN / PRIMARIA / SECUNDARIA` | `core.sections` `PRE / PRI / BAC` |
| curso (`KLASSE 8`) | `core.grades` (`KLASSE-8`) |
| sección (`K8B`) | `core.groups` |
| `student.id` | `integration.external_ids.external_id` (entidad `student`) |
| `code` | `people.students.code` (foto S3 `{code}.jpg`) |
| `document`, `idtype` | documento; `idtype` **1→TI** (tarjeta de identidad), **2→CC** (cédula de ciudadanía), **4→RC** (registro civil) — confirmados por el colegio; 3→CE, 6→PA, 7→PPT inferidos (pendiente de confirmar) |
| `gender` | 1→M, 0→F (verificado con nombres) |
| `birthday` (unix, medianoche Bogotá) | `birth_date` en zona America/Bogota |
| `enrollment.status` | `retirado` → estudiante INACTIVO (`withdrawn`) |
| `_changed` | `source_updated_at` (`0000-00-00` → nulo) |

Encuestas: `Hora y fecha de ingreso` → inicio; `Tipo de Atención` (Enfermedad general/Incidente/Accidente/Llamada de Seguimiento) → tipo; `Motivo de Atención` → motivo; `Descripción` (HTML) → texto plano; `Tipo de Accidente` + `Zona o Juego` → reporte de accidente; `Nombre del medicamento` → tratamiento; `Quien Atiende` → atendido por. Se guardan como atenciones `CLOSED` con `is_historical = true`, `source = PHIDIAS_POLL`, `external_id = pollId:person_id:timestamp`.

## Idempotencia

1. Cada estudiante canónico produce un `content_hash` (SHA-256 de JSON canónico sin marcas de tiempo).
2. Si el hash no cambió → **omitido** (no hay escrituras).
3. Si cambió → se actualizan solo los campos según `integration.field_ownership`: `PHIDIAS` (se sobrescribe), `MERGE` (solo si el valor local está vacío), `LOCAL` (nunca). La ficha de salud, contactos de emergencia y preferencias son siempre locales.
4. Sincronización completa: los vínculos ausentes en Phidias se marcan `missing_since` y el estudiante pasa a INACTIVO (`source_missing`); nunca se borra.
5. Conflictos (`integration.sync_conflicts`): `MISSING_CODE` (se asigna `PH<id>`; 36 casos reales), `DUPLICATE_CODE`, `DUPLICATE_DOCUMENT`, `LINKED_BY_DOCUMENT`, `APPLY_ERROR`.
6. Una segunda ejecución sin cambios termina con 0 insertados, 0 actualizados, 0 desactivados.

## Operación

- Automático: incremental cada hora, completo 02:00, fotos 03:00, historial cada hora (solo si la integración está habilitada en Administración → Phidias).
- Manual: Administración → Phidias, `npm run phidias:sync` (CLI: `node dist/cli/phidias-sync.js --tenant colegio-aleman [students] [photos] [history]`), o `POST /api/v1/integrations/phidias/sync`.
- Caída de Phidias: ver [runbook](../runbooks/caida-phidias.md). La operación clínica no depende de Phidias.
- Respaldo: importación CSV en `POST /api/v1/admin/import/students` (`codigo;documento;nombres;apellidos;fecha_nacimiento;sexo;grupo`).
