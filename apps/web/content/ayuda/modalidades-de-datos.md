---
title: Modalidades de datos con Phidias o independiente
description: MediSchool funciona conectado a Phidias o de forma totalmente independiente. Aquí se explica qué cambia en cada modalidad, cómo elegirla y cómo pasar de una a otra sin perder información.
category: administracion
roles: Administrador, Coordinación de enfermería
keywords: modalidad independiente, sin Phidias, con Phidias, datos de estudiantes, maestro de estudiantes, cambiar modalidad
order: 0
updated: 2026-09-15
---

MediSchool puede trabajar de dos maneras. La modalidad define **de dónde vienen los datos académicos** de los estudiantes. Todo lo demás funciona igual en ambas: enfermería, historia clínica, medicación, portería, familias, estadísticas y cumplimiento.

## Comparación

| | **Con Phidias** | **Independiente** |
|---|---|---|
| Estudiantes | Llegan de Phidias automáticamente (cada hora y cada noche). | Se crean en MediSchool, uno a uno o por importación CSV. |
| Secciones, grados y grupos | Se sincronizan desde Phidias (solo lectura). | Se crean en *Administración → Estructura académica*. |
| Nombres, documento, fecha de nacimiento, grupo y estado | Se corrigen en Phidias; en MediSchool son de solo lectura para los estudiantes vinculados. | Se editan en la ficha del estudiante (**Editar datos**). |
| Contacto y transporte | Editables en MediSchool. | Editables en MediSchool. |
| Fotos | Desde el bucket de Phidias y también se pueden subir en MediSchool. | Se suben en MediSchool (**Foto** en la ficha del estudiante). |
| Acudientes y contactos de emergencia | Desde Phidias (si el permiso está habilitado) y en MediSchool. | En MediSchool: invitación, **Vincular** y **Agregar contacto**. |
| Historial de encuestas de enfermería | Se importa desde Phidias. | No aplica. |
| Personal del colegio atendido en enfermería | Del historial y registrándolo en MediSchool. | Registrándolo desde *Nueva atención*. |

> **Nota:** en ambas modalidades la ficha de salud, las atenciones, la medicación, los consentimientos, las restricciones judiciales y la decisión de quién puede recoger se gestionan **solo** en MediSchool y nunca se sobrescriben.

## Cómo elegir o cambiar la modalidad

1. Vaya a **Administración → Configuración**.
2. En **Modalidad de datos**, elija **Con Phidias** o **Independiente de Phidias**.
3. Lea el aviso que explica qué va a cambiar.
4. Pulse **Guardar configuración**.

Al cambiar:

- **A independiente:** se detienen todas las sincronizaciones con Phidias. Los estudiantes, grupos y fotos ya importados **se conservan** y pasan a editarse en MediSchool.
- **A Phidias:** se activa la sincronización automática. Los estudiantes vinculados a Phidias vuelven a tener sus datos académicos en solo lectura y se actualizan desde Phidias. Los estudiantes creados en MediSchool siguen siendo editables; si Phidias trae uno con el mismo documento, se vinculan.

El cambio queda registrado en la auditoría.

## Poner en marcha la modalidad independiente

1. **Estructura académica:** en *Administración → Estructura académica* cree las secciones (por ejemplo, Preescolar, Primaria y Bachillerato), luego los grados y los grupos. Vea [Estudiantes, acudientes e invitaciones](/ayuda/estudiantes-y-acudientes#estructura-academica-modalidad-independiente).
2. **Estudiantes:** en *Estudiantes* use **Importar CSV** para cargar a todos de una vez, o **Nuevo estudiante** para crearlos uno a uno.
3. **Fotos:** en la ficha de cada estudiante pulse **Foto** y tómela con la cámara o elija un archivo. La foto se verá en todos los paneles: enfermería, docentes, portería, familias y estadísticas de estudiantes.
4. **Docentes:** en *Administración → Usuarios* asigne a cada docente sus grupos.
5. **Familias:** genere **Invitación** desde la ficha del estudiante para que cada acudiente cree su cuenta, o use **Vincular** para registrarlo usted.
6. **Personal:** cuando atienda a un colaborador, en *Nueva atención → Personal del colegio* pulse **Registrar persona del personal** si aún no existe.

## Preguntas frecuentes

**¿Puedo empezar independiente y conectar Phidias después?**
Sí. Al elegir *Con Phidias*, la sincronización vincula a los estudiantes existentes por su documento y marca en *Administración → Phidias → Conflictos* los casos que requieren revisión.

**¿Se pierde información al cambiar de modalidad?**
No. Ningún registro se borra al cambiar; solo cambia quién es el responsable de mantener los datos académicos.

**En modalidad Phidias, ¿por qué no puedo corregir el nombre de un estudiante?**
Porque Phidias es la fuente oficial: la corrección debe hacerse allá y llegará en la siguiente sincronización. Los datos de contacto y el transporte sí se editan en MediSchool.
