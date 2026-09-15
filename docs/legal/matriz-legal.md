# Matriz legal por país

Los perfiles están en `packages/shared/src/compliance/profiles.ts` y se copian a `compliance.compliance_profiles` por colegio (editables). Administración → Cumplimiento legal muestra la **matriz calculada con datos reales** (cobertura de consentimientos, SLA ARCO, reportes vencidos, retención, MFA).

## Colombia (perfil por defecto)

| Norma | Requisito | Implementación |
|---|---|---|
| Ley 1581/2012, Decreto 1377/2013 | Autorización previa, expresa e informada; datos sensibles; derechos ARCO | Consentimientos `DATA_PROCESSING` y `HEALTH_DATA` versionados con firma OTP + IP + hash; solicitudes ARCO con SLA 15 días hábiles; exportación de portabilidad |
| Ley 1098/2006 | Interés superior del menor; representante legal; reporte de maltrato | Firma solo por acudiente vinculado; reporte obligatorio `ABUSE_SUSPICION` (ICBF, 24 h) |
| Res. 1995/1999, Res. 866/2021, Res. 839/2017 | Historia clínica reservada, íntegra, cronológica; retención | Registros inmutables con cadena de hash, adendas, anulación con motivo, PDF legal; retención 15 años con revisión, nunca borrado automático |
| Ley 1616/2013 | Confidencialidad en salud mental | Notas cifradas; permiso `mental_health:*` solo psicología/médico; registro de acceso |
| Ley 1355/2009, Ley 2047/2020 | Promoción de hábitos, tamizajes | Antropometría con percentiles OMS, tamizajes visual/auditivo/postural, campañas |
| Res. 3100/2019, Decreto 780/2016 | Habilitación (si aplica) | Inventario con lotes FEFO, cadena de frío, botiquines con verificación periódica |
| Ley 911/2004, Ley 1090/2006 | Ética profesional | Firma del profesional en cada atención; auditoría |
| Decreto 1421/2017 | PIAR, ajustes razonables | `clinical.disabilities_supports` |
| Ley 1523/2012 | Gestión del riesgo | Protocolos de emergencia, simulacros, DEA y brigadistas, mapa de accidentalidad |
| Ley 2300/2023 | Comunicaciones fuera de horario | Horario de silencio por usuario; solo urgencias de salud lo omiten |
| SIVIGILA | Notificación de eventos | Detección de brotes + CSV de vigilancia sindrómica; borrador de reporte obligatorio |

## Otros perfiles

EE. UU. (FERPA/HIPAA/504), UE-Alemania (GDPR art. 9, BDSG, DPIA, derecho de supresión), México (LFPDPPP, NOM-004), Argentina (25.326, 26.529), Chile (21.719, 20.584), Perú (29733), Brasil (LGPD, ECA), España (LOPDGDD, Ley 41/2002). Cada uno define: edad de mayoría, retención, consentimientos obligatorios, venta libre sin fórmula, derechos del titular, SLA y reportes obligatorios.

**Pendiente de validación jurídica** antes de producción en cada país (revisión anual).
