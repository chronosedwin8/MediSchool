# ADR-0002 — RLS, rol de aplicación y cadenas de hash en PostgreSQL

**Contexto.** Datos de salud de menores, multi-colegio. El plan exige RLS por `tenant_id`, prohibición de borrado clínico y hash encadenado.

**Decisión.**
1. Prisma genera el esquema base (`0001_init`). Los objetos que Prisma no modela están en migraciones SQL escritas a mano (`0002`–`0004`): políticas RLS, triggers, `CHECK`, índices trigram/parciales/BRIN, partición mensual de `audit_log`, vistas materializadas y funciones `SECURITY DEFINER`.
2. La API se conecta con el rol **`sgee_app` (NOSUPERUSER, NOBYPASSRLS)**. Cada operación corre en una transacción que fija `app.tenant_id` y `app.user_id` (`withTenant`). Un `where` olvidado nunca expone otro colegio.
3. Existe `app.bypass_rls` solo para el planificador de trabajos y la creación de colegios (superadmin). Los puntos de entrada sin sesión (login, refresh, enlaces firmados, invitaciones) usan funciones `SECURITY DEFINER` que devuelven únicamente el identificador del colegio.
4. **Cadenas de hash:** `audit.chain_append(key, payload)` bloquea la cabeza de cadena (`FOR UPDATE`) y calcula `sha256(prev || payload)`. Se aplica a atenciones (al cerrar), adendas, administraciones de medicamentos y auditoría. `clinical.verify_encounter_chain` y `meds.verify_administration_chain` recalculan y detectan alteraciones.
5. **Inmutabilidad:** triggers impiden `DELETE` en `clinical` y `meds`, modificar una atención cerrada salvo para anularla (con motivo ≥ 10 caracteres), insertar signos vitales/diagnósticos en atenciones cerradas y modificar la auditoría. Los diagnósticos pueden reemplazarse mientras la atención está abierta (`0003`).
6. La máquina de estados del pase se valida en la aplicación **y** en la base (`flow.pass_transitions` + trigger).

**Consecuencias.** Las futuras migraciones generadas con `prisma migrate diff` deben revisarse para no revertir estos objetos. Las vistas materializadas no soportan RLS: solo se exponen mediante vistas `security_barrier` filtradas por colegio.
