# Runbook — Phidias no disponible

**Síntomas:** sincronizaciones `FAILED` en Administración → Phidias; logs `Phidias respondió 5xx` o `circuito abierto`.

**Impacto:** ninguno en la operación clínica (atenciones, pases, medicación, portería usan la base local). Solo se retrasan altas/bajas de estudiantes y fotos nuevas.

1. Verificar estado: `GET /api/v1/integrations/phidias/status` y los últimos `runs`.
2. Probar el token: `curl -H "Authorization: Bearer $PHIDIAS_TOKEN" "$PHIDIAS_BASE_URL/1/academic/periods"`. `401` → token vencido: solicitar uno nuevo a Phidias y actualizar `PHIDIAS_TOKEN`; reiniciar la API.
3. `429` repetidos → Phidias limita peticiones: esperar; el cliente espacia y reintenta solo.
4. Si un estudiante nuevo debe atenderse antes de la próxima sincronización: registrarlo con la importación CSV o crear la atención como "personal/externo".
5. Al restablecerse: ejecutar sincronización **completa** manual y revisar los conflictos.
6. **Nunca** ejecutar una sincronización completa si Phidias devuelve 0 estudiantes: el sistema la aborta para no desactivar la base.
