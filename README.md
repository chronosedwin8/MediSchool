# MediSchool — Sistema de Gestión de Enfermería Escolar (SGEE)

Software web (PWA) que centraliza la operación de la enfermería de un colegio: historia clínica escolar, atenciones, trazabilidad **aula → enfermería → portería**, medicación autorizada por las familias (MAR con los 5 correctos), inventario, comunicación con acudientes, salud pública, estadísticas y cumplimiento legal. Integrado con **Phidias** (maestro de estudiantes) y con las **fotos de estudiantes en S3**, con PostgreSQL propio como fuente de verdad.

Especificación completa: [PLAN.md](PLAN.md) · Convenciones: [CLAUDE.md](CLAUDE.md) · Decisiones: [docs/ADR](docs/ADR)

## Arquitectura

```
apps/web        Next.js 15 + React 19 + Tailwind 4 (PWA por rol, i18n, offline)
apps/api        NestJS 11 (REST /api/v1, OpenAPI 3.1, WebSocket /live, cola de trabajos)
packages/db     Prisma 6 + migraciones SQL (RLS, cadenas de hash, triggers, vistas)
packages/shared Reglas de dominio puras: máquina de estados del pase, 5 correctos,
                signos vitales por edad, percentiles OMS, brotes, catálogos, Zod
packages/ui     Sistema de diseño (PatientHeader, VitalsInput, SignaturePad…)
infra/          docker-compose y Dockerfiles · e2e/ Playwright · docs/ documentación
```

**Roles:** administrador, coordinación de enfermería, enfermería, médico, psicología, docente, portería (kiosco con PIN), padre/acudiente, directivo (con alcance por sección), estudiante y superadministrador multi-colegio.

## Puesta en marcha (Windows / macOS / Linux)

Requisitos: Node 20+, PostgreSQL 16/17. Redis y Docker **no** son necesarios (ver ADR-0003).

```bash
cp .env.example .env            # completar contraseñas, token de Phidias y credenciales S3
npm install
npm run db:setup                # crea sgee y sgee_test, rol sgee_app, migraciones, seed demo
npm run build:packages && npm run build -w @sgee/api
npm run phidias:sync            # estudiantes reales + fotos S3 + historial de encuestas
npm run seed -w @sgee/db -- --links   # vincula las cuentas demo del colegio real
npm run dev                     # API http://localhost:4000 · Web http://localhost:3100
```

Documentación interactiva de la API: http://localhost:4000/api/docs

### Cuentas de demostración (contraseña `MediSchool2026!`)

| Rol | Colegio real (`colegio-aleman`) | Colegio demo (`colegio-demo`, 1 500 estudiantes) |
|---|---|---|
| Enfermería | enfermera1@colegio-aleman.test | enfermera1@colegio-demo.test |
| Médico | medico@colegio-aleman.test | medico@colegio-demo.test |
| Coordinación | coordinacion@colegio-aleman.test | coordinacion@colegio-demo.test |
| Docente | docente@colegio-aleman.test | docente@colegio-demo.test |
| Padre / acudiente | padre@colegio-aleman.test | padre@colegio-demo.test |
| Portería | porteria@colegio-aleman.test · kiosco `PORTERIA-1` / PIN `2468` | porteria@colegio-demo.test |
| Directivo | directivo@colegio-aleman.test | directivo@colegio-demo.test |
| Administrador | admin@colegio-aleman.test | admin@colegio-demo.test |
| Superadmin | superadmin@colegio-aleman.test | — |

## Pruebas

```bash
npm test            # shared (unitarias) + API (integración sobre sgee_test: RLS, flujo completo,
                    # idempotencia, cadenas de hash, 5 correctos, FEFO, Phidias, ARCO…)
npm run e2e         # Playwright con Chrome instalado (requiere npm run dev)
npm run load        # prueba de carga (300 usuarios virtuales) — también k6: infra/k6/load.js
npm run lint && npm run typecheck
```

## Seguridad y cumplimiento (resumen)

- PostgreSQL **RLS** por colegio en todas las tablas; la API usa un rol sin privilegios de superusuario.
- Historia clínica **inmutable**: firma al cerrar, cadena SHA-256 verificable, anulación con motivo, adendas; `DELETE` prohibido por triggers en esquemas clínicos, de medicación y auditoría.
- Auditoría append-only, particionada y encadenada; registro de cada acceso a historias clínicas y alerta de accesos anómalos.
- Cifrado AES-256-GCM de adjuntos y notas de salud mental; contraseñas con scrypt; MFA TOTP; refresh tokens rotativos; CSRF; CSP; límites de tasa.
- Consentimientos versionados con firma OTP; ARCO/portabilidad; retención con bloqueo legal; reportes obligatorios; perfiles legales por país (CO por defecto).
- Mensajes a familias sin datos clínicos: solo aviso + enlace firmado de un solo uso.

Ver [docs/legal/matriz-legal.md](docs/legal/matriz-legal.md) y [docs/legal/dpia.md](docs/legal/dpia.md).
