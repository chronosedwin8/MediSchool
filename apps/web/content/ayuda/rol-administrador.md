---
title: Guía para administradores
description: Responsabilidades del administrador del colegio en MediSchool, incluidos usuarios y roles, permisos, configuración, integración con Phidias, cumplimiento legal, auditoría, notificaciones, sistema y respaldos.
category: roles
roles: Administrador
keywords: administrador del sistema, gestión de usuarios, configuración, Phidias, auditoría, respaldos
order: 10
updated: 2026-09-15
---

El administrador mantiene MediSchool funcionando para todo el colegio. **No accede a historias clínicas**: su trabajo es gestionar cuentas, permisos, parámetros e integraciones, y velar por la seguridad y el cumplimiento. Su pantalla de inicio es **Administración**.

![Administración con la pestaña Usuarios, filtros por rol y acciones por usuario](/ayuda/capturas/admin-usuarios.jpg "Administración → Usuarios")

## Pestañas de Administración

| Pestaña | Para qué sirve | Guía |
|---|---|---|
| **Usuarios** | Crear cuentas, asignar roles y grupos, restablecer contraseñas, desbloquear, restablecer MFA, PIN de kiosco. | [Usuarios, roles y permisos](/ayuda/usuarios-y-permisos) |
| **Roles y permisos** | Ajustar qué puede hacer cada rol en su colegio. | [Usuarios, roles y permisos](/ayuda/usuarios-y-permisos) |
| **Configuración** | Modalidad de datos (con Phidias o independiente), nombre, zona horaria, MFA obligatorio, sesiones, tiempos de alerta, medicación, brotes y canales. | [Configuración del colegio](/ayuda/configuracion-del-colegio) |
| **Estructura académica** | Secciones, grados y grupos (modalidad independiente). | [Estudiantes, acudientes e invitaciones](/ayuda/estudiantes-y-acudientes#estructura-academica-modalidad-independiente) |
| **Phidias** | Estado de la sincronización, ejecuciones manuales, conflictos y propiedad de campos. | [Integración con Phidias](/ayuda/integracion-phidias) |
| **Cumplimiento legal** | Matriz legal, consentimientos, ARCO, reportes obligatorios, retención y accesos. | [Cumplimiento legal y auditoría](/ayuda/cumplimiento-legal-y-auditoria) |
| **Auditoría** | Búsqueda de acciones y verificación de la cadena de hash. | [Cumplimiento legal y auditoría](/ayuda/cumplimiento-legal-y-auditoria) |
| **Notificaciones** | Envíos realizados y plantillas de mensajes. | [Mensajes y notificaciones](/ayuda/mensajes-y-notificaciones) |
| **Sistema** | Estado técnico, integraciones, tareas programadas y respaldos. | [Sistema, tareas y respaldos](/ayuda/sistema-y-respaldos) |

Además puede consultar **Estudiantes** (sin información clínica), **Inventario** (solo lectura), **Estadísticas** anónimas y publicar **Circulares** desde *Salud pública*.

## Puesta en marcha del colegio (lista de verificación)

1. **Configuración:** elija la [modalidad de datos](/ayuda/modalidades-de-datos), confirme el nombre del colegio y la zona horaria (*America/Bogota*), active **MFA obligatorio para roles clínicos y administrativos** y habilite los canales de comunicación disponibles.
2. **Datos de estudiantes:**
   - *Con Phidias:* active la **Sincronización automática** y ejecute una sincronización **Completa**, luego **Fotos**, **Acudientes y contactos** e **Historial de encuestas**. Resuelva los conflictos.
   - *Independiente:* cree la **Estructura académica**, cargue los estudiantes con **Importar CSV** o **Nuevo estudiante** y suba sus fotos.
3. **Usuarios:** cree las cuentas de enfermería, médico, coordinación, psicología, directivos y portería con **correos institucionales**. Asigne a cada docente sus **grupos**.
4. **Portería:** cree el usuario de portería con **PIN de kiosco** y entregue el código del dispositivo al personal.
5. **Cumplimiento legal:** verifique que el perfil activo sea **Colombia** y revise los textos y versiones de los **consentimientos**.
6. **Familias:** coordine con enfermería o secretaría la entrega de **códigos de invitación** a los acudientes.
7. **Sistema:** verifique que las integraciones y el planificador de tareas estén activos y pruebe los respaldos con **Probar restauración**.

## Tareas periódicas

| Frecuencia | Tarea |
|---|---|
| Diaria | Revisar *Sistema → Tareas fallidas (24 h)* y la última sincronización con Phidias. |
| Semanal | Revisar conflictos de Phidias y usuarios bloqueados o sin MFA. |
| Mensual | **Probar restauración** de respaldos y revisar accesos a historias fuera de rol. |
| Cada periodo | Desactivar cuentas de personal que se retiró y actualizar asignaciones de grupos. |
| Anual | Revisar la matriz legal, publicar nuevas versiones de consentimientos si cambian y rotar secretos. |

> **Importante:** nunca cree cuentas compartidas. Cada persona debe tener su propio usuario para que la auditoría y la firma de las atenciones sean válidas.
