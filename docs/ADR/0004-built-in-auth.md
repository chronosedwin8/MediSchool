# ADR-0004 — Autenticación propia

**Contexto.** El plan sugiere Keycloak u Auth.js. No hay infraestructura de identidad en el colegio y la portería requiere un kiosco con PIN.

**Decisión.**
- Access token JWT HS256 de 15 min (claims: usuario, colegio, roles, alcance de sección) en cookie `httpOnly SameSite=Lax` o encabezado Bearer.
- Refresh token aleatorio de 48 bytes guardado como hash, **rotado en cada uso**; sesiones revocables.
- Escrituras con cookie exigen `X-Requested-With: sgee` (CSRF).
- Contraseñas con **scrypt**; bloqueo 15 min tras 5 intentos; MFA **TOTP** (obligatorio por configuración para roles clínicos y administrativos).
- Kiosco de portería: código de dispositivo + PIN, sesión de 12 h, solo rol GATE.
- Registro de acudientes por **invitación** de un solo uso vinculada al estudiante.
- Permisos por rol almacenados por colegio (`core.role_permissions`, editables) + ABAC en `AccessService`.

**Consecuencias.** SSO (Google Workspace/Microsoft) queda como integración futura mediante OIDC hacia este mismo emisor de sesiones.
