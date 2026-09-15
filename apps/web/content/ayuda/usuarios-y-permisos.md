---
title: Usuarios, roles y permisos
description: Cómo crear y editar usuarios, asignar roles, grupos a docentes, alcance por sección a directivos, PIN de kiosco a portería, restablecer contraseñas y MFA, desbloquear cuentas y ajustar la matriz de permisos.
category: administracion
roles: Administrador, Superadministrador
keywords: crear usuario, roles, permisos, asignar grupos docente, restablecer contraseña, desbloquear, MFA, PIN kiosco
order: 1
updated: 2026-09-15
---

## Lista de usuarios

En **Administración → Usuarios** verá cada usuario con:

- Nombre, correo y la etiqueta **Inactivo** si fue desactivado.
- **Roles** (con *(sección)* si tiene alcance limitado) y grupos del docente.
- **Seguridad:** *MFA* o *Sin MFA*, **Bloqueado**, y **Kiosco** con el código del dispositivo.
- **Último acceso.**

Use **Buscar por nombre o correo** y el filtro de **Rol**.

![Administración de usuarios con roles, seguridad y acciones](/ayuda/capturas/admin-usuarios.jpg "Administración → Usuarios")

## Crear un usuario

1. Pulse **Nuevo usuario**.
2. Complete **Nombres**, **Apellidos**, **Correo** (institucional) y **Celular**.
3. En **Roles**, toque uno o varios: *Superadministrador* (solo lo puede asignar otro superadministrador), *Administrador*, *Coordinación de enfermería*, *Enfermería*, *Médico institucional*, *Psicología / Orientación*, *Docente*, *Portería*, *Padre / Acudiente*, *Directivo* o *Estudiante*.
4. Complete los campos que aparecen según el rol:
   - **Docente → Grupos del docente:** toque los grupos donde dicta clase.
   - **Directivo → Alcance del directivo (sección):** *Todo el colegio* o una sección.
   - **Portería → PIN de kiosco (4–8 dígitos):** genera un código de dispositivo para la tablet.
5. Pulse **Guardar**.
6. En **Credenciales temporales** copie la contraseña (y el código del dispositivo de kiosco, si aplica). *No se volverán a mostrar; el usuario deberá cambiar la contraseña al ingresar.*

> **Importante:** entregue las credenciales por un canal seguro (en persona o por el correo institucional), nunca por grupos de chat.

> **Nota:** las cuentas de los acudientes normalmente las crean ellos mismos con un [código de invitación](/ayuda/estudiantes-y-acudientes#enviar-una-invitacion-para-crear-la-cuenta), que las vincula al estudiante correcto.

## Acciones sobre un usuario

| Acción | Icono | Uso |
|---|---|---|
| **Editar** | Persona con engranaje | Cambiar datos, roles, grupos, alcance, PIN o desactivar la cuenta. |
| **Restablecer contraseña** | Llave | Genera una contraseña temporal. |
| **Desbloquear** | Candado (solo si está bloqueado) | Quita el bloqueo por intentos fallidos. |
| **Restablecer MFA** | Escudo tachado (solo si tiene MFA) | Borra la verificación en dos pasos para configurarla de nuevo. |

### Desactivar a alguien que se retira

1. Pulse **Editar**, desmarque la cuenta como activa y pulse **Guardar**.
2. La persona ya no podrá ingresar. Su historial y sus firmas se conservan.

No es posible desactivar su propia cuenta.

## Roles y permisos

Cada rol tiene un conjunto de permisos predeterminado, pensado para cumplir el principio de **mínimo privilegio**:

| Rol | Permisos principales |
|---|---|
| Enfermería | Estudiantes, historia clínica, atenciones, pases, salidas, medicación, inventario, mensajes, estadísticas clínicas, salud pública. |
| Médico institucional | Lo de enfermería + anular, salud mental, aprobar inventario. |
| Coordinación de enfermería | Lo de enfermería + anular, aprobar inventario, circulares, auditoría, cumplimiento, acudientes, configuración. |
| Psicología / Orientación | Estudiantes, salud mental, lectura de atenciones, estadísticas anónimas. |
| Docente | Ver estudiantes, crear pases y ver sus propios pases. |
| Portería | Ver estudiantes, registrar entregas, ver pases. |
| Padre / Acudiente | Portal de familias, solicitar medicamentos, confirmar salidas, firmar consentimientos, mensajes. |
| Directivo | Estudiantes, estadísticas anónimas, pases, circulares. |
| Administrador | Estudiantes, acudientes, pases, inventario (lectura), circulares, estadísticas anónimas, usuarios, configuración, integraciones, auditoría, cumplimiento. |
| Estudiante | Mi pase. |

### Ajustar la matriz

1. Abra **Roles y permisos**.
2. Marque o desmarque los permisos de un rol.
3. Pulse **Guardar** en ese rol.

> **Importante:** amplíe permisos clínicos solo con el visto bueno de la coordinación de enfermería y del oficial de protección de datos. Todo cambio queda en la auditoría.

## Verificación en dos pasos obligatoria

En **Configuración → Seguridad y sesiones**, active **MFA obligatorio para roles clínicos y administrativos**. Aplica a superadministrador, administrador, coordinación, enfermería, médico y psicología. Quienes no la tengan configurada deberán hacerlo en su siguiente ingreso.
