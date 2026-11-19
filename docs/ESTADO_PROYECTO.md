# Estado del proyecto

## Fase 1 — Preparación del entorno y esqueleto funcional

**Estado técnico: APROBADA.** Verificación local del 18 de noviembre de 2026. El usuario aprobó la fase antes de iniciar la fase 2.

**Requisitos cubiertos.** Infraestructura REST y arquitectura por capas de la especificación, configuración privada y exclusiones de Git, frontend Bootstrap con `fetch` y manejo básico de errores. RF-01 a RF-16 y las reglas de negocio financieras corresponden a las fases que indica `AGENTS.md`.

**Archivos de la fase.**

- Raíz: `.gitignore` y `README.md`.
- Backend: `.env.example`, `package.json`, `package-lock.json`, `src/app.js`, `src/baseDatos/index.js`, `src/modelos/salud.js`, `src/servicios/saludServicio.js`, `src/controladores/saludControlador.js`, `src/rutas/saludRutas.js`, `src/intermediarios/manejarErrores.js` y `test/salud.test.js`.
- Frontend: `index.html`, `css/estilos.css` y `js/api.js`.
- Documentación: `PLAN_FASES.md`, `decisiones.md` y este registro.
- Estado local: repositorio Git en la rama `main` y `backend/.env` con campos de credenciales vacíos. Sin commits ni publicación remota.

| Prueba | Comando o procedimiento | Resultado |
| --- | --- | --- |
| Instalación de dependencias | `npm.cmd install --no-audit --no-fund` desde `backend` | **APROBADA**. 78 paquetes y archivo de bloqueo generado. |
| API, archivos públicos y errores seguros | `npm.cmd test` desde `backend` | **APROBADA**. 5 de 5 casos. Verificador simulado para HTTP 200, conexión TCP interrumpida de mysql2 y configuración incompleta para HTTP 503, archivos públicos y exclusiones HTTP 404, y error genérico HTTP 500. |
| Arranque y salud sin configuración MySQL | `node src/app.js` desde `backend`; petición a `GET /api/salud` | **APROBADA**. HTTP 503, Express disponible y MySQL no disponible. |
| Portada en Edge | Microsoft Edge con `--headless=new --dump-dom` contra el servidor local | **APROBADA**. El JavaScript consultó la API y mostró ambos estados esperados con MySQL sin configurar. |
| Salud con MySQL real | MySQL Community Server portátil 8.4.13 en loopback, base vacía `simulador_fase1_prueba`, usuario local de lectura y `node src/app.js` | **APROBADA**. HTTP 200 con Express y MySQL disponibles. Se comprobó que la credencial ficticia no apareciera en el cuerpo de la respuesta ni en la salida de Express. |
| Exclusiones | `git check-ignore backend/.env backend/node_modules` y `git ls-files -- backend/.env backend/node_modules` | **APROBADA**. Ambos paths ignorados y el segundo comando con salida vacía. |

**No ejecutadas.** La revisión interactiva del botón está en la guía manual de `README.md`; se verificó la carga y ejecución de `fetch` en Edge sin interfaz. Los casos CP-01 a CP-10 dependen de funcionalidades reservadas a fases posteriores.

**Entorno.** Node.js v26.7.0 y npm 11.19.0. Git se inicializó con MinGit portátil porque el equipo no tenía Git disponible en PATH. MySQL se ejecutó temporalmente sin registrar un servicio. Los comandos y el flujo manual están en [README.md](../README.md).

**Cierre.** Fase 1 aprobada por el usuario.

## Fase 2 — Esquema MySQL, datos de prueba y restricciones

**Estado técnico: APROBADA.** La fase fue autorizada y verificada el 18 de noviembre de 2026.

**Requisitos cubiertos.** Persistencia MySQL relacional, script inicial reproducible, modelos y hashes bcrypt. RN-03 en el esquema mediante unicidad de documento, correo y cuenta. RN-04, RN-06 y RN-07 mediante restricciones de importes y saldos, cuentas distintas e inmutabilidad del historial. La semilla comprueba el registro doble de RN-05 en una transacción de importación. Los servicios de autorización y de transacciones corresponden a las fases indicadas en el plan.

**Archivos creados.** `database.sql`, `backend/src/modelos/{usuario,cuenta,movimiento,transferencia}.js`, `backend/herramientas/generarSemillas.js`, `backend/test/semillas.test.js` y `backend/pruebasIntegracion/esquema.js`.

**Archivos modificados.** `.gitignore`, `backend/package.json`, `backend/package-lock.json`, `README.md`, `docs/decisiones.md` y este registro.

| Prueba | Comando o procedimiento | Resultado |
| --- | --- | --- |
| Dependencia para hashes | `npm.cmd install bcrypt@^6.0.0 --no-audit --no-fund` desde `backend` | **APROBADA**. bcrypt 6.0.0 cargó y ejecutó su implementación nativa en Windows. |
| Salud y regeneración de semillas | `npm.cmd test` desde `backend` | **APROBADA**. 7 de 7 casos después de repetir fuera del sandbox, que había bloqueado los procesos de Node con `spawn EPERM`. Incluye comprobación de siete hashes nuevos con bcrypt, PIN con cero inicial y rechazo de entradas inválidas. |
| Importación y restricciones | `npm.cmd run test:esquema` con MySQL 8.4.13 portátil en loopback y una base nueva `simulador_fase2_prueba_local` | **APROBADA**. 8 de 8 comprobaciones del ejecutor. 4 usuarios, 3 cuentas, 5 movimientos, 1 transferencia. Se verificaron precisión, unicidad, FK, restricciones, inmutabilidad, consultas y conciliación. |
| Protección de la base de prueba | Repetición de la suite contra la misma base ya poblada | **APROBADA**. La suite rechazó la segunda importación y los conteos se mantuvieron en 4 usuarios y 5 movimientos. |
| Generador como comando | `npm.cmd run semillas:generar` en una copia temporal | **APROBADA**. Creó un SQL con siete hashes y rechazó sobrescribirlo al repetir. |

**No ejecutadas.** Importación manual en la interfaz de Workbench y casos CP-01 a CP-10. La importación y la validación del esquema se ejecutaron con MySQL real a través de mysql2. El procedimiento manual en Windows está en [README.md](../README.md#fase-2--esquema-y-datos-de-demostración).

**Cierre.** El usuario aprobó las pruebas de la fase 2 y autorizó la fase 3.

### Compatibilidad con XAMPP y MariaDB

- Se detectó XAMPP en `C:/xampp` con MariaDB 10.4.32. Se cambió el cotejamiento de las cuatro tablas a `utf8mb4_unicode_ci` y se adaptó la suite para reconocer el código de error de `CHECK` de cada motor.
- **APROBADA** — `npm.cmd run test:esquema`: 8 de 8 verificaciones en MariaDB 10.4.32 y 8 de 8 en MySQL 8.4.13. En ambos casos se usó una instancia temporal y una base exclusiva de prueba. La suite rechazó repetir la importación sobre la misma base poblada.
- **APROBADA** — `GET /api/salud`: HTTP 200 con un usuario local con permiso `SELECT` en ambos motores.
- **NO EJECUTADA** — Importación manual desde phpMyAdmin en la base del usuario. El procedimiento está en [README.md](../README.md#importar-con-xampp-y-phpmyadmin).

## Fase 3 — Autenticación, sesiones y roles

**Estado técnico: APROBADA.** Alcance autorizado por el usuario tras la verificación de la fase 2.

**Requisitos cubiertos.** RF-01 y RF-02, y control de estado RN-02 para el acceso web. Las sesiones web son independientes del futuro acceso ATM de RF-13. La identificación con PIN corresponde a la fase 6.

**Implementación.** Inicio por correo o documento y contraseña bcrypt. Sesiones web de 30 minutos persistidas en SQL, cierre con revocación, comprobación de rol y estado por petición protegida, origen estricto y límite de intentos. Portada con enlace de acceso y vistas protegidas de administrador y cliente.

**Archivos de la fase.** Migración `migraciones/003_sesiones_web.sql`. Backend en `src/app.js`, `src/baseDatos/index.js`, `src/modelos/{cuenta,sesion,usuario}.js`, `src/servicios/autenticacionServicio.js`, `src/controladores/autenticacionControlador.js`, `src/rutas/autenticacionRutas.js`, `src/intermediarios/{manejarErrores,verificarOrigen,verificarRol,verificarSesion}.js` y `pruebasIntegracion/autenticacion.js`. También se actualizaron `.env.example`, `package.json` y `package-lock.json`. Frontend en `index.html`, `paginas/{inicioSesion,panelAdministrador,bancaVirtual}.html` y `js/{autenticacion,sesion}.js`. Documentación en `README.md`, `docs/decisiones.md` y este registro.

| Verificación | Comando o procedimiento | Resultado |
| --- | --- | --- |
| Instalación | `npm.cmd install cookie-parser express-rate-limit --no-audit --no-fund` | **APROBADA**. Se añadieron los paquetes y se actualizó el archivo de bloqueo. |
| Regresión de fases anteriores | `npm.cmd test` desde `backend` | **APROBADA**. 7 de 7 pruebas. |
| Autenticación sobre MariaDB | `npm.cmd run test:autenticacion` con MariaDB 10.4.32, base vacía y semillas de prueba aisladas | **APROBADA**. 6 de 6 comprobaciones del ejecutor. |
| Autenticación sobre MySQL | `npm.cmd run test:autenticacion` con MySQL 8.4.13 y base vacía aislada | **APROBADA**. 6 de 6 comprobaciones del ejecutor. |
| Inicio, redirección y salida en navegador | Microsoft Edge sin interfaz, Express real y MariaDB 10.4.32 aislada con usuario SQL de permisos mínimos | **APROBADA**. ADMIN por correo y CLIENTE por documento llegaron a su vista y volvieron al formulario al salir. Se comprobó que la salida de Express no incluyera las contraseñas ficticias. |
| Cookie segura y vigencia | Integración HTTP de prueba con origen HTTPS configurado; ajuste de vencimiento en la base aislada | **APROBADA**. `Secure`, `HttpOnly`, `SameSite=Strict`, prefijo HTTPS y denegación tras vencimiento. |

**No ejecutadas.** Conexión HTTPS de extremo a extremo tras un proxy y login en la base activa del usuario. Se mantuvieron intactos los datos de la base activa y su `backend/.env`. Los pasos para reproducir los accesos con credenciales ficticias elegidas por el usuario están en [README.md](../README.md#fase-3--inicio-de-sesión-en-xampp).

**Cierre.** El usuario aprobó las pruebas de la fase 3 y autorizó la fase 4.

## Fase 4 — Administración

**Estado técnico: APROBADA.** El usuario autorizó la fase después de verificar la fase 3.

**Requisitos cubiertos.** RF-03, RF-04, RF-06, RF-07 y RF-08. El servidor aplica RN-01, RN-02, RN-03, RN-04 y RN-07 en las operaciones de esta fase. Saldo y movimientos de apertura y consignación se confirman en la misma transacción.

**Implementación.** Panel de ADMIN con métricas SQL, alta y detalle de cliente y cuentas, búsqueda paginada, edición acotada con confirmación de estados, consignación y filtros del historial. El servicio valida rol, origen, titularidad de la cuenta, estado y precisión monetaria. Las consultas omiten las credenciales y se mantienen las restricciones del esquema actual.

**Archivos de la fase.** Backend en `src/modelos/administracion.js`, `src/servicios/{adminServicio,errorApi,importes}.js`, `src/controladores/adminControlador.js`, `src/rutas/adminRutas.js`, `src/intermediarios/manejarErrores.js`, `src/app.js`, `pruebasIntegracion/admin.js` y `package.json`. Frontend en `paginas/panelAdministrador.html`, `css/administrador.css` y `js/administrador.js`. Documentación en `README.md`, `docs/decisiones.md` y este registro.

| Verificación | Comando o procedimiento | Resultado |
| --- | --- | --- |
| Panel y API sobre MariaDB | `npm.cmd run test:admin` con MariaDB 10.4.32 y base vacía aislada | **APROBADA**. 7 de 7 comprobaciones del ejecutor. |
| Panel y API sobre MySQL | `npm.cmd run test:admin` con MySQL 8.4.13 y base vacía aislada | **APROBADA**. 7 de 7 comprobaciones del ejecutor. |
| Regresión de esquema y acceso | `npm.cmd run test:esquema` y `npm.cmd run test:autenticacion` en ambos motores | **APROBADA**. 8 de 8 y 6 de 6 en cada motor. |
| Regresión del backend | `npm.cmd test` desde `backend` | **APROBADA**. 7 de 7 pruebas. |
| Demostración en navegador | Edge sin interfaz contra Express y MariaDB 10.4.32 aislada, con los permisos de aplicación del README | **APROBADA**. Métricas, alta, búsqueda, detalle, edición, cancelación y confirmación de bloqueo, reactivación, consignación e historial. A 390 px las tablas desplazaron dentro de su sección. |
| Atomicidad y concurrencia | Solicitudes simultáneas y trigger de fallo en el último caso de `npm.cmd run test:admin` | **APROBADA** en ambos motores. Dos consignaciones quedaron en secuencia con saldo exacto. El fallo al registrar el movimiento revirtió la consignación y el alta con saldo inicial. |

**No ejecutadas.** La demostración en la base activa del usuario y en otros navegadores. La ejecución en Edge usó un cliente ficticio y una base aislada. El procedimiento de permisos, arranque y prueba manual está en [README.md](../README.md#fase-4--administración-en-xampp).

**Cierre.** El usuario aprobó las pruebas de la fase 4 y autorizó la fase 5.

## Fase 5 — Banca virtual y transferencias

**Estado técnico: APROBADA.** Alcance autorizado tras la verificación de la fase 4.

**Requisitos cubiertos.** RF-09 a RF-12 y RN-01 a RN-07 en el alcance de banca virtual. Se verificaron CP-07, la parte de transferencias de CP-08 y CP-09.

**Implementación.** Resumen de cuentas propias, selector de cuenta activa, historial privado paginado, edición de correo y teléfono y cambio de contraseña con revocación de las sesiones web. Las transferencias validan titularidad, estados y fondos. En una transacción confirman dos saldos, un registro de transferencia y dos movimientos. Las pantallas usan el formato COP compartido.

**Archivos de la fase.** Backend en `src/baseDatos/transaccion.js`, `src/controladores/clienteControlador.js`, `src/rutas/clienteRutas.js`, `src/servicios/bancaServicio.js`, `src/intermediarios/validarEscritura.js`, `src/modelos/{cuenta,movimiento,sesion,transferencia,usuario}.js`, `src/app.js` y `pruebasIntegracion/banca.js`. La fase reutiliza los bloqueos y el validador en Administración, y coordina el inicio web con la revocación por contraseña. Frontend en `paginas/bancaVirtual.html`, `css/bancaVirtual.css`, `js/bancaVirtual.js`, `js/formatoMonetario.js` y el importador administrativo. Se actualizó `backend/package.json` y la documentación.

| Verificación | Comando o procedimiento | Resultado |
| --- | --- | --- |
| Banca virtual sobre MariaDB | `npm.cmd run test:banca` con MariaDB 10.4.32 y base vacía aislada | **APROBADA**. 8 de 8 comprobaciones del ejecutor. |
| Banca virtual sobre MySQL | `npm.cmd run test:banca` con MySQL 8.4.13 y base vacía aislada | **APROBADA**. 8 de 8 comprobaciones del ejecutor. |
| Privacidad, perfil y sesión | Casos de autorización y contraseña de `npm.cmd run test:banca` | **APROBADA** en ambos motores. Se rechazó acceso ajeno y edición de campos protegidos. El cambio de contraseña invalidó dos sesiones activas y la contraseña anterior. |
| Atomicidad y concurrencia | Solicitudes en direcciones opuestas, intentos simultáneos de doble gasto y fallo inyectado al escribir el crédito | **APROBADA** en ambos motores. Las dos transferencias cruzadas se confirmaron. Del doble intento se confirmó una sola transferencia. El fallo revirtió saldos y registros. |
| Regresiones | `npm.cmd test` más `npm.cmd run test:esquema`, `npm.cmd run test:autenticacion` y `npm.cmd run test:admin` en bases aisladas de ambos motores | **APROBADA**. 7 de 7 del backend y, por motor, 8 de 8 del esquema, 6 de 6 de autenticación y 7 de 7 de Administración. |
| Demostración en navegador | Edge con Express y MariaDB 10.4.32 aislada, usando los permisos mínimos de la guía | **APROBADA**. Selector, saldo COP, historial, transferencia, perfil y reingreso con contraseña nueva. Vista comprobada a 390 px sin desplazamiento horizontal general. |

**No ejecutadas.** Prueba en la base activa del usuario y en otros navegadores. El procedimiento de permisos, arranque y prueba manual está en [README.md](../README.md#fase-5--banca-virtual-y-transferencias-en-xampp).

**Cierre.** El usuario aprobó las pruebas de la fase 5 y autorizó la fase 6.

## Fase 6 — Cajero ATM

**Estado técnico: APROBADA.** Alcance autorizado tras la verificación de la fase 5.

**Requisitos cubiertos.** RF-13 a RF-16, control de estados RN-02, prohibición de sobregiro RN-04 e historial inmutable RN-07 en el alcance de ATM. Se verificó CP-10 y la parte de retiro de CP-08.

**Implementación.** Acceso por número de cuenta y PIN bcrypt, límites por cuenta e IP, sesión ATM independiente de cinco minutos y expulsión. El cajero consulta un saldo y hasta cinco movimientos. Los retiros validan el importe, el estado del titular y de la cuenta y la vigencia de la sesión. El débito, el movimiento y la referencia de una solicitud con clave se confirman en la misma transacción. La vista presenta el comprobante y los importes en COP.

**Archivos de la fase.** `migraciones/006_atm.sql`; backend `src/modelos/{atm,movimiento}.js`, `src/servicios/{atmServicio,seguridadSesion,autenticacionServicio}.js`, `src/controladores/atmControlador.js`, `src/rutas/atmRutas.js`, `src/app.js`, `pruebasIntegracion/atm.js` y `package.json`; frontend `index.html`, `paginas/cajeroAtm.html`, `css/cajeroAtm.css` y `js/cajeroAtm.js`. Documentación en `README.md`, `docs/decisiones.md` y este registro.

| Verificación | Comando o procedimiento | Resultado |
| --- | --- | --- |
| Cajero sobre MariaDB | `npm.cmd run test:atm` con MariaDB 10.4.32 y base vacía aislada | **APROBADA**. 8 de 8 comprobaciones. |
| Cajero sobre MySQL | `npm.cmd run test:atm` con MySQL 8.4.13 y base vacía aislada | **APROBADA**. 8 de 8 comprobaciones. |
| Seguridad y estados | Casos de PIN, sesión, origen y límite de intentos en ambos motores | **APROBADA**. Se comprobó cero inicial, bloqueo, expiración, expulsión, separación de sesión web, cookie `Secure` con origen HTTPS y límites por cuenta e IP. |
| Integridad del retiro | Pruebas de duplicado y de concurrencia, y trigger de fallo dentro de `test:atm` | **APROBADA**. Una clave repetida produjo un solo movimiento. Retiros distintos no causaron sobregiro. Un fallo al registrar la solicitud revirtió el débito y el movimiento. |
| Coherencia entre módulos | Lecturas ATM, banca y administración tras retirar 50,25 COP | **APROBADA**. Saldo de 799,75 COP y movimiento `RETIRO` visible en los tres módulos. |
| Regresiones | `npm.cmd test` y suites `test:esquema`, `test:autenticacion`, `test:admin`, `test:banca` | **APROBADA**. 7 de 7 del backend y, por motor, 8 de 8 de esquema, 6 de 6 de autenticación, 7 de 7 de Administración y 8 de 8 de Banca. |
| Demostración en navegador | Edge con Express y MariaDB 10.4.32 aislada, usando permisos limitados | **APROBADA**. Identificación con PIN de cero inicial, vista a 390 px, monto rápido, rechazo por saldo insuficiente, retiro personalizado, comprobante COP, historial y expulsión. |

**No ejecutadas.** Prueba en la base activa del usuario, otros navegadores y HTTPS de extremo a extremo. El procedimiento de migración, permisos y prueba está en [README.md](../README.md#fase-6--cajero-atm-en-xampp).

**Pendiente.** Aprobación expresa de la fase 6. Fase 7 sin iniciar.
