# PLAN DE TRABAJO — Sistema de Gestión de Enfermería Escolar (SGEE)

> Documento de especificación y plan de ejecución para **Claude Code**.
> Elaborado por un equipo de tres perfiles: **Desarrollador senior (arquitectura y ejecución)**, **Médico pediatra (criterio clínico y legal)** y **Enfermera jefe de enfermería escolar (operación diaria en colegio con preescolar, primaria y bachillerato)**.
> Versión 1.0 — Septiembre 2026

---

## 0. Cómo usar este documento con Claude Code

1. Colocar este archivo en la raíz del repositorio como `PLAN.md` y crear `CLAUDE.md` con la sección **§13 (Convenciones para Claude Code)**.
2. Ejecutar las fases en orden (§12). Cada fase termina con: migraciones aplicadas, tests en verde, `docker compose up` funcional y un commit etiquetado (`v0.1-fase1`, etc.).
3. Nunca avanzar de fase sin cerrar el checklist de la anterior.
4. Toda decisión que se aparte del plan se registra en `docs/ADR/NNNN-titulo.md` (Architecture Decision Record).

---

## 1. Visión y alcance

### 1.1 Objetivo
Software web (PWA, responsive, multi-dispositivo) que centraliza **toda** la operación de la enfermería de un colegio: historia clínica escolar, atenciones, trazabilidad completa del estudiante (aula → enfermería → portería), medicación autorizada por padres, inventario, comunicación con familias, estadísticas y cumplimiento legal, integrado con **Phidias** para maestro de estudiantes/acudientes pero con **base de datos propia en PostgreSQL** como fuente de verdad operativa.

### 1.2 Usuarios (roles)
| Rol | Descripción | Dispositivo típico |
|---|---|---|
| **Enfermero/a** | Opera la enfermería, registra atenciones, medica, comunica | PC / tablet |
| **Médico institucional** | Valida protocolos, revisa casos, firma conceptos | PC |
| **Coordinador de enfermería / Admin salud** | Configura, audita, reportes | PC |
| **Docente** | Emite pase de salida del salón, ve estado del estudiante | Móvil / tablet |
| **Portería / Seguridad** | Valida y registra la salida física del estudiante | Tablet / móvil |
| **Padre / Acudiente** | Recibe notificaciones, autoriza medicación, sube soportes, actualiza datos | Móvil |
| **Directivo / Coordinador de sección** | Consulta estadísticas y alertas de su sección | PC / móvil |
| **Estudiante (opcional, bachillerato)** | Ver su propio pase/QR | Móvil |
| **Administrador TI** | Integraciones, usuarios, backups, auditoría | PC |
| **Superadmin (multi-colegio)** | Gestión de tenants | PC |

### 1.3 Fuera de alcance (v1)
- Facturación a EPS/aseguradoras.
- Telemedicina en vivo.
- Historia clínica hospitalaria completa (CIE-10 sí; codificación de procedimientos CUPS solo opcional).

---

## 2. Principios de diseño (obligatorios)

1. **Seguridad del paciente primero**: alertas de alergias/condiciones críticas visibles siempre, doble verificación en administración de medicamentos (5 correctos), imposibilidad de borrar registros clínicos (solo anular con motivo).
2. **Trazabilidad total**: cada evento tiene quién, cuándo, desde dónde (IP/dispositivo), y queda en `audit_log` inmutable (append-only).
3. **Cero fricción en emergencia**: modo "Emergencia" a un clic que muestra ficha crítica + contactos + protocolo.
4. **Multi-país por configuración**: perfiles de cumplimiento legal (§4) configurables por tenant, no hardcodeados.
5. **Offline-tolerante** en docentes y portería (PWA con cola de sincronización).
6. **Datos mínimos necesarios** (privacy by design), retención configurable, consentimientos versionados.
7. **Idempotencia** en todas las sincronizaciones externas y en todos los endpoints de escritura críticos (`Idempotency-Key`).
8. **Accesibilidad** WCAG 2.1 AA; i18n (es-CO por defecto, es, en, de, pt).

---

## 3. Stack tecnológico

| Capa | Elección | Justificación |
|---|---|---|
| Monorepo | **pnpm workspaces + Turborepo** | Un solo repo: `apps/web`, `apps/api`, `packages/db`, `packages/shared`, `packages/ui` |
| Frontend | **Next.js 15 (App Router) + React 19 + TypeScript** | SSR/RSC, PWA, rutas por rol |
| UI | **Tailwind CSS 4 + shadcn/ui + Radix + lucide-react + Framer Motion** | Limpio, moderno, accesible, animaciones sutiles |
| Estado / datos | **TanStack Query + Zustand** | Cache, optimistic updates, offline |
| Formularios | **react-hook-form + Zod** | Validación compartida front/back |
| Tablas / gráficas | **TanStack Table + Recharts** | Estadísticas interactivas |
| Backend | **NestJS 11 (TypeScript)** | Modular, DI, guards RBAC, OpenAPI |
| ORM | **Prisma 6** (o Drizzle si se prefiere SQL explícito) | Migraciones versionadas |
| Base de datos | **PostgreSQL 16** + extensiones `pgcrypto`, `pg_trgm`, `citext`, `uuid-ossp` | Fuente de verdad |
| Cache / colas | **Redis 7 + BullMQ** | Jobs: sync Phidias, notificaciones, recordatorios |
| Realtime | **WebSockets (Socket.IO) + SSE fallback** | Tablero en vivo de pases |
| Archivos | **S3-compatible (MinIO local / S3 prod)** con URLs firmadas y cifrado en reposo | Soportes médicos |
| Auth | **Keycloak** (OIDC) o **Auth.js + Lucia**; MFA para roles clínicos/admin | SSO opcional con Google Workspace/Microsoft |
| Notificaciones | Email (SMTP/Resend), **WhatsApp Business Cloud API**, SMS (Twilio), Web Push | Adaptador por canal |
| PDF | **@react-pdf/renderer** o Puppeteer | Historia clínica, pases, reportes |
| QR | `qrcode` + `html5-qrcode` | Pases y validación en portería |
| Observabilidad | **OpenTelemetry + Prometheus + Grafana + Loki**; Sentry | Trazas y errores |
| Infra | **Docker Compose** (dev) → **Kubernetes/Helm** o Docker Swarm (prod); Traefik/Caddy con TLS | |
| CI/CD | **GitHub Actions**: lint, typecheck, test, build, migrate, deploy | |
| Testing | **Vitest** (unit), **Supertest** (API), **Playwright** (E2E), **k6** (carga) | |
| Docs | OpenAPI 3.1 auto-generado, Storybook para `packages/ui`, ADRs | |

---

## 4. Marco legal y de cumplimiento (perfiles configurables)

El sistema implementa un **motor de cumplimiento** (`compliance_profiles`) donde cada tenant activa un perfil país y opcionalmente ajustes. Cada perfil define: campos obligatorios, textos de consentimiento, retención, edad de mayoría, requisitos de firma, exportabilidad, y reportes obligatorios.

### 4.1 Colombia (perfil por defecto)
- **Ley 1581 de 2012 y Decreto 1377 de 2013** (Habeas Data): consentimiento informado para tratamiento de datos, datos sensibles (salud) con autorización expresa, derechos ARCO, aviso de privacidad, registro de bases de datos ante SIC.
- **Ley 1098 de 2006** (Código de Infancia y Adolescencia): interés superior del menor, autorización del representante legal, deber de reporte de presunto maltrato/abuso (ruta ICBF).
- **Resolución 1995 de 1999 / Resolución 866 de 2021** (Historia clínica): reserva, integridad, cronología, custodia, retención (mín. 15 años posteriores al último registro según norma vigente — configurable).
- **Ley 1616 de 2013** (Salud mental): protocolos de atención y remisión, confidencialidad.
- **Ley 1355 de 2009** (Obesidad) y **Ley 1801/2016**: promoción de hábitos saludables; **Ley 2047/2020** (lentes) — soporte a tamizajes.
- **Resolución 3100 de 2019 / 1043**: estándares de habilitación si la enfermería se registra como prestador; **Decreto 780 de 2016**.
- **Ley 1090 de 2006 / Ley 911 de 2004** (ética de enfermería y psicología).
- **Decreto 1421/2017** (inclusión, PIAR): campos de apoyos y ajustes razonables.
- **Lineamientos MinEducación / MinSalud para PAE, alergias alimentarias y manejo de emergencias**; Plan Escolar de Gestión del Riesgo (Ley 1523/2012).
- **Ley 2300/2023** (comunicaciones fuera de horario: no notificaciones comerciales — aplica al canal, no a alertas de salud).

### 4.2 Otros perfiles incluidos (base)
| País/Región | Normas clave modeladas |
|---|---|
| **EE. UU.** | HIPAA (si aplica), **FERPA** (registros educativos), leyes estatales de epinefrina y medicación en escuelas, Section 504 / IDEA (planes de salud individualizados IHP/504) |
| **Unión Europea / Alemania** | **GDPR** (art. 9 datos de salud, DPIA, DPO, derecho al olvido con excepciones), BDSG, Schulgesetze por Land (Medikamentengabe con autorización escrita) |
| **México** | LFPDPPP y LGPDPPSO, NOM-004-SSA3-2012 (expediente clínico), Ley General de los Derechos de NNA |
| **Argentina** | Ley 25.326 (datos), Ley 26.529 (derechos del paciente), Ley 26.061 |
| **Chile** | Ley 19.628 → Ley 21.719 (datos personales), Ley 20.584 |
| **Perú** | Ley 29733, Ley 29414 |
| **Brasil** | LGPD (dados sensíveis), ECA |
| **España** | LOPDGDD, Ley 41/2002 (autonomía del paciente), protocolos autonómicos de administración de medicación |

### 4.3 Requisitos transversales derivados
- Consentimiento informado versionado, firmado digitalmente (OTP + IP + timestamp + hash) por el acudiente, con re-consentimiento al cambiar de versión.
- Historia clínica con **anulación, nunca borrado**; cadena de hashes (`prev_hash`, `hash`) por registro clínico.
- Registro de accesos a datos sensibles (quién vio qué historia y cuándo).
- Exportación completa por titular (portabilidad) y proceso de solicitud ARCO con SLA.
- Políticas de retención automáticas con bloqueo legal (legal hold).
- Cifrado en reposo (columnas sensibles con `pgcrypto`) y en tránsito; backups cifrados; DPIA plantilla.
- Reporte obligatorio configurable: enfermedades de notificación (SIVIGILA/equivalente), sospecha de maltrato, accidentes escolares graves.
- Separación clara entre **registro educativo** (asistencia, pase) y **registro clínico** (historia), con permisos distintos.

---

## 5. Módulos funcionales (alcance completo)

### 5.1 Maestro de personas (sincronizado con Phidias)
- Estudiantes (código, documento, nombres, fecha de nacimiento, sexo, sección, grado, grupo, foto, jornada, ruta/transporte, estado matrícula).
- Acudientes/responsables (parentesco, prioridad de contacto, autorizado para recoger, custodia legal, restricciones judiciales).
- Docentes y personal (cargo, sección, director de grupo).
- Contactos de emergencia adicionales (no en Phidias): editables por acudiente con verificación.
- **Personal del colegio como paciente**: docentes y administrativos también reciben atención en enfermería (incidente laboral/ARL).

### 5.2 Ficha de salud escolar (perfil clínico base)
- Grupo sanguíneo/RH, EPS/aseguradora, medicina prepagada, póliza de accidentes escolares, IPS preferida.
- **Alergias** (medicamentos, alimentos, ambientales, insectos, látex) con severidad y reacción; anafilaxia → banderín rojo global.
- **Condiciones crónicas** (asma, diabetes T1, epilepsia, cardiopatías, TDAH, TEA, hemofilia, celiaquía, etc.) con plan de acción individual (IHP).
- Vacunación (esquema PAI Colombia configurable por país), carné escaneado.
- Medicamentos habituales, dispositivos (inhalador, glucómetro, bomba de insulina, EpiPen), restricciones de actividad física.
- Antecedentes quirúrgicos, hospitalizaciones, discapacidad/PIAR, apoyos.
- Datos antropométricos periódicos (peso, talla, IMC, percentiles OMS por edad/sexo — cálculo automático).
- Tamizajes: agudeza visual, auditiva, postural, salud oral, desarrollo (preescolar).
- Documentos adjuntos (certificados, fórmulas, conceptos de especialistas) con vencimiento.
- **Actualización anual obligatoria por el acudiente** (campaña con recordatorios y estado de completitud).

### 5.3 Atenciones (encuentros clínicos)
- Tipos: enfermedad, accidente/trauma, salud mental/emocional, control de crónico, administración de medicamento programado, curación, valoración, tamizaje, primeros auxilios a personal.
- Registro SOAP simplificado + signos vitales (T°, FC, FR, TA, SatO2, glucometría, escala de dolor, Glasgow si trauma), examen físico por sistemas (checklist rápido), diagnóstico **CIE-10/CIE-11** (buscador), conducta, tratamiento aplicado, reposo, observación, remisión.
- Lugar y mecanismo del accidente (para prevención y seguro escolar), testigos, docente a cargo, reporte ARL si es personal.
- Plantillas por motivo frecuente (cefalea, dolor abdominal, contusión, epistaxis, fiebre, crisis asmática, hipoglucemia, crisis convulsiva, reacción alérgica, ansiedad).
- Temporizador de observación con re-evaluación obligatoria.
- Cierre: retorno al aula / retiro por acudiente / traslado a IPS (ambulancia) / atención por personal / reporte a coordinación.
- Firma digital del enfermero (y del acudiente cuando retira).
- Evolución encadenada (hash), anulación con motivo, adjuntos (fotos de lesión con consentimiento).

### 5.4 Trazabilidad del estudiante (flujo aula → enfermería → portería)
Máquina de estados del **Pase de enfermería**:

```
SOLICITADO (docente) → EN_TRÁNSITO → RECIBIDO_ENFERMERÍA → EN_ATENCIÓN
   → [RETORNO_AULA → CERRADO]
   → [ESPERA_ACUDIENTE → AUTORIZADO_SALIDA → ENTREGADO_PORTERÍA → CERRADO]
   → [TRASLADO_IPS → CERRADO]
   → CANCELADO / VENCIDO (con motivo)
```
- **Docente**: en 2 toques crea el pase (estudiante desde su lista, motivo, ¿acompañado?, urgencia). Genera QR/código corto. Ve tiempo transcurrido y estado en vivo.
- **Tiempo de tránsito**: si el estudiante no llega a enfermería en N minutos configurables → alerta al docente, coordinación y enfermería.
- **Enfermería**: tablero kanban en vivo (llegando / en sala / observación / esperando acudiente). Recibe con QR o clic.
- **Salida de la institución**: la enfermera genera **Autorización de salida** → notifica al acudiente autorizado → el acudiente confirma (app/WhatsApp con enlace firmado) quién recoge → **Portería** ve la autorización con foto del estudiante y de la persona autorizada, valida documento/QR, registra hora y firma → estudiante marcado como fuera → cierre.
- Salida sin acudiente (bachillerato, con autorización previa permanente) contemplada y auditada.
- Retorno al aula: notificación al docente de la clase actual; entrega de "constancia de atención" digital.
- Historial de pases por estudiante con tiempos por etapa (SLA) y detección de patrones (ej.: estudiante que sale siempre en la misma asignatura → alerta a orientación).
- Integración con horario (si Untis/Phidias lo exponen) para saber qué docente/clase corresponde en cada franja.

### 5.5 Medicación autorizada en el colegio (MAR — Medication Administration Record)
- El acudiente registra **solicitud de administración de medicamento**: medicamento (buscador con base de datos de nombres genéricos/comerciales), dosis, vía, frecuencia, horarios, fechas inicio/fin, indicación, prescriptor, **fórmula médica adjunta** (obligatoria salvo OTC permitido por perfil), consentimiento firmado.
- Flujo de aprobación: acudiente → enfermería valida (coincidencia fórmula/dosis, fecha vencimiento, integridad del envase, rotulado) → aprobado/rechazado con motivo → activo.
- **Cadena de custodia**: recepción física del medicamento (cantidad, lote, vencimiento, quién entrega, quién recibe), almacenamiento (nevera/estante/controlado), devolución o disposición final.
- Agenda diaria de administración con recordatorios; registro por dosis: hora real, quién administra, verificación **5 correctos** (paciente-QR, medicamento, dosis, vía, hora), observaciones, rechazo/omisión con motivo, efectos adversos.
- Alertas: dosis omitida, medicamento por vencer, cantidad baja, interacción con alergias registradas.
- Medicación de rescate / PRN (salbutamol, epinefrina, glucagón, midazolam bucal, etc.) con plan de acción.
- Autoadministración supervisada (bachillerato) con autorización.
- Reporte mensual al acudiente y constancia de dosis administradas.

### 5.6 Inventario y farmacia de enfermería
- Catálogo de medicamentos e insumos (genérico, presentación, concentración, unidad, ATC opcional, requiere refrigeración, controlado).
- Lotes, fechas de vencimiento (FEFO), ubicaciones, stock mínimo/máximo, alertas.
- Movimientos: entrada (compra, donación, entrega de acudiente), salida (administración, consumo en atención, vencimiento, devolución), ajuste con motivo y doble firma.
- Kit de emergencia / botiquines por sede, sección y salidas pedagógicas con checklist de verificación periódica.
- Control de cadena de frío (registro de temperatura de nevera con alertas; opcional IoT).
- Proveedores, órdenes de compra sencillas, costos.
- Separación **stock institucional** vs **medicamentos de estudiantes** (custodia, no propiedad).

### 5.7 Comunicación con padres/acudientes
- Notificaciones automáticas configurables por evento: ingreso a enfermería, atención registrada (resumen no sensible + enlace seguro), autorización de salida, dosis administrada, dosis omitida, recordatorio de actualización de ficha, medicamento por vencer, vacunación pendiente, brote en el grado.
- Canales: portal/app (PWA), WhatsApp, email, SMS, push. Preferencias por acudiente; horarios de silencio salvo urgencias.
- Mensajería bidireccional simple (hilo por atención) con plantillas y adjuntos.
- Circulares de salud (brotes, campañas, recomendaciones) segmentadas por grado/sección.
- Todo mensaje enviado queda auditado con estado de entrega/lectura.

### 5.8 Salud pública escolar y programas
- Vigilancia epidemiológica: registro de casos por síntoma/diagnóstico, detección automática de **brotes** (umbral por grupo/grado/semana), notificación a directivas y plantilla de reporte a autoridad sanitaria.
- Campañas: vacunación, desparasitación, tamizajes, educación en salud, control de piojos, salud oral.
- Ausentismo por enfermedad: cruce con asistencia (Phidias) y motivos reportados por padres (excusas médicas con adjunto y validación).
- Salidas pedagógicas: generación automática de listado de estudiantes con alertas, medicamentos y contactos + botiquín asignado.
- Programa de manejo de emergencias: protocolos (anafilaxia, convulsión, asma, hipoglucemia, trauma craneal, RCP, atragantamiento), simulacros, ubicación de DEA, brigadistas.

### 5.9 Estadísticas y reportes (dashboard interactivo)
- Atenciones por día/semana/mes, por sección/grado/grupo, por motivo y diagnóstico, por franja horaria, por docente que emite el pase.
- Tiempos: transito, espera, atención, hasta recogida por acudiente.
- Top estudiantes frecuentes (con alerta a orientación escolar), reincidencia.
- Accidentalidad: por lugar (mapa de calor del colegio), actividad, hora; indicadores para el plan de gestión del riesgo.
- Medicación: adherencia, omisiones, medicamentos más administrados.
- Inventario: consumo, costos, vencidos, rotación.
- Cumplimiento: % fichas actualizadas, consentimientos firmados, vacunación al día.
- Filtros dinámicos, drill-down, exportación (CSV/XLSX/PDF), reportes programados por correo, comparación año a año.
- Todo con **agregación anónima** para directivos sin permiso clínico.

### 5.10 Administración y configuración
- Multi-tenant (colegio) y multi-sede; año lectivo y calendario; jornadas; secciones/grados/grupos.
- Usuarios, roles, permisos granulares (RBAC + ABAC por sección), MFA, sesiones, políticas de contraseña.
- Parámetros: tiempos de alerta, umbrales de brote, campos obligatorios, plantillas, textos legales, canales.
- Perfil de cumplimiento (§4), retención, legal hold, solicitudes ARCO.
- Auditoría completa con búsqueda; exportación de logs.
- Integraciones: Phidias, Untis (horarios, opcional), SMTP, WhatsApp, S3, SSO.
- Backups programados, restauración probada, estado del sistema.

---

## 6. Integración con Phidias (idempotente)

### 6.1 Principios
- Phidias es **fuente de origen** del maestro de personas; PostgreSQL local es **fuente de verdad operativa**. Nada en el flujo clínico depende de que Phidias esté disponible.
- Sincronización **idempotente**: cada entidad remota se identifica por `(tenant_id, source='phidias', external_id)`; se aplica *upsert* con `content_hash` para no escribir si nada cambió; se registran `synced_at`, `source_updated_at`.
- Nunca se sobrescriben campos **propiedad local** (ficha clínica, contactos adicionales, preferencias de notificación). Se define un `field_ownership` por campo: `phidias` | `local` | `merge`.
- Bajas: si un estudiante desaparece de Phidias se marca `status=inactive` con `inactive_reason=source_missing`; nunca se elimina (retención legal de historia clínica).

### 6.2 Endpoints / recursos esperados (verificar con la documentación vigente de Phidias y credenciales del colegio)
- Personas: estudiantes, acudientes/responsables, empleados/docentes.
- Relaciones estudiante–acudiente (parentesco, principal, autorizado).
- Estructura académica: sedes, secciones, grados, grupos, año lectivo, director de grupo.
- Contactos: teléfonos, correos, dirección.
- Asistencia (si expuesto), horarios (si expuesto; alternativa Untis).
- Fotos.
- Considerar el manejo de parámetros con nombres tipo `param[...]` y paginación tal como la API de Phidias los expone; documentar cada llamada en `docs/integrations/phidias.md`.

### 6.3 Diseño técnico
- Módulo `integrations/phidias` en NestJS: cliente HTTP con reintentos exponenciales, rate-limit, circuit breaker, timeouts, logging estructurado sin datos sensibles.
- Adaptador → DTO canónico (`CanonicalStudent`, `CanonicalGuardian`, `CanonicalStaff`, `CanonicalGroup`).
- Jobs BullMQ: `sync:full` (nocturno), `sync:incremental` (cada 15–60 min), `sync:one` (bajo demanda desde la UI), `sync:photos`.
- Tabla `sync_runs` (inicio, fin, estado, contadores insert/update/skip/error) y `sync_conflicts` para revisión manual (ej.: dos estudiantes con mismo documento).
- Pantalla de administración: estado de la última sincronización, diferencias detectadas, ejecución manual, mapeo de campos.
- Modo **sandbox/mock** con fixtures para desarrollo sin credenciales.
- Pruebas de contrato (Pact-style) y test de idempotencia: correr `sync` dos veces → cero cambios en la segunda.

---

## 7. Modelo de datos (PostgreSQL) — esquema de referencia

Convenciones: `uuid` PK, `tenant_id` en todas las tablas de negocio (RLS de PostgreSQL activado), `created_at/updated_at/created_by/updated_by`, borrado lógico `deleted_at` solo en tablas no clínicas, `citext` para correos. Esquemas: `core`, `people`, `clinical`, `meds`, `inventory`, `flow`, `comms`, `compliance`, `audit`, `integration`.

### 7.1 core
- `tenants` (colegio), `campuses` (sedes), `academic_years`, `sections` (preescolar/primaria/bachillerato), `grades`, `groups`, `periods`, `calendar_days`, `schedule_blocks`.
- `users`, `roles`, `permissions`, `role_permissions`, `user_roles` (con `scope` = campus/section), `sessions`, `mfa_devices`, `api_keys`.

### 7.2 people
- `persons` (base: documento, nombres, fecha nac., sexo, foto, tipo: student|guardian|staff|external).
- `students` (person_id, código, matrícula, grupo actual, jornada, transporte, estado).
- `guardians` (person_id, ocupación, empresa).
- `student_guardians` (parentesco, es_principal, autorizado_recoger, custodia, orden_prioridad, restricciones).
- `staff` (person_id, cargo, sección, es_docente, es_brigadista).
- `contacts` (person_id, tipo, valor, verificado, principal), `addresses`, `emergency_contacts`.
- `enrollments` (histórico por año lectivo).

### 7.3 clinical
- `health_profiles` (student/staff, grupo sanguíneo, EPS, prepagada, póliza, IPS, versión, completitud, última actualización por acudiente).
- `allergies`, `chronic_conditions`, `care_plans` (IHP/plan de acción: pasos, medicamentos rescate, contactos), `immunizations`, `home_medications`, `devices`, `activity_restrictions`, `surgical_history`, `disabilities_supports`.
- `anthropometrics`, `screenings` (tipo, resultado, remisión).
- `encounters` (atención: tipo, motivo, lugar, mecanismo, docente_a_cargo, inicio/fin, estado, disposición, referral, firmado_por, hash, prev_hash, anulado, motivo_anulación).
- `vital_signs`, `encounter_notes` (SOAP), `encounter_diagnoses` (CIE-10/11), `encounter_procedures`, `encounter_attachments`, `observation_periods`, `referrals` (IPS, ambulancia, hora salida, acompañante).
- `incident_reports` (accidente escolar: formato legal, testigos, seguro, ARL).
- `mental_health_notes` (permisos aún más restringidos, solo psicología/médico).
- `clinical_access_log` (quién abrió qué historia, motivo si es fuera de rol habitual).

### 7.4 meds (medicación de estudiantes)
- `medication_catalog` (genérico, comercial, forma, concentración, vía, ATC, OTC_permitido, controlado).
- `medication_requests` (estudiante, medicamento, dosis, vía, frecuencia/cron, inicio/fin, indicación, prescriptor, estado: draft|submitted|approved|rejected|active|suspended|completed, aprobado_por, consentimiento_id).
- `prescriptions` (adjunto fórmula, fecha, vigencia).
- `medication_custody` (recepción física: cantidad, lote, vencimiento, entregado_por, recibido_por, ubicación, devuelto/dispuesto).
- `medication_schedule` (dosis programadas generadas), `medication_administrations` (dosis real: hora, administrado_por, verificación_5C json, resultado: given|refused|omitted|held, motivo, efectos_adversos, testigo).
- `prn_orders` (rescate) y `prn_administrations`.

### 7.5 inventory
- `items`, `item_batches` (lote, vencimiento, cantidad), `locations` (botiquín/nevera/estante), `stock_levels`, `stock_movements` (tipo, cantidad, referencia encounter/administration, doble_firma), `suppliers`, `purchase_orders`, `kits`, `kit_checks`, `fridge_temperature_logs`.

### 7.6 flow (trazabilidad)
- `passes` (estudiante, emitido_por docente, clase/asignatura, motivo, urgencia, acompañante, código_qr, estado, timestamps por estado, sla_breaches json).
- `pass_events` (transiciones con actor, dispositivo, geo/IP).
- `exit_authorizations` (pass_id, autorizado_por enfermera, acudiente_notificado, acudiente_confirmó, persona_que_recoge (person_id o datos + doc + foto), hora_confirmación, token_firmado).
- `gate_checkouts` (portería: validado_por, hora, método (QR/documento/manual), firma, foto opcional, observaciones).
- `standing_exit_permissions` (autorización permanente para salir solo).

### 7.7 comms
- `notification_templates` (evento, canal, idioma, cuerpo), `notification_preferences`, `notifications` (destinatario, canal, estado: queued|sent|delivered|read|failed, proveedor_id), `message_threads`, `messages`, `circulars`, `circular_recipients`.

### 7.8 compliance
- `compliance_profiles` (país, reglas json), `consent_templates` (versión, texto, vigencia), `consents` (titular, acudiente, tipo, versión, firma: otp/ip/ua/hash, estado, revocación), `data_subject_requests` (ARCO), `retention_policies`, `legal_holds`, `mandatory_reports` (SIVIGILA/maltrato/etc.).

### 7.9 audit / integration
- `audit_log` (append-only, particionada por mes: actor, acción, entidad, antes/después redactado, ip, ua, request_id, hash).
- `external_ids` (entidad local ↔ source, external_id, content_hash, synced_at), `sync_runs`, `sync_conflicts`, `field_ownership`, `webhook_events`.

### 7.10 Reglas de integridad clave
- RLS por `tenant_id` en todas las tablas; políticas adicionales por sección para directivos.
- Triggers: hash encadenado en `encounters`/`medication_administrations`; prohibición de `DELETE` en esquemas `clinical`, `meds`, `audit`.
- `CHECK` en dosis (>0), fechas (fin ≥ inicio), estados válidos (enum + tabla de transiciones permitidas).
- Índices: `pg_trgm` en nombres, parciales por estado activo, BRIN en `audit_log.created_at`.
- Vistas materializadas para dashboard (`mv_encounters_daily`, `mv_pass_times`, `mv_outbreak_signals`) refrescadas por job.

---

## 8. API (NestJS) — diseño

- REST versionada `/api/v1`, OpenAPI 3.1, respuestas `application/problem+json` en errores.
- Autenticación OIDC (Bearer JWT), `X-Tenant-Id` derivado del token, `Idempotency-Key` obligatorio en POST críticos (`/passes`, `/encounters`, `/administrations`, `/gate-checkouts`).
- Guards: `RolesGuard`, `ScopeGuard` (sección/sede), `ClinicalAccessGuard` (registra acceso a historia), `ConsentGuard` (bloquea acciones sin consentimiento vigente).
- Paginación por cursor, filtros tipados con Zod, rate limiting por rol.
- WebSocket namespace `/live`: rooms por tenant/sede/rol (`nursing:board`, `gate:queue`, `teacher:{id}`).
- Webhooks salientes (opcional) para SIS u otros sistemas.

### 8.1 Recursos principales
`/students`, `/students/{id}/health-profile`, `/students/{id}/timeline`, `/encounters`, `/passes`, `/passes/{id}/transition`, `/exit-authorizations`, `/gate-checkouts`, `/medication-requests`, `/medication-schedule/today`, `/administrations`, `/inventory/items|batches|movements|kits`, `/notifications`, `/threads`, `/circulars`, `/consents`, `/dsr` (ARCO), `/reports/*`, `/stats/*`, `/admin/*`, `/integrations/phidias/sync`.

---

## 9. UI / UX (limpia, moderna, intuitiva, dinámica)

### 9.1 Sistema de diseño
- Paleta: base neutra (blancos/grises cálidos), color primario azul-verde salud, semánticos: rojo (alergia/anafilaxia/urgente), ámbar (advertencia/observación), verde (ok/cerrado), violeta (salud mental). Modo claro/oscuro.
- Tipografía: Inter (UI) + números tabulares para signos vitales. Espaciado 4/8 pt. Bordes 12 px, sombras suaves, sin ruido visual.
- Componentes: `packages/ui` (shadcn) con Storybook: `PatientHeader` (foto, alertas rojas siempre visibles), `VitalsInput` (teclado numérico, rangos por edad con coloreado automático), `StatusTimeline`, `KanbanBoard`, `QRScanner`, `SignaturePad`, `FileDropzone` (cámara móvil), `CommandPalette` (⌘K para buscar estudiante/acción), `EmptyState`, `Toast`, `Skeleton`.
- Microinteracciones con Framer Motion (transiciones de estado del pase, confirmaciones), sin animaciones bloqueantes.
- Accesibilidad: foco visible, contraste AA, navegación por teclado, lectores de pantalla, tamaños táctiles ≥44 px.

### 9.2 Vistas por rol
- **Enfermería — Tablero en vivo**: columnas (En camino / En sala / Observación / Esperando acudiente), tarjetas con cronómetro y banderas, botón **EMERGENCIA** fijo, búsqueda ⌘K, agenda de medicación del día a la derecha, alertas de inventario.
- **Atención**: flujo en una sola pantalla con secciones colapsables (motivo → signos → valoración → diagnóstico → conducta → cierre), plantillas rápidas, autosave cada 5 s, resumen para el padre generado automáticamente y editable antes de enviar.
- **Docente (móvil)**: lista de mi clase actual → tocar estudiante → motivo (chips) → enviar. Ve estado en vivo y recibe aviso de retorno.
- **Portería (tablet)**: cola de salidas autorizadas con foto grande del estudiante y de quien recoge, escáner QR, botón "Entregado" con firma. Modo kiosco.
- **Padres (PWA)**: inicio con estado de hoy, hijos, ficha de salud con % completitud, solicitudes de medicación (wizard 4 pasos con carga de fórmula desde cámara), historial, mensajes, consentimientos pendientes.
- **Directivos**: dashboard con KPIs y gráficas interactivas (Recharts), filtros persistentes, exportar.
- **Admin**: configuración por tarjetas, estado de integraciones, auditoría con filtros.
- **Estudiante**: tarjeta con QR de su pase activo.

### 9.3 Estados especiales
- Offline: banner, acciones encoladas, reintento automático.
- Cargas: skeletons, nunca spinners bloqueantes de página completa.
- Errores: mensajes accionables, código de referencia para soporte.

---

## 10. Seguridad

- OIDC + MFA (obligatorio para enfermería, médico, admin), sesiones cortas en dispositivos compartidos (portería: kiosco con PIN).
- RBAC + ABAC, RLS en PostgreSQL, principio de mínimo privilegio, permisos revisables en UI.
- Cifrado: TLS 1.3; columnas sensibles con `pgcrypto`; archivos cifrados (SSE-S3/KMS); secretos en Vault/variables cifradas.
- Enlaces a padres: tokens firmados de un solo uso con expiración; nunca datos clínicos en el cuerpo del mensaje, solo resumen mínimo + enlace.
- OWASP ASVS L2: validación de entrada, CSP, CSRF, cabeceras, límites de tamaño, antivirus en cargas (ClamAV), tipos MIME verificados.
- Auditoría inmutable, alertas por accesos anómalos (muchas historias en poco tiempo).
- Backups diarios cifrados, PITR, prueba de restauración mensual, RPO 15 min / RTO 4 h.
- Pentest antes de salir a producción; dependabot; SBOM.

---

## 11. Calidad, pruebas y operación

- Cobertura mínima 80 % en dominio (`clinical`, `meds`, `flow`).
- Pruebas obligatorias: máquina de estados del pase (todas las transiciones válidas/inválidas), 5 correctos, idempotencia de sync y de POST críticos, RLS (un tenant no ve otro), consentimiento bloquea acciones, cadena de hashes, retención/legal hold.
- E2E Playwright: flujo completo docente → enfermería → padre → portería; flujo de solicitud y administración de medicamento; flujo de emergencia.
- Carga k6: 300 usuarios concurrentes, tablero en vivo con 200 pases/hora.
- Seed realista (faker, es-CO) con 1 500 estudiantes, 3 secciones, 120 docentes.
- Logs estructurados (pino), trazas OTel, métricas de negocio (pases abiertos, SLA, dosis pendientes).
- Runbooks: caída de Phidias, caída de WhatsApp, restauración, rotación de secretos.

---

## 12. Plan de ejecución por fases (para Claude Code)

Cada fase incluye: código, migraciones, seeds, tests, docs, y checklist de aceptación.

### Fase 0 — Fundaciones (1–2 semanas)
- Monorepo, Docker Compose (Postgres, Redis, MinIO, Keycloak, Mailpit), CI, lint/format, Prisma schema base (`core`, `people`, `audit`), auth OIDC, RBAC, multi-tenant con RLS, `audit_log`, `packages/ui` con design tokens y Storybook, layout por rol, i18n.
- ✅ Login con roles, tenant aislado, auditoría funcionando, pipeline verde.

### Fase 1 — Maestro de personas + Phidias (1–2 semanas)
- Módulo Phidias (cliente, DTOs, jobs, idempotencia, conflictos, mock), pantallas de estudiantes/acudientes/docentes, búsqueda ⌘K, fotos, `field_ownership`.
- ✅ Sync completo e incremental; segunda ejecución = 0 cambios; UI de estado.

### Fase 2 — Ficha de salud + consentimientos (2 semanas)
- `clinical` (perfil, alergias, crónicos, planes de acción, vacunas, antropometría, tamizajes), `compliance` (perfiles, consentimientos con firma OTP), portal de padres v1 (actualizar ficha, firmar consentimientos, subir soportes), campaña anual.
- ✅ Padre completa ficha; alertas rojas en `PatientHeader`; percentiles OMS.

### Fase 3 — Atenciones clínicas (2 semanas)
- `encounters` completos, SOAP, signos vitales con rangos por edad, CIE-10/11, plantillas, observación, disposición, remisión, incidentes/accidentes, firma, hash encadenado, anulación, PDF de historia, resumen al padre.
- ✅ Atención completa auditada e inmutable; PDF legal; notificación al acudiente.

### Fase 4 — Trazabilidad aula → enfermería → portería (2 semanas)
- `flow`: pases con máquina de estados, app docente móvil, tablero en vivo (WebSockets), QR, SLA y alertas, autorización de salida, confirmación del acudiente por enlace firmado/WhatsApp, kiosco de portería, permisos permanentes, offline queue.
- ✅ E2E completo con tiempos por etapa y notificaciones.

### Fase 5 — Medicación autorizada (MAR) (2 semanas)
- Solicitudes por padres (wizard), aprobación, custodia, agenda, administración con 5 correctos, PRN, alertas, reporte mensual, autoadministración supervisada.
- ✅ Ciclo completo solicitud → dosis → constancia; omisiones alertadas.

### Fase 6 — Inventario y botiquines (1–2 semanas)
- Catálogo, lotes FEFO, movimientos, kits, cadena de frío, proveedores, alertas, vínculo con atenciones/administraciones.
- ✅ Stock exacto tras consumo clínico; vencidos bloqueados.

### Fase 7 — Comunicación multicanal (1–2 semanas)
- Adaptadores (email, WhatsApp Cloud API, SMS, push), plantillas, preferencias, hilos, circulares, estado de entrega, horarios de silencio.
- ✅ Cada evento configurable dispara notificación auditada.

### Fase 8 — Salud pública, estadísticas y reportes (2 semanas)
- Vigilancia y brotes, campañas, ausentismo, salidas pedagógicas, dashboards interactivos, mapa de calor de accidentes, reportes programados, exportaciones, reportes legales (SIVIGILA/incidente).
- ✅ Dashboard por rol con drill-down y datos anonimizados para directivos.

### Fase 9 — Cumplimiento avanzado y hardening (1–2 semanas)
- ARCO/portabilidad, retención automática, legal hold, `clinical_access_log`, DPIA, otros perfiles país, pentest, k6, runbooks, backups probados, documentación de usuario y video-guías cortas.
- ✅ Checklist legal por país aprobado; auditoría de seguridad cerrada.

### Fase 10 — Piloto y salida a producción (2 semanas)
- Migración de datos históricos (CSV/Excel), capacitación por rol, piloto en una sección, ajustes UX, go-live por sedes, soporte.

**Duración estimada total: 16–20 semanas** con un desarrollador + Claude Code, revisiones semanales con enfermería y médico.

---

## 13. Convenciones para Claude Code (`CLAUDE.md`)

```
- Lee PLAN.md antes de cualquier tarea; trabaja fase por fase.
- Idioma de UI: español (es-CO) por defecto; código y commits en inglés (Conventional Commits).
- Nunca borres registros clínicos: usa anulación. Nunca elimines migraciones ya aplicadas.
- Todo endpoint de escritura crítico soporta Idempotency-Key.
- Toda tabla de negocio tiene tenant_id y RLS. Añade tests de aislamiento.
- Cada feature: migración + servicio + controlador + validación Zod + tests + Storybook (si UI) + docs.
- Datos sensibles nunca en logs ni en mensajes salientes; solo enlaces firmados.
- Antes de cerrar una fase: pnpm lint && pnpm typecheck && pnpm test && pnpm e2e.
- Decisiones de arquitectura → docs/ADR.
- Si algo del plan es ambiguo, propone 2 opciones y elige la más segura para el paciente.
```

### 13.1 Estructura del repositorio
```
/apps/web            Next.js (PWA, roles, i18n)
/apps/api            NestJS (módulos por esquema: core, people, clinical, meds, inventory, flow, comms, compliance, integrations)
/packages/db         Prisma schema, migraciones, seeds, RLS SQL
/packages/shared     Zod schemas, tipos, enums, máquina de estados
/packages/ui         Design system (shadcn) + Storybook
/infra               docker-compose, helm, traefik, grafana
/docs                ADR, integrations/phidias.md, legal/, runbooks/, user-guides/
```

---

## 14. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| API de Phidias incompleta o cambiante | Adaptador aislado, mocks, contrato versionado, importación CSV de respaldo |
| Resistencia de docentes/portería | UI de 2 toques, kiosco, capacitación de 15 min, offline |
| Datos de salud sensibles | Cifrado, RLS, auditoría, consentimientos, DPIA, mínimo privilegio |
| Padres sin app | Enlaces firmados por WhatsApp/SMS, portal web sin instalación |
| Dependencia de conectividad | PWA offline con cola y reconciliación |
| Cambios normativos | Motor de cumplimiento configurable, revisión anual |
| Error en administración de medicamentos | 5 correctos con QR, alertas de alergia, doble firma en controlados |

---

## 15. Entregables finales

1. Código fuente en monorepo con CI/CD.
2. Base de datos PostgreSQL con migraciones, RLS y seeds.
3. Aplicación web PWA por rol (enfermería, médico, docente, portería, padres, directivos, admin).
4. Integración Phidias idempotente con panel de control.
5. Documentación: OpenAPI, ADRs, manual por rol, matriz legal por país, runbooks, DPIA.
6. Suite de pruebas (unit, API, E2E, carga).
7. Infraestructura reproducible (Docker/Helm) y plan de backups.

---

*Fin del plan.*
