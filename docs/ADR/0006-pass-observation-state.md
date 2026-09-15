# ADR-0006 — Estado OBSERVATION en el pase

**Contexto.** El tablero de enfermería (§9.2) tiene la columna "Observación", pero la máquina de estados (§5.4) no la incluye.

**Decisión.** Agregar `OBSERVATION` entre `IN_CARE` y las salidas (`IN_CARE ⇄ OBSERVATION → RETURNED_TO_CLASS | WAITING_GUARDIAN | TRANSFERRED_IPS`). El periodo de observación se registra en `clinical.observation_periods` con hora de reevaluación y alerta automática.

**Consecuencias.** Transiciones adicionales cubiertas por la prueba exhaustiva de la matriz de estados y por el trigger de la base.
