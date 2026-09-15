# CLAUDE.md — MediSchool (SGEE)

- Lee PLAN.md antes de cualquier tarea; trabaja fase por fase.
- Idioma de UI: español (es-CO) por defecto; código y commits en inglés (Conventional Commits).
- Nunca borres registros clínicos: usa anulación. Nunca elimines migraciones ya aplicadas.
- Todo endpoint de escritura crítico soporta Idempotency-Key.
- Toda tabla de negocio tiene tenant_id y RLS. Añade tests de aislamiento.
- Cada feature: migración + servicio + controlador + validación Zod + tests + Storybook (si UI) + docs.
- Datos sensibles nunca en logs ni en mensajes salientes; solo enlaces firmados.
- Antes de cerrar una fase: npm run lint && npm run typecheck && npm test && npm run e2e.
- Decisiones de arquitectura → docs/ADR.
- Si algo del plan es ambiguo, propone 2 opciones y elige la más segura para el paciente.

## Estructura
```
/apps/web            Next.js 15 (PWA, roles, i18n)
/apps/api            NestJS 11 (módulos por esquema)
/packages/db         Prisma schema, migraciones, seeds, RLS SQL
/packages/shared     Zod schemas, tipos, enums, máquina de estados, reglas clínicas
/packages/ui         Design system (Radix + Tailwind) + Storybook
/infra               docker-compose, Dockerfiles
/docs                ADR, integrations/phidias.md, legal/, runbooks/, user-guides/
/e2e                 Playwright
```

## Comandos
- `npm install` — instala todo (npm workspaces, ver ADR-0001).
- `npm run db:setup` — crea BD/rol, aplica migraciones y RLS, carga seed.
- `npm run dev` — API (:4000) + Web (:3100; el 3000 lo usa otra aplicación del equipo).
- `node scripts/capture-screenshots.mjs` — regenera las capturas de la ayuda (solo colegio demo, sin fotos).
- `docker compose -f infra/docker-compose.yml --env-file .env up -d --build` — stack completo (puertos `SGEE_DB_PORT`/`SGEE_API_PORT`/`SGEE_WEB_PORT`).
- `npm test` — unit + integración (usa BD `sgee_test`).
- `npm run e2e` — Playwright con Chrome instalado.

## Notas del entorno
- PostgreSQL 17 local (`postgres`/`1004`). La API se conecta con el rol NO superusuario `sgee_app` para que RLS aplique.
- Sin Redis: la cola de trabajos es PostgreSQL (`SKIP LOCKED`, ADR-0003). Docker Desktop disponible para probar `infra/`.
- Fotos de estudiantes: bucket S3 `enfermeriacaleman`, clave `{codigo}.jpg`. Solo se muestran fotos vinculadas por la sincronización de Phidias (`person.photoKey`); nunca se busca por código.
- Dominio institucional del colegio real: `colegioaleman.edu.co`. Credenciales del administrador solo en `.env` (`SEED_ADMIN_*`).
- Sitio público: `/` y `/ayuda` (contenido en `apps/web/content/ayuda/*.md`, ADR-0010). Todo cambio de UI visible debe reflejarse en la guía correspondiente.
- Phidias `idtype`: 1=TI, 2=CC, 4=RC confirmados por el colegio.
