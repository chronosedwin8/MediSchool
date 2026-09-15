---
title: Glosario de términos
description: Definiciones de los términos que usa MediSchool, como pase, atención, conducta, adenda, anulación, custodia, PRN, FEFO, CIE-10 y ARCO.
category: primeros-pasos
roles: Todos
keywords: glosario, definiciones, pase, adenda, anulación, PRN, FEFO, CIE-10, SOAP, ARCO, IPS, EPS
order: 6
updated: 2026-09-15
---

## Flujo y pases

- **Pase:** registro digital que acompaña al estudiante desde que el docente lo envía a enfermería hasta que regresa al aula o sale del colegio. Tiene un código corto y un código QR.
- **Estados del pase:** *Solicitado*, *En tránsito*, *Recibido en enfermería*, *En atención*, *En observación*, *Retorno al aula*, *Esperando acudiente*, *Salida autorizada*, *Entregado en portería*, *Traslado a IPS*, *Cerrado*, *Cancelado* y *Vencido*.
- **Alerta de tránsito:** aviso que se genera cuando el estudiante no llega a enfermería en el tiempo configurado (por defecto, 10 minutos).
- **Autorización de salida:** solicitud de enfermería para que un acudiente recoja al estudiante. Requiere que la familia confirme quién lo recoge antes de que portería lo entregue.
- **Autorización permanente de salida autónoma:** permiso que otorga la familia para que un estudiante de bachillerato (14 años o más) salga del colegio sin ser recogido cuando enfermería lo indique.
- **Kiosco:** modo de uso de la tablet de portería, con ingreso por código de dispositivo y PIN.

## Historia clínica

- **Atención:** registro de una consulta en enfermería, de un estudiante o de un miembro del personal.
- **SOAP:** estructura de notas clínicas: **S**ubjetivo (lo que refiere el paciente), **O**bjetivo (hallazgos del examen), **A**nálisis o valoración (impresión diagnóstica) y **P**lan (conducta y tratamiento).
- **CIE-10:** Clasificación Internacional de Enfermedades, décima revisión. Se usa para codificar los diagnósticos.
- **Plantilla de atención:** guía por motivo de consulta con lo que se debe valorar, la conducta sugerida, los signos de alarma y los diagnósticos frecuentes.
- **Conducta (disposición):** decisión al cerrar la atención: *Retorno al aula*, *Retiro por acudiente*, *Traslado a IPS*, *Reporte a coordinación*, *Retorno al puesto de trabajo* o *Envío a casa (personal)*.
- **Firma y cadena de hash:** al cerrar, la atención se firma con el usuario del profesional y se encadena con un código SHA-256 que permite detectar cualquier alteración.
- **Adenda:** nota agregada a una atención ya firmada para corregir o complementar información, sin modificar el registro original.
- **Anulación:** marca que invalida una atención firmada, con motivo obligatorio. Solo la pueden hacer el médico o la coordinación. El registro no se borra.
- **Observación:** periodo en el que el estudiante permanece en enfermería con una hora de reevaluación y alerta automática.
- **Atención histórica:** atención importada desde las encuestas de Phidias, anterior a MediSchool.
- **IPS / EPS:** Institución Prestadora de Servicios de salud (clínica u hospital) y Entidad Promotora de Salud (aseguradora).
- **Puntaje z y percentil (OMS):** medidas que comparan el peso, la talla y el índice de masa corporal (IMC) con la población de referencia de la Organización Mundial de la Salud para la misma edad y sexo.

## Medicación e inventario

- **Los 5 correctos:** verificación previa a cada dosis: paciente, medicamento, dosis, vía y hora correctos.
- **Ventana horaria:** margen alrededor de la hora programada en el que se puede administrar una dosis (por defecto, ± 30 minutos).
- **PRN (medicación de rescate):** medicamento que se administra *solo si es necesario* según un criterio (por ejemplo, salbutamol en crisis asmática), con intervalo mínimo entre dosis y máximo de dosis diarias.
- **Custodia:** medicamento entregado por la familia que enfermería guarda y controla (cantidad, lote y vencimiento).
- **Medicamento de control:** medicamento que exige un **testigo** (doble verificación) al administrarlo.
- **FEFO:** *First Expired, First Out*: se usa primero el lote que vence primero. Los lotes vencidos quedan bloqueados.
- **Doble firma:** autorización de un segundo profesional con su correo y contraseña para ajustes de inventario, averías y medicamentos de control.
- **MAR:** registro de administración de medicamentos, disponible como constancia mensual en PDF.

## Privacidad y cumplimiento

- **Consentimiento:** autorización versionada que firma el acudiente con un código de 6 dígitos (tratamiento de datos, datos de salud, medicamentos, atención de emergencia, fotografías de lesiones, salud mental y salida permanente).
- **Derechos ARCO:** derechos del titular a **A**cceder, **R**ectificar, **C**ancelar (suprimir) y **O**ponerse al tratamiento de sus datos; incluye la portabilidad.
- **Retención:** tiempo durante el cual se conserva cada tipo de información según la ley.
- **Bloqueo legal:** marca que impide aplicar la política de retención sobre los datos de una persona mientras exista un proceso legal.
- **Reporte obligatorio:** comunicación que el colegio debe hacer a una autoridad en un plazo (por ejemplo, sospecha de maltrato al ICBF).
- **Auditoría:** registro inalterable de quién hizo o consultó qué y cuándo.
- **Phidias:** plataforma académica del colegio desde la que se sincronizan estudiantes, grados, grupos y fotos.
