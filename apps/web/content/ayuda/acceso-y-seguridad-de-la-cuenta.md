---
title: Acceso y seguridad de la cuenta
description: Cómo iniciar sesión, elegir el colegio, activar la verificación en dos pasos, cambiar la contraseña, crear una cuenta de acudiente e ingresar al kiosco de portería.
category: primeros-pasos
roles: Todos
keywords: iniciar sesión, contraseña, verificación en dos pasos, MFA, TOTP, cuenta bloqueada, código de invitación, kiosco
order: 2
updated: 2026-09-15
---

## Iniciar sesión con usuario y contraseña

1. Abra la dirección de MediSchool de su colegio y seleccione **Iniciar sesión** (arriba a la derecha).
2. En la pestaña **Usuario**, escriba su **Correo electrónico** y su **Contraseña**.
3. Pulse **Iniciar sesión**.
4. MediSchool lo lleva automáticamente a la pantalla de inicio de su rol: enfermería al *Tablero en vivo*, docentes a *Mi clase*, familias a *Inicio*, portería a *Portería*, directivos a *Estadísticas* y administradores a *Administración*.

![Pantalla de inicio de sesión de MediSchool con las pestañas Usuario y Kiosco](/ayuda/capturas/login.jpg "Pantalla de inicio de sesión")

> **Consejo:** el personal del colegio debe usar su correo institucional. Si su correo está registrado en más de un colegio, después de escribir la contraseña aparecerá la lista **Colegio** para que elija a cuál entrar.

### Primer ingreso con contraseña temporal

Cuando la administración crea su cuenta o restablece su contraseña, recibe una **contraseña temporal**. Al ingresar con ella, MediSchool le pedirá definir una nueva en la pantalla **Cambiar contraseña**:

1. Escriba la **Contraseña actual** (la temporal).
2. Escriba la **Nueva contraseña** y repítala en **Confirmar**.
3. Pulse **Guardar contraseña**.

Use una contraseña larga que combine letras, números y símbolos, y que no use en otros servicios. Si no cumple los requisitos de seguridad, MediSchool se lo indicará.

## Verificación en dos pasos (TOTP)

La verificación en dos pasos agrega un código de 6 dígitos que cambia cada 30 segundos y que genera una aplicación autenticadora en su celular (Google Authenticator, Microsoft Authenticator u otra similar). Es **muy recomendable** para enfermería, médicos, coordinación, psicología y administradores, y el colegio puede hacerla **obligatoria**.

### Activarla desde su perfil

1. Abra el **menú de usuario** (icono de persona, arriba a la derecha) y elija **Seguridad y preferencias**, o vaya a **Mi perfil**.
2. En la tarjeta **Seguridad**, junto a *Verificación en dos pasos (TOTP)*, pulse **Configurar**.
3. Escanee el código QR con la aplicación autenticadora. Si no puede escanearlo, escriba la clave que aparece debajo.
4. Escriba el código de 6 dígitos que muestra la aplicación y pulse **Activar**.

A partir de ese momento, después de la contraseña, MediSchool mostrará la pantalla **Verificación en dos pasos** para que escriba el código.

### Si el colegio la exige y aún no la tiene

Al iniciar sesión verá directamente el código QR. Escanéelo, escriba el código y pulse **Verificar**. Solo se hace una vez.

> **Importante:** si cambia de celular o pierde la aplicación autenticadora, pida a la administración **Restablecer MFA**. Después podrá configurarla de nuevo.

## Contraseña olvidada o cuenta bloqueada

- Por seguridad, después de **5 intentos fallidos** la cuenta se bloquea durante **15 minutos**.
- Si olvidó la contraseña, comuníquese con la administración del colegio. En *Administración → Usuarios* pueden **Restablecer contraseña** (le entregarán una temporal) o **Desbloquear** la cuenta.
- Nunca comparta su contraseña ni su código de verificación. El personal del colegio nunca se los pedirá.

## Crear una cuenta de acudiente con código de invitación

Las familias no se registran libremente: necesitan un **código de invitación** que genera enfermería o la secretaría desde la ficha del estudiante. El código vincula la cuenta con el estudiante correcto.

1. Abra el enlace que recibió o vaya a **Iniciar sesión** y pulse **Crear cuenta** (debajo del formulario: *¿Es acudiente y tiene un código de invitación?*).
2. Complete **Código de invitación**, **Nombres**, **Apellidos**, **Documento**, **Celular**, **Correo**, **Contraseña** y **Confirmar contraseña**.
3. Pulse **Crear cuenta**. Entrará directamente al portal de familias.

Si tiene varios hijos en el colegio, pida una invitación por cada uno o solicite que los vinculen a su cuenta existente.

## Ingresar al kiosco de portería

La tablet de portería usa un acceso especial, sin correo, con sesión larga:

1. En **Iniciar sesión**, elija la pestaña **Kiosco**.
2. Escriba el **Colegio (identificador)**, el **Código del dispositivo** y el **PIN** que entregó la administración.
3. Pulse **Iniciar sesión**. La pantalla queda en modo portería, sin menú lateral.

Consulte la [guía de portería](/ayuda/rol-porteria) para el uso diario.

## Cerrar sesión

- En computador: botón de salida al lado de su nombre, en la parte inferior del menú lateral.
- En celular: **Más → Cerrar sesión**, o desde el **menú de usuario**.

Cierre siempre la sesión en equipos compartidos. Las sesiones también expiran automáticamente después del tiempo configurado por el colegio (por defecto, 8 horas).

## Buenas prácticas de seguridad

- Active la verificación en dos pasos si maneja información clínica.
- Bloquee el celular con PIN o huella.
- No tome capturas de pantalla de información clínica ni la reenvíe por chats personales.
- Si sospecha que alguien usó su cuenta, cambie la contraseña de inmediato y avise a la administración: la [auditoría](/ayuda/cumplimiento-legal-y-auditoria) registra cada acceso.
