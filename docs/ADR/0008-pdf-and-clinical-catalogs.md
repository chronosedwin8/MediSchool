# ADR-0008 — PDFs, CIE-10 y tablas de crecimiento

- **PDF:** `pdfkit` en la API (sin navegador sin cabeza): historia de la atención con firma y hash, marca de agua "ANULADA", constancia para la familia, MAR mensual, listado de salida pedagógica, informe de estadísticas.
- **CIE-10:** subconjunto curado (≈110 códigos frecuentes en enfermería escolar, edición en español OPS). Se aceptan códigos manuales y CIE-11 como sistema alterno. Importador del catálogo oficial completo pendiente de la licencia del archivo.
- **Crecimiento OMS:** tablas LMS oficiales — OMS 2006 (0–5 años, vía `pygrowup`) y OMS 2007 (5–19 años, repositorio `WorldHealthOrganization/anthroplus`), con el cálculo restringido para |z| > 3. Clasificación de IMC para la edad con umbrales OMS.
- **Signos vitales:** rangos de referencia pediátricos PALS configurables; la valoración clínica prevalece (a validar por el médico institucional).
