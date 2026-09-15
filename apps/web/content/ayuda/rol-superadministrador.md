---
title: Guía para superadministradores (grupos de colegios)
description: Cómo el superadministrador gestiona varios colegios en una misma instalación de MediSchool, crea colegios con su perfil legal y administrador inicial, y cuida el aislamiento de datos.
category: roles
roles: Superadministrador
keywords: superadministrador, multicolegio, red de colegios, crear colegio, tenant, perfil legal
order: 11
updated: 2026-09-15
---

El superadministrador existe para **redes o grupos de colegios** que comparten una instalación de MediSchool. Tiene todos los permisos y, además, la pestaña **Colegios** en *Administración*.

## Aislamiento entre colegios

Cada colegio es un espacio independiente. La base de datos aplica **seguridad a nivel de fila**: un usuario solo puede leer y escribir información de su propio colegio, aunque exista un error en la aplicación. Si su correo existe en varios colegios, al iniciar sesión elegirá a cuál entrar.

## Crear un colegio

1. Vaya a **Administración → Colegios**.
2. Complete:
   - **Nombre:** nombre oficial del colegio.
   - **Identificador (slug):** código corto en minúsculas y sin espacios, por ejemplo `colegio-norte`. Se usa en el kiosco de portería.
   - **Perfil legal:** país cuyas normas aplican (Colombia, Estados Unidos, Alemania, México, Argentina, Chile, Perú, Brasil o España).
   - **Correo del administrador:** la primera cuenta de administración del nuevo colegio.
3. Pulse **Crear colegio**.
4. En *Colegio creado*, copie las credenciales temporales del administrador y entréguelas de forma segura. Deberá cambiar la contraseña al ingresar.

El nuevo colegio se crea con roles y permisos, plantillas de atención, consentimientos, catálogos de medicamentos e insumos, y la configuración del perfil legal elegido.

## Buenas prácticas

- Use la cuenta de superadministrador solo para tareas de red; para el trabajo diario de un colegio use una cuenta de administrador de ese colegio.
- Active siempre la verificación en dos pasos.
- Revise que cada colegio tenga su propio perfil legal activo y su configuración de canales.
- Coordine la integración con Phidias por colegio: cada uno tiene su propio token y su sincronización.
