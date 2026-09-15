# Runbook — Caída de WhatsApp, SMS o correo

**Síntomas:** Administración → Notificaciones muestra estados `FAILED` o `SUPPRESSED` crecientes.

1. Las notificaciones **en la aplicación** siguen funcionando; los acudientes con la PWA las ven en tiempo real.
2. Revisar el error del proveedor en la lista de envíos (sin contenido clínico).
3. Autorizaciones de salida urgentes: desde la atención use "Copiar enlace" / "WhatsApp" para compartir el enlace firmado manualmente, o llame al acudiente (teléfonos en la ficha de emergencia).
4. Los mensajes fallidos se reintentan hasta 5 veces con espera creciente; al corregir credenciales (`SMTP_*`, `WHATSAPP_*`, `TWILIO_*`) reinicie la API.
5. WhatsApp Cloud API: verificar que el número esté activo y el token vigente; los estados de entrega llegan a `POST /api/v1/webhooks/whatsapp` (`WHATSAPP_VERIFY_TOKEN`).
