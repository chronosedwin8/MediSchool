# ADR-0009 — Medicación de rescate (PRN)

**Contexto.** El plan lista `prn_orders` y `prn_administrations` como tablas separadas.

**Decisión.** Una orden PRN es una `meds.medication_requests` con `is_prn = true`, `prn_criteria`, `min_interval_minutes` y `max_doses_per_day`; sus dosis son `medication_administrations` sin `schedule_id`. Los 5 correctos validan intervalo mínimo y máximo diario en lugar de la ventana horaria.

**Consecuencias.** Un solo flujo de aprobación, custodia, cadena de hash y constancia para medicación programada y de rescate.
