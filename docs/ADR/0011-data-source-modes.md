# ADR-0011 — Modalidades de datos: con Phidias o independiente

**Contexto.** El colegio necesita operar con Phidias como maestro de estudiantes, pero también sin Phidias (otros colegios, contingencia prolongada o una decisión institucional), gestionando todo dentro de MediSchool. Además, las fotos deben verse en todos los paneles aunque no exista el bucket de Phidias.

**Decisión.**
1. `tenant.settings.dataSource` ∈ {`PHIDIAS`, `LOCAL`} (por defecto `LOCAL` para colegios nuevos). Se cambia en *Administración → Configuración*; el cambio activa o desactiva `integration_settings.PHIDIAS` y queda auditado.
2. **LOCAL:** CRUD de secciones, grados y grupos (`/structure/*`), creación/edición de estudiantes (`POST/PATCH /students`), importación CSV, acudientes, contactos y personal en MediSchool. Las tareas y sincronizaciones manuales de Phidias se rechazan (`409 DATA_SOURCE_LOCAL`).
3. **PHIDIAS:** la estructura es de solo lectura (`409 PHIDIAS_MANAGED`). Para estudiantes con vínculo activo en `integration.external_ids`, los campos académicos (código, nombres, documento, nacimiento, sexo, grupo, estado) son de solo lectura (`409 PHIDIAS_OWNED`); contacto y transporte siguen editables. Los estudiantes creados localmente siguen siendo editables y la sincronización los vincula por documento.
4. **Fotos en ambas modalidades:** `POST /students/:id/photo` guarda la imagen cifrada (JPG/PNG/WEBP ≤ 5 MB, verificada por bytes) como archivo `STUDENT_PHOTO` y fija `person.photo_key = local:<fileId>`. `GET /students/:id/photo` transmite la imagen local o redirige a la URL firmada de S3; lo pueden ver todos los roles autorizados a ver al estudiante (incluido el propio estudiante). La URL lleva `?v=<hash>` para invalidar la caché. La sincronización de fotos de Phidias nunca reemplaza una foto subida en MediSchool.

**Consecuencias.** Un mismo despliegue sirve a colegios con y sin Phidias. Pasar de una modalidad a otra no borra datos. Pruebas: `apps/api/test/independent.test.ts`.
