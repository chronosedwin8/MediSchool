# ADR-0001 — Monorepo con npm workspaces

**Contexto.** El plan propone pnpm + Turborepo. El equipo de desarrollo no tiene pnpm instalado y el despliegue inicial es en un servidor Windows del colegio.

**Decisión.** Usar **npm workspaces** (incluido en Node) con scripts raíz que construyen en orden `shared → db → api/web`. La estructura de carpetas es la del plan (§13.1).

**Consecuencias.** Sin caché remota de builds; los tiempos actuales (<1 min) no la justifican. Migrar a pnpm/Turborepo es mecánico si el repositorio crece: los workspaces ya están separados y no hay dependencias circulares.
