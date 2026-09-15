---
title: Estudiantes, acudientes e invitaciones
description: Cómo buscar estudiantes, leer su ficha, vincular acudientes, generar códigos de invitación para las familias, registrar contactos de emergencia y consultar historial, medicación y consentimientos.
category: modulos
roles: Enfermería, Médico institucional, Coordinación de enfermería, Psicología / Orientación, Directivo, Administrador
keywords: ficha del estudiante, buscar estudiante, vincular acudiente, código de invitación, contactos de emergencia, historial, restricción judicial
order: 9
updated: 2026-09-15
---

## Lista de estudiantes

Abra **Estudiantes**. La información académica se sincroniza con Phidias y *las alertas médicas se muestran siempre*.

![Lista de estudiantes con filtros por sección, grado, grupo y alertas](/ayuda/capturas/estudiantes-lista.jpg "Estudiantes: busque por nombre, código o documento")

Filtros disponibles:

- **Buscar:** nombre, apellido, código o documento (sin importar tildes).
- **Sección**, **Grado** y **Grupo**.
- **Estado:** activos o inactivos (retirados en Phidias).
- **Solo con alertas:** estudiantes con alergias o condiciones.

Pulse **Cargar más** para ver más resultados.

## La ficha del estudiante

![Ficha del estudiante con encabezado de alertas y pestañas](/ayuda/capturas/ficha-estudiante.jpg "Ficha del estudiante")

El **encabezado** muestra foto, código, sección, grupo, edad, grupo sanguíneo, alergias y condiciones. Los botones disponibles dependen de su rol:

- **Emergencia:** abre el modo emergencia.
- **Atender:** crea una atención sin pase.
- Icono de sincronización (administradores): **Sincronizar con Phidias** solo este estudiante.

### Pestañas

| Pestaña | Contenido | Quién la ve |
|---|---|---|
| **Resumen** | Acudientes, contactos de emergencia, medicación activa y datos (documento, nacimiento, sexo, grado, transporte). | Todos los roles con acceso a estudiantes |
| **Ficha de salud** | Alergias, condiciones, vacunas, documentos, crecimiento y tamizajes. | Roles clínicos |
| **Historial** | Línea de tiempo de atenciones (con etiquetas *Accidente*, *Phidias*, *Anulada*), pases y otros eventos. | Roles clínicos |
| **Medicación** | Registro de administración del mes y **Constancia PDF**. | Roles clínicos |
| **Consentimientos** | Estado de cada consentimiento: *Firmado*, *Pendiente* o *Revocado*. | Roles clínicos |
| **Salud mental** | Notas cifradas con nivel de riesgo. | Psicología y médico |

## Crear, editar e importar estudiantes

Administración y coordinación de enfermería pueden gestionar el maestro de estudiantes. En modalidad **independiente** todo se hace aquí; en modalidad **con Phidias** los estudiantes vinculados tienen sus datos académicos en solo lectura. Vea [Modalidades de datos](/ayuda/modalidades-de-datos).

### Nuevo estudiante

1. En **Estudiantes**, pulse **Nuevo estudiante**.
2. Complete **Código del estudiante** (único), **Grupo**, **Nombres**, **Apellidos**, **Tipo de documento** (registro civil, tarjeta de identidad, cédula de ciudadanía, cédula de extranjería, pasaporte, PPT…), **Número de documento**, **Fecha de nacimiento**, **Sexo** y, si los tiene, correo, celular, teléfono, transporte y dirección.
3. Pulse **Guardar**. Se abre la ficha del estudiante para completar foto, acudientes y contactos.

### Importar varios estudiantes (CSV)

1. Pulse **Importar CSV**.
2. Cargue el archivo o pegue el contenido. La primera fila debe ser `codigo;documento;nombres;apellidos;fecha_nacimiento;sexo;grupo`, con fecha AAAA-MM-DD, sexo M o F y el código del grupo.
3. Pulse **Importar**. Si un código ya existe, el estudiante se actualiza. Las filas con error (por ejemplo, un grupo inexistente) se listan con su número de línea.

### Editar datos o retirar a un estudiante

1. En la ficha del estudiante, pulse **Editar datos**.
2. Modifique los datos. Para un estudiante que se retira, cambie **Estado** a *Retirado / inactivo*: conserva su historia clínica y deja de aparecer en listas y clases.
3. Pulse **Guardar**.

## Foto del estudiante

La foto identifica al estudiante en **todos los paneles**: tablero de enfermería, atenciones, medicación, *Mi clase* de los docentes, portería, portal de familias, búsqueda y emergencias.

1. En la ficha del estudiante, pulse **Foto**.
2. Pulse **Tomar foto** (cámara del celular o tablet) o **Elegir archivo** (JPG, PNG o WEBP de hasta 5 MB). Las fotos grandes se reducen automáticamente.
3. Revise la vista previa y pulse **Guardar foto**. Para eliminarla, **Quitar foto**.

> **Consejo:** use fotos de frente, recientes y con buena luz. La foto se guarda cifrada y solo la ven las personas autorizadas a ver al estudiante (por ejemplo, un docente ve las de sus grupos y una familia solo las de sus hijos).

## Estructura académica (modalidad independiente)

En **Administración → Estructura académica**:

1. **Nueva sección:** código corto (por ejemplo, PRI), nombre y orden.
2. En la sección, **Grado:** código, nombre y orden.
3. En el grado, **Grupo:** código único (por ejemplo, 6A) y nombre.
4. Toque un grupo para editarlo o desactivarlo. Un grupo con estudiantes activos no se puede desactivar: primero muévalos a otro grupo.

En modalidad con Phidias la estructura se muestra en solo lectura.

## Acudientes

En **Resumen → Acudientes** verá cada acudiente con su parentesco, si es **Principal**, si **Puede recoger** o **No recoge**, y una alerta **Restricción judicial** cuando existe.

> **Importante:** un acudiente con restricción judicial nunca aparece como opción para recoger al estudiante.

### Vincular un acudiente manualmente

1. Pulse **Vincular**.
2. Complete **Nombres**, **Apellidos**, **Documento**, **Parentesco**, **Correo** y **Celular**, e indique si puede recoger.
3. Pulse **Vincular**.

### Editar o desvincular un acudiente

Debajo de cada acudiente:

- **Editar:** cambie el parentesco y marque si es **acudiente principal**, si **puede recoger**, si **tiene custodia legal** o si tiene una **restricción judicial** (en ese caso nunca podrá recoger). Agregue restricciones u observaciones visibles para enfermería, portería y administración.
- **Desvincular:** retira el vínculo con el estudiante sin borrar el historial.

### Enviar una invitación para crear la cuenta

La forma recomendada para que la familia use el portal:

1. Pulse **Invitación**.
2. En *Invitación para acudiente* verá el **código** y el enlace. Pulse **Copiar enlace**.
3. Envíelo al acudiente por un canal oficial del colegio.
4. El acudiente abre el enlace, completa el registro y queda vinculado al estudiante.

El código es de un solo uso y tiene vencimiento.

## Contactos de emergencia

1. En **Resumen → Contactos de emergencia**, pulse **Agregar**.
2. Complete **Nombre**, **Parentesco**, **Teléfono** y **Documento**, e indique si está autorizado para recoger.
3. Pulse **Guardar**.

Los contactos que agregan las familias aparecen como **Por verificar**. Pulse el icono de verificación para confirmarlos o el de quitar para retirar un contacto que ya no aplica.

## Estudiantes retirados

Cuando Phidias marca a un estudiante como retirado o deja de reportarlo, MediSchool lo pasa a **inactivo**. **No se borra**: su historia clínica se conserva según la ley. Para ver inactivos, use el filtro **Estado**.
