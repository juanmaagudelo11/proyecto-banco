# Matriz de pruebas de la fase 7

Copias aisladas de **MariaDB 10.4.32** y **MySQL 8.4.13** en Windows. Node.js 26.7.0 y npm 11.19.0. Las credenciales se generaron en memoria. Cada motor utilizó una cuenta de instalación y una cuenta de aplicación limitada a las tablas y columnas que requiere el simulador.

## Casos de la especificación

| Caso | Entrada o acción | Evidencia comprobada | MariaDB | MySQL |
| --- | --- | --- | --- | --- |
| CP-01 | Admin activo inicia sesión | HTTP 200, rol ADMIN y panel disponible | APROBADA | APROBADA |
| CP-02 | Contraseña web y PIN incorrectos | HTTP 401, mensaje genérico y sin cookie | APROBADA | APROBADA |
| CP-03 | Usuario y cuenta bloqueados | HTTP 403 en web y ATM | APROBADA | APROBADA |
| CP-04 | Alta ficticia con $ 25,00 iniciales | Cliente y cuenta activos, bcrypt y movimiento de apertura | APROBADA | APROBADA |
| CP-05 | Repetir documento o correo | HTTP 409 en ambos intentos y conteos conservados | APROBADA | APROBADA |
| CP-06 | Consignar $ 100,50 | Saldo de $ 950,50 y movimiento consistente en tres módulos | APROBADA | APROBADA |
| CP-07 | Transferir $ 150,25 a otra cuenta | Origen $ 800,25, destino $ 550,25, dos movimientos y total constante | APROBADA | APROBADA |
| CP-08 | Intentar gastar $ 800,26 con $ 800,25 disponibles | HTTP 409 en banca y ATM. Saldos y movimientos conservados | APROBADA | APROBADA |
| CP-09 | Transferir a la misma cuenta | HTTP 400 y saldos conservados | APROBADA | APROBADA |
| CP-10 | Retirar $ 50,25 con sesión ATM y repetir la clave | Saldo $ 750,00, un débito, un comprobante y mismo historial en tres módulos | APROBADA | APROBADA |

## Integridad y seguridad adicionales

| Prueba | Resultado en ambos motores |
| --- | --- |
| Seis solicitudes concurrentes con las cuatro conexiones ocupadas | Se esperó una conexión. Dos consignaciones, dos transferencias y dos retiros confirmados. Saldos de $ 753,00 y $ 552,25 y saldo global de $ 1.405,25. |
| Salud con toda la cola bloqueada y tras liberar conexiones | HTTP 503 alrededor de dos segundos con Express disponible, y HTTP 200 al recuperarse. |
| Sesiones, roles, titularidad, origen y archivos privados | Cruces de acceso denegados, sesión ATM separada, respuestas privadas con `no-store` y archivos internos sin servir. |
| Permisos de la cuenta SQL de aplicación | Operaciones del simulador aprobadas. Cambiar el número de cuenta o borrar cuentas y movimientos fue denegado por SQL. |
| Inmutabilidad en base | Los triggers rechazaron editar y borrar movimientos y transferencias confirmados en la base de prueba. |
| Error forzado al insertar un movimiento | Los tres módulos revirtieron sus operaciones. Saldos, historial, transferencias y comprobantes conservaron los conteos previos. |
| Cambio de estado con sesiones activas | Administración inactivó al titular. Banca y ATM denegaron sus sesiones abiertas y las revocaron al comprobar el estado. |

## Comandos y resultados

| Comando | Resultado real |
| --- | --- |
| `npm.cmd run test:integracion` antes de la corrección | FALLIDA en MariaDB. HTTP 500 en lecturas concurrentes de CP-06, CP-07 y CP-10, y en las seis escrituras bajo saturación. |
| `npm.cmd run test:integracion` después de la corrección | APROBADA. 18 de 18 en cada motor, incluidos los diez CP y la prueba de privilegios SQL. |
| Reejecución de `npm.cmd run test:integracion` tras aclarar la validación de entorno | APROBADA. 18 de 18 en MariaDB 10.4.32 con una base temporal nueva. Sin `MYSQL_PRUEBA_BASE`, la suite se detuvo antes de importar y mostró la variable faltante. |
| `npm.cmd run test:esquema` | APROBADA. 8 de 8 por motor. |
| `npm.cmd run test:autenticacion` | APROBADA. 6 de 6 por motor. |
| `npm.cmd run test:admin` | APROBADA. 7 de 7 por motor. |
| `npm.cmd run test:banca` | APROBADA. 8 de 8 por motor. |
| `npm.cmd run test:atm` | APROBADA. 8 de 8 por motor. |
| `npm.cmd test` | APROBADA. 7 de 7. |
| `npm.cmd audit --omit=dev --audit-level=low` | APROBADA. El registro no reportó avisos para las dependencias auditadas. |
| `git check-ignore backend/.env database.local.sql` y `git ls-files -- backend/.env database.local.sql` | APROBADA. Ambos archivos están excluidos y fuera del índice. |

Para repetir, sigue los pasos de [la suite integral en el README](../README.md#fase-7--prueba-integral-de-los-tres-módulos). Cada suite de regresión usa su propia base vacía y las variables de prueba de su fase.

La comprobación HTTPS adicional se ejecutó en MariaDB 10.4.32 aislada. Un proxy HTTPS local de Node reenvió las peticiones a Express en loopback con `NODE_ENV=production` y `ORIGEN_APP` apuntando al proxy. Se generó un certificado de prueba con `openssl req -x509` y un SAN de IP `127.0.0.1`. El cliente Node validó el certificado con su opción `ca` y verificó los accesos web y ATM, sus cookies `Secure`, la consulta de saldo y la revocación al salir.

## Demostración manual en XAMPP

Usa una base de demostración con las semillas regeneradas y las migraciones `003` y `006`. Desde `backend` ejecuta `npm.cmd start` y confirma que `/api/salud` responde HTTP 200. Anota los saldos actuales de ambas cuentas antes de comenzar.

1. Entra como administrador y consigna **$ 100,50** en `9000000001`.
2. Entra como `DEMO-002` y transfiere **$ 150,25** a `9000000002`.
3. Identifícate en el cajero con `9000000001` y retira **$ 50,25**. Expulsa la sesión.
4. Compara el saldo de origen de Banca virtual con el comprobante del cajero. Como administrador, filtra por cuenta y comprueba los tres movimientos. En origen espera **$ 100,00 menos** que el saldo que anotaste. En destino espera **$ 150,25 más**. Con los saldos originales de la semilla, eso equivale a **$ 750,00** y **$ 550,25**.

La matriz automatizada se ejecutó con bases aisladas. La demostración manual en la base del usuario y la validación visual en varios navegadores quedaron pendientes.
