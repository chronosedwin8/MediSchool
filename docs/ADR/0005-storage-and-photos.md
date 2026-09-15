# ADR-0005 — Archivos cifrados y fotos de estudiantes

**Decisión.**
- **Adjuntos clínicos** (fórmulas, fotos de lesiones, certificados, firmas, exportaciones): se verifica el tipo real por bytes mágicos (JPG/PNG/WEBP/PDF), límite 10 MB, antivirus ClamAV opcional, SHA-256 de integridad y cifrado **AES-256-GCM** antes de guardar. Driver `local` (desarrollo/servidor) o `s3` con SSE. La descarga siempre pasa por la API con control de acceso y registro.
- **Fotos de estudiantes:** se reutiliza el bucket existente `enfermeriacaleman` (clave `{codigo}.jpg|png|jpeg`) del proyecto anterior. El trabajo `phidias.photos` guarda la clave y el ETag en `people.persons`; la API responde `302` a una URL firmada de 1 h (caché de 55 min).

**Consecuencias.** Las fotos nunca se copian a otro almacenamiento. La clave de cifrado (`DATA_ENCRYPTION_KEY`) debe rotarse según [docs/runbooks/rotacion-secretos.md](../runbooks/rotacion-secretos.md).
