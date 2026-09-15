# Runbook — Respaldo y restauración

**Objetivos:** RPO 15 min (con archivado WAL/PITR en producción) · RTO 4 h · prueba de restauración mensual.

## Respaldo lógico cifrado (incluido)

- Automático a la 01:00 con `BACKUP_ENABLED=true` (`PG_BIN` apunta a los binarios de PostgreSQL). Manual: Administración → Sistema → `system.backup`.
- Resultado: `storage/backups/sgee-AAAA-MM-DD-HH-MM.dump.enc` (pg_dump `-Fc` cifrado AES-256-GCM) + `.sha256`. Se conservan 14.
- Copiar diariamente la carpeta a un almacenamiento externo (S3 con versionado / NAS).

## Prueba mensual

1. Administración → Sistema → **Probar restauración** (descifra y valida firma `PGDMP` y checksum).
2. Restaurar en una base temporal:
   ```bash
   node scripts/restore-backup.mjs storage/backups/<archivo>.dump.enc postgresql://postgres:***@localhost:5432/sgee_restore_test
   ```
3. Verificar: `npm run db:migrate` no aplica nada nuevo, conteos de estudiantes/atenciones, `GET /api/v1/encounters/verify-chain` sin roturas.
4. Registrar la prueba (fecha, duración, responsable) en el acta de seguridad.

## Producción (recomendado)

PostgreSQL con `archive_mode=on` + herramienta PITR (pgBackRest/WAL-G) hacia almacenamiento cifrado; retención 35 días.
