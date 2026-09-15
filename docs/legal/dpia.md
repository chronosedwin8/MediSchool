# Evaluación de impacto en protección de datos (DPIA) — plantilla diligenciada

**Responsable:** Colegio (tenant). **Encargado:** operador de MediSchool. **Fecha:** septiembre 2026. **Revisión:** anual o ante cambios relevantes.

## 1. Descripción del tratamiento
Gestión de la enfermería escolar: datos de identificación (Phidias), datos de salud de estudiantes y personal (alergias, condiciones, medicación, atenciones, salud mental), contactos de acudientes, fotografías, trazabilidad de pases y salidas.

**Titulares:** estudiantes menores de edad, acudientes, personal. **Base legal:** autorización expresa del representante legal (datos sensibles), interés vital en emergencias, obligación legal (historia clínica, reportes).

## 2. Necesidad y proporcionalidad
- Minimización: los docentes solo ven "alerta médica" (sin diagnóstico); portería solo identificación y persona autorizada; directivos ven agregados anónimos.
- Mensajes salientes sin información clínica (aviso + enlace firmado).
- Retención definida por perfil legal; datos no clínicos anonimizados por política.

## 3. Riesgos y controles

| Riesgo | Prob. | Impacto | Controles | Residual |
|---|---|---|---|---|
| Acceso entre colegios | Baja | Alto | RLS en PostgreSQL + rol sin bypass + pruebas automáticas | Bajo |
| Acceso indebido interno | Media | Alto | RBAC/ABAC, registro de accesos, alerta de accesos anómalos, MFA | Bajo-medio |
| Alteración de historia clínica | Baja | Alto | Triggers de inmutabilidad, cadena de hash verificable, auditoría encadenada | Bajo |
| Filtración de archivos | Baja | Alto | Cifrado AES-256-GCM, descarga autenticada, validación de tipo, antivirus | Bajo |
| Suplantación en retiro del estudiante | Media | Alto | Confirmación del acudiente por enlace de un solo uso, verificación de documento en portería, restricciones judiciales, firma | Bajo |
| Error de medicación | Media | Alto | 5 correctos, alergias bloqueantes, testigo para controlados, vencidos bloqueados | Bajo |
| Pérdida de datos | Baja | Alto | Respaldos cifrados diarios, prueba de restauración mensual | Bajo |
| Notificaciones con datos sensibles | Baja | Medio | Plantillas revisadas, redacción en auditoría | Bajo |

## 4. Derechos de los titulares
Acceso, rectificación, supresión (con excepción de retención legal de la historia clínica), oposición y portabilidad desde el portal y Administración → Cumplimiento → ARCO.

## 5. Transferencias
Proveedores: AWS (fotos, región us-east-2), Phidias (origen del maestro), proveedores de mensajería configurados. Requieren contrato de transmisión de datos.

## 6. Aprobación
DPO / Oficial de protección de datos: ______ · Médico institucional: ______ · Rectoría: ______
