# Architecture Decision Records

| # | Decisión | Estado |
|---|---|---|
| [0001](0001-monorepo-npm-workspaces.md) | Monorepo con npm workspaces (sin pnpm/Turborepo) | Aceptada |
| [0002](0002-database-rls-hash-chains.md) | PostgreSQL con RLS, rol de aplicación y cadenas de hash en triggers | Aceptada |
| [0003](0003-postgres-job-queue.md) | Cola de trabajos en PostgreSQL en lugar de Redis/BullMQ | Aceptada |
| [0004](0004-built-in-auth.md) | Autenticación propia (JWT + refresh rotativo + TOTP) en lugar de Keycloak | Aceptada |
| [0005](0005-storage-and-photos.md) | Adjuntos cifrados (local/S3) y fotos de estudiantes desde el bucket existente | Aceptada |
| [0006](0006-pass-observation-state.md) | Estado OBSERVATION explícito en la máquina de estados del pase | Aceptada |
| [0007](0007-phidias-integration.md) | Integración Phidias idempotente con hash de contenido y propiedad de campos | Aceptada |
| [0008](0008-pdf-and-clinical-catalogs.md) | PDFs con pdfkit; CIE-10 curado; tablas OMS oficiales | Aceptada |
| [0009](0009-prn-orders.md) | PRN modelado como solicitud de medicación con `is_prn` | Aceptada |
