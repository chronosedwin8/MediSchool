---
title: Signos vitales, crecimiento y tamizajes
description: Cómo registrar signos vitales con alertas según la edad, interpretar colores y valores críticos, registrar peso y talla con percentiles e IMC de la OMS, y documentar tamizajes visuales, auditivos y otros.
category: modulos
roles: Enfermería, Médico institucional, Coordinación de enfermería
keywords: signos vitales pediátricos, temperatura, frecuencia cardiaca, saturación, glasgow, escala de dolor, percentiles OMS, IMC, talla, tamizaje visual
order: 3
updated: 2026-09-15
---

## Signos vitales

Se registran dentro de cada atención, en la sección **2. Signos vitales**.

| Campo | Unidad | Comentario |
|---|---|---|
| **Temperatura** | °C | Admite un decimal. |
| **Frecuencia cardiaca** | lpm | Latidos por minuto. |
| **Frecuencia respiratoria** | rpm | Respiraciones por minuto. |
| **TA sistólica** / **TA diastólica** | mmHg | Tensión arterial. |
| **SatO₂** | % | Saturación de oxígeno. |
| **Glucometría** | mg/dL | Glucosa capilar. |
| **Dolor (EVA)** | /10 | Escala visual análoga de 0 (sin dolor) a 10. |
| **Glasgow** | /15 | Nivel de conciencia (3 a 15). |

### Cómo registrar

1. Escriba solo los valores que midió; no es necesario llenar todos.
2. Pulse **Registrar toma**.
3. Para una reevaluación, repita: cada toma queda en la tabla con su hora y permite ver la evolución.

### Colores y alertas

MediSchool compara cada valor con los **rangos de referencia para la edad** del estudiante:

- **Normal:** texto sin color.
- **Ámbar:** valor fuera de rango que requiere atención.
- **Rojo en negrita:** valor **crítico**. Aparece el mensaje *Signos vitales CRÍTICOS registrados. Considere activar el protocolo de emergencia.*

> **Importante:** los colores apoyan la decisión clínica pero no la reemplazan. Un estudiante con apariencia grave requiere acción aunque los valores estén en rango.

Los rangos pediátricos predeterminados deben ser validados por el médico institucional.

## Crecimiento (OMS)

Se registra en la **Ficha de salud** del estudiante, bloque **Crecimiento (OMS)**, visible para los roles clínicos.

1. Pulse **Medición**.
2. Escriba **Peso (kg)**, **Talla (cm)** y **Fecha**.
3. Guarde.

MediSchool calcula:

- **IMC** (índice de masa corporal).
- **Percentil del IMC** para la edad y el sexo (por ejemplo, *P63*).
- **Clasificación nutricional** según los puntos de corte de la OMS.
- **Puntajes z** de IMC y talla.

### La gráfica

Muestra la evolución de **IMC (z)** y **Talla (z)** en el tiempo. La línea central es 0 (la mediana de referencia) y las líneas punteadas marcan **+2** y **−2**. Valores fuera de esas líneas merecen valoración y, si corresponde, remisión.

Referencias usadas: patrones de crecimiento **OMS 2006** (menores de 5 años) y **OMS 2007** (5 a 19 años).

> **Consejo:** mida en condiciones similares (sin zapatos, ropa ligera) y al menos una vez por semestre para ver tendencias confiables.

## Tamizajes

En la **Ficha de salud**, bloque **Tamizajes**:

1. Pulse **Registrar**.
2. Elija el **Tipo**: *Agudeza visual*, *Auditivo*, *Postural*, *Salud oral*, *Desarrollo (preescolar)*, *Nutricional* o *Pediculosis*.
3. Elija el **Resultado**: *Normal*, *Alterado* o *No concluyente*.
4. Escriba la **Fecha** y, si aplica, la **Remisión** (a dónde se remitió y por qué).
5. Guarde.

Los tamizajes alterados aparecen en rojo en la ficha. Para jornadas masivas, cree una **campaña** de tipo *Tamizaje* en [Salud pública](/ayuda/salud-publica) y marque a cada participante como *Realizado*.
