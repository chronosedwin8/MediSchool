# Runbook — Rotación de secretos

| Secreto | Frecuencia | Procedimiento |
|---|---|---|
| `JWT_SECRET` | Semestral o ante incidente | Cambiar y reiniciar. Invalida access tokens (15 min); los refresh tokens siguen válidos y emiten tokens nuevos. |
| `DB_APP_PASSWORD` | Anual | `ALTER ROLE sgee_app PASSWORD '...'`; actualizar `DATABASE_URL`/`TEST_DATABASE_URL`; reiniciar. |
| `PHIDIAS_TOKEN` | Según vencimiento (el actual expira en 2031) | Solicitar a Phidias; actualizar; ejecutar sincronización incremental. |
| `AWS_ACCESS_KEY_ID/SECRET` | Anual | Crear nueva clave IAM con lectura del bucket de fotos (y escritura del bucket de adjuntos si aplica); actualizar; revocar la anterior. |
| `DATA_ENCRYPTION_KEY` | Ante incidente | Requiere re-cifrado: detener la API, ejecutar un script que descifre con la clave anterior y cifre con la nueva los archivos de `storage/` y `clinical.mental_health_notes.note_enc`, luego iniciar con la nueva clave. Conservar la clave anterior fuera de línea hasta verificar. |
| Credenciales SMTP/WhatsApp/Twilio | Anual | Actualizar variables y reiniciar. |

Tras cualquier rotación: revisar Administración → Sistema e integraciones, y registrar el cambio en la auditoría operativa.
