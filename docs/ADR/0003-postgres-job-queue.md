# ADR-0003 — Cola de trabajos en PostgreSQL

**Contexto.** El plan propone Redis + BullMQ. El entorno objetivo no tiene Redis y el volumen es bajo (decenas de trabajos por minuto).

**Decisión.** Tabla `integration.jobs` con workers que toman trabajos con `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED)`, reintentos exponenciales, `dedupe_key` única para programar sin duplicados (`nombre:colegio:ventana`) y recuperación de trabajos bloqueados. El despachador de notificaciones usa el mismo patrón sobre `comms.notifications`.

Trabajos: `flow.sla` (1 min), `meds.schedule` (60 min), `meds.omissions` (5 min), `inventory.alerts` (60 min), `publichealth.outbreaks` (60 min), `phidias.sync.incremental` (60 min), `phidias.sync.full` (02:00), `phidias.photos` (03:00), `phidias.history` (60 min), `compliance.retention` (01:30), `compliance.access_anomalies` (10 min), `reporting.refresh` (15 min), `stats.scheduled` (06:00), `audit.partitions` (00:10), `system.backup` (01:00, opcional).

**Consecuencias.** Transaccional con los datos (sin doble escritura). Varias instancias de la API pueden correr en paralelo. Si el volumen crece, `JobsService` es la única pieza a reemplazar por BullMQ.
