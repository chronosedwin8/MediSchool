# ADR-0007 — Integración Phidias idempotente

**Decisión.** Ver [docs/integrations/phidias.md](../integrations/phidias.md). Resumen: DTO canónico, `integration.external_ids (colegio, fuente, entidad, id externo)` con `content_hash`, omisión de registros sin cambios, `field_ownership` (PHIDIAS/LOCAL/MERGE), bajas lógicas (`source_missing`), conflictos para revisión manual, historial de atenciones importado desde las encuestas 114/113 como registros históricos cerrados.

**Verificación.** Con datos reales (1 175 estudiantes): primera ejecución +1 245 (estructura + estudiantes), segunda ejecución 0 insertados / 0 actualizados / 1 175 omitidos. Prueba automatizada con fixtures.
