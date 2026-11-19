# Simulador Bancario Web

Proyecto académico. La fase 1 ofrece una portada de diagnóstico y una API local de salud.

## Fase 1 en Windows 11 con VS Code

1. Instala [Node.js 26 LTS](https://nodejs.org/en/download) o Node.js 24 LTS y [Git para Windows](https://git-scm.com/install/windows). Abre la carpeta del proyecto en VS Code mediante **Archivo → Abrir carpeta**.
2. Abre **Terminal → Nueva terminal** y selecciona PowerShell. Desde la raíz ejecuta:

   ```powershell
   node --version
   npm.cmd --version
   git --version
   Set-Location backend
   npm.cmd ci
   if (-not (Test-Path .env)) { Copy-Item .env.example .env }
   npm.cmd test
   npm.cmd start
   ```

3. Abre [http://127.0.0.1:3000](http://127.0.0.1:3000) en Edge o Chrome y pulsa **Comprobar estado**. Con la plantilla de entorno, verás **Servidor HTTP: Disponible** y **MySQL: No disponible**.
4. Abre otra terminal integrada y usa `curl.exe -i http://127.0.0.1:3000/api/salud`. Con MySQL sin configurar, la API devuelve HTTP 503 y los estados `servidor: disponible` y `baseDatos: no_disponible` en `datos`. Una ruta inexistente devuelve HTTP 404 con el mismo formato JSON.
5. Para verificar MySQL, instala [MySQL Community Server 8.4 LTS](https://dev.mysql.com/downloads/mysql/8.4.html) si aún no lo tienes. En MySQL Workbench o en el cliente `mysql`, prepara una base vacía exclusiva para pruebas, por ejemplo `simulador_fase1_prueba`, y un usuario local dedicado con acceso de lectura a esa base. Edita `backend/.env` con `MYSQL_HOST`, `MYSQL_PUERTO`, `MYSQL_BASE`, `MYSQL_USUARIO` y `MYSQL_CONTRASENA`. Detén el proceso con **Ctrl+C**, ejecuta de nuevo `npm.cmd start` y repite la comprobación. Con credenciales y base válidas, ambos estados serán **Disponible**, con HTTP 200 y `exito: true`. La consulta es `SELECT 1` y la base puede estar vacía.
6. Desde la raíz, si la carpeta aún carece de repositorio Git, ejecuta `git init`. Ejecuta `git check-ignore backend/.env backend/node_modules` y confirma que aparecen ambas rutas. `git ls-files -- backend/.env backend/node_modules` debe mostrar una salida vacía.

La API y los archivos públicos comparten origen. El servidor escucha en `127.0.0.1` y sirve Bootstrap localmente. Si cambias `PUERTO`, usa el nuevo puerto en el navegador y en los comandos. Conserva las credenciales de prueba en el archivo `backend/.env`.

Consulta [el estado de la fase](docs/ESTADO_PROYECTO.md), [el plan](docs/PLAN_FASES.md) y [las decisiones](docs/decisiones.md).

## Fase 2 — Esquema y datos de demostración

### Importar con XAMPP y phpMyAdmin

El panel de XAMPP muestra **MySQL** para iniciar el servicio MariaDB. La importación de la fase 2 admite MariaDB 10.4 de XAMPP y MySQL Community Server 8.4. Si usas XAMPP, mantén el proyecto abierto en VS Code y sigue estos pasos. [Componentes de XAMPP para Windows](https://www.apachefriends.org/download.html).

1. En XAMPP Control Panel, inicia **Apache** y **MySQL** si aún están detenidos. Pulsa **Admin** en la fila de MySQL para abrir phpMyAdmin.
2. En **SQL** ejecuta `SELECT VERSION() AS version, @@port AS puerto;`. Anota el valor de `puerto` para `MYSQL_PUERTO`. En XAMPP 10.4.32, la columna `version` incluye `MariaDB`.
3. En **Bases de datos**, crea una base vacía llamada `simulador_fase2_demo` con cotejamiento `utf8mb4_unicode_ci`. Selecciónala en el panel izquierdo.
4. Abre **Importar**, elige [database.sql](database.sql), selecciona **UTF-8** y el formato **SQL**, y pulsa **Importar**. Si ya hay tablas de un intento anterior, crea otra base vacía con un nombre distinto. [Importar en phpMyAdmin](https://docs.phpmyadmin.net/en/latest/import_export.html#import).
5. Confirma que aparezcan cuatro tablas. Abre **SQL** en la base y ejecuta `SELECT numero_cuenta, saldo, estado FROM cuentas ORDER BY id_cuenta;`. Deben aparecer los saldos `850.00`, `400.00` y `75.00`. La última cuenta figura como `BLOQUEADO`.
6. Para Express, crea en phpMyAdmin un usuario local con contraseña y permiso `SELECT` sobre esa base. En `backend/.env` usa `MYSQL_HOST=127.0.0.1`, el puerto del paso 2, `MYSQL_BASE=simulador_fase2_demo` (o el nombre elegido), `MYSQL_USUARIO` y `MYSQL_CONTRASENA` del usuario local. Desde `backend` ejecuta `npm.cmd start`. `curl.exe -i http://127.0.0.1:3000/api/salud` debe devolver HTTP 200 y `baseDatos: disponible`.

### Importar con MySQL Community Server 8.4

1. Abre en VS Code la carpeta raíz y usa una instalación local de MySQL Community Server 8.4 LTS.
2. En MySQL Workbench, conéctate a tu instancia local con una cuenta autorizada para crear tablas y triggers. En el editor SQL, crea y selecciona **una base nueva y vacía**:

   ```sql
   CREATE DATABASE simulador_fase2_demo CHARACTER SET utf8mb4;
   USE simulador_fase2_demo;
   ```

3. Abre [database.sql](database.sql) en Workbench y ejecútalo completo con `simulador_fase2_demo` como base activa. El archivo crea las tablas y carga las semillas en una transacción. Si quieres repetir la importación, elige un nombre nuevo. En el cliente `mysql` puedes usar `SOURCE database.sql;` desde la raíz después de seleccionar la base.
4. Consulta los saldos y el número de movimientos por cuenta:

   ```sql
   SELECT c.numero_cuenta, c.saldo, c.estado, COUNT(m.id_movimiento) AS movimientos
   FROM cuentas AS c
   LEFT JOIN movimientos AS m ON m.id_cuenta = c.id_cuenta
   GROUP BY c.id_cuenta, c.numero_cuenta, c.saldo, c.estado
   ORDER BY c.id_cuenta;
   ```

   | Cuenta ficticia | Saldo | Estado | Movimientos |
   | --- | ---: | --- | ---: |
   | 9000000001 | 850.00 | ACTIVO | 2 |
   | 9000000002 | 400.00 | ACTIVO | 2 |
   | 9000000003 | 75.00 | BLOQUEADO | 1 |

5. Para verificar la conexión desde Express, asigna `MYSQL_BASE=simulador_fase2_demo` en `backend/.env`, configura el resto de las variables MySQL y sigue las instrucciones de arranque de la fase 1. Usa una cuenta distinta a la de instalación, con permiso de lectura sobre la base de demostración. La API de salud verifica la conexión con `SELECT 1`.

### Ejecutar las pruebas de integridad

En XAMPP o en MySQL 8.4, crea otra base vacía, por ejemplo `simulador_fase2_prueba`. Usa un servidor local y una cuenta de prueba autorizada a crear tablas y triggers en ese esquema. Si la configuración de MySQL restringe la creación de triggers, usa una cuenta de administración de la instancia local de prueba. La suite rechaza nombres fuera del prefijo de pruebas y las bases que ya contienen tablas. Usará la base elegida para importar y verificar los datos. Para repetir, crea una base nueva con un sufijo, por ejemplo `simulador_fase2_prueba_2`.

Desde la raíz, en PowerShell:

```powershell
Set-Location backend
npm.cmd ci
npm.cmd test
$env:MYSQL_PRUEBA_BASE = 'simulador_fase2_prueba'
$env:MYSQL_PRUEBA_PUERTO = '3306'
$env:MYSQL_PRUEBA_USUARIO = Read-Host 'Usuario MySQL de prueba'
$env:MYSQL_PRUEBA_CONTRASENA = [System.Net.NetworkCredential]::new('', (Read-Host 'Contraseña MySQL de prueba' -AsSecureString)).Password
try {
    npm.cmd run test:esquema
} finally {
    Remove-Item Env:MYSQL_PRUEBA_CONTRASENA
}
```

### Regenerar las semillas con credenciales ficticias propias

El SQL versionado contiene hashes de valores aleatorios. Para elegir valores conocidos de prueba, ejecuta desde `backend`:

```powershell
$campos = 'ADMIN', 'CLIENTE_1', 'CLIENTE_2', 'CLIENTE_3', 'PIN_1', 'PIN_2', 'PIN_3'
try {
    foreach ($campo in $campos) {
        $entrada = Read-Host "Valor ficticio para $campo" -AsSecureString
        Set-Item -LiteralPath "Env:SEMILLA_$campo" -Value ([System.Net.NetworkCredential]::new('', $entrada).Password)
    }
    npm.cmd run semillas:generar
} finally {
    foreach ($campo in $campos) {
        Remove-Item -LiteralPath "Env:SEMILLA_$campo" -ErrorAction SilentlyContinue
    }
}
```

Cada contraseña exige al menos 12 caracteres y como máximo 72 bytes UTF-8. Los PIN exigen exactamente cuatro dígitos y conservan el cero inicial. El generador escribe `database.local.sql` en la raíz, un archivo ignorado por Git que contiene solo hashes. Si ya existe, renómbralo fuera del repositorio antes de regenerar. Importa la copia en una base nueva siguiendo los mismos pasos del SQL original.

## Fase 3 — Inicio de sesión en XAMPP

### Preparar una base de demostración

1. En XAMPP inicia **Apache** y **MySQL**. En phpMyAdmin crea una base vacía llamada `simulador_fase3_demo` con cotejamiento `utf8mb4_unicode_ci`.
2. Sigue el apartado anterior para generar `database.local.sql` con contraseñas ficticias que conozcas. Si ya generaste una copia y conservas esos valores, puedes reutilizarla. Usa `ADMIN` para `admin@example.test`, `CLIENTE_1` para `DEMO-002` y `CLIENTE_3` para el cliente bloqueado `DEMO-004`. Los hashes de la semilla versionada se generaron con contraseñas aleatorias y sirven para inspeccionar los datos.
3. Selecciona `simulador_fase3_demo` en phpMyAdmin. Importa primero `database.local.sql` y después [003_sesiones_web.sql](migraciones/003_sesiones_web.sql), ambos como SQL UTF-8. Verás las cuatro tablas bancarias y `sesiones_web`.
4. En **Cuentas de usuario** crea `simulador_web` para el host `127.0.0.1`, con contraseña y sin privilegios globales. Como administrador de la base, ejecuta:

   ```sql
   GRANT SELECT ON simulador_fase3_demo.usuarios TO 'simulador_web'@'127.0.0.1';
   GRANT SELECT ON simulador_fase3_demo.cuentas TO 'simulador_web'@'127.0.0.1';
   GRANT SELECT, INSERT, DELETE ON simulador_fase3_demo.sesiones_web TO 'simulador_web'@'127.0.0.1';
   ```

5. En `backend/.env` usa `MYSQL_HOST=127.0.0.1`, `MYSQL_PUERTO=3306` o el puerto de XAMPP, `MYSQL_BASE=simulador_fase3_demo` y las credenciales de `simulador_web`. `ORIGEN_APP` es opcional en local. Si queda vacío, el origen es `http://127.0.0.1` con el puerto de Express. Si configuras un origen diferente, abre el simulador exactamente en ese origen.

### Arrancar y verificar en el navegador

Detén la ejecución anterior de Express con **Ctrl+C**. Desde la raíz:

```powershell
Set-Location backend
npm.cmd ci
npm.cmd test
npm.cmd start
```

1. Abre `http://127.0.0.1:3000/inicio-sesion`. Ingresa `admin@example.test` y la contraseña ficticia `ADMIN` que elegiste. Espera el **Panel de administración**. Cierra sesión y comprueba que volver a abrir `/panel-administrador` te devuelve al formulario.
2. Ingresa `DEMO-002` con tu contraseña `CLIENTE_1`. Espera la vista **Banca virtual**. Si intentas abrir `/panel-administrador`, espera HTTP 403. Usa **Cerrar sesión** para volver al formulario.
3. Ingresa `DEMO-004` con su contraseña `CLIENTE_3`. Espera una denegación por estado. Una contraseña incorrecta muestra el mensaje genérico de credenciales incorrectas.

| Método y ruta | Comportamiento |
| --- | --- |
| `POST /api/auth/login` | Recibe JSON con exactamente uno de `identificador`, `correo` o `documento`, junto con `contrasena`. Devuelve `rol`, `idUsuario` y `nombre` y establece una cookie. |
| `GET /api/auth/sesion` | Devuelve datos de la sesión autenticada. El servidor determina la identidad desde la cookie. |
| `POST /api/auth/logout` | Invalida la sesión en SQL y borra la cookie. |

Las peticiones `POST` requieren el encabezado `Origin` igual a `ORIGEN_APP`. El navegador lo añade en los envíos de la interfaz. La cookie dura 30 minutos. En producción, configura `NODE_ENV=production` y un `ORIGEN_APP` HTTPS que termine TLS delante de Express. Express escucha en loopback.

### Repetir las pruebas de integración

Crea una base vacía llamada `simulador_fase3_prueba`. Desde `backend`, define las variables de prueba con una cuenta de instalación autorizada sobre esa base. La suite importa sus propias semillas aleatorias y la migración. Para repetir, crea una base nueva con un sufijo, por ejemplo `simulador_fase3_prueba_2`.

```powershell
$env:MYSQL_PRUEBA_BASE = 'simulador_fase3_prueba'
$env:MYSQL_PRUEBA_PUERTO = '3306'
$env:MYSQL_PRUEBA_USUARIO = Read-Host 'Usuario SQL de prueba'
$env:MYSQL_PRUEBA_CONTRASENA = [System.Net.NetworkCredential]::new('', (Read-Host 'Contraseña SQL de prueba' -AsSecureString)).Password
try {
    npm.cmd run test:autenticacion
} finally {
    Remove-Item Env:MYSQL_PRUEBA_CONTRASENA
}
```

## Fase 4 — Administración en XAMPP

Usa la base de demostración de la fase 3 con `sesiones_web`. Esta fase utiliza las tablas existentes. En phpMyAdmin, como administrador SQL, otorga los siguientes permisos a la cuenta del backend. Sustituye `simulador_fase3_demo` y `simulador_web` si usaste otros nombres en `backend/.env`.

```sql
GRANT SELECT, INSERT, UPDATE (nombre_completo, correo, telefono, estado)
  ON simulador_fase3_demo.usuarios TO 'simulador_web'@'127.0.0.1';
GRANT SELECT, INSERT, UPDATE (saldo, estado)
  ON simulador_fase3_demo.cuentas TO 'simulador_web'@'127.0.0.1';
GRANT SELECT, INSERT
  ON simulador_fase3_demo.movimientos TO 'simulador_web'@'127.0.0.1';
GRANT SELECT, INSERT, DELETE
  ON simulador_fase3_demo.sesiones_web TO 'simulador_web'@'127.0.0.1';
```

Si Express está abierto, deténlo con `Ctrl+C` en su terminal antes de reiniciar. Desde la raíz en VS Code:

```powershell
Set-Location backend
npm.cmd ci
npm.cmd test
npm.cmd start
```

1. Entra en `http://127.0.0.1:3000/inicio-sesion` con `admin@example.test` y la contraseña ADMIN que usaste al generar las semillas. En la base recién sembrada aparecen **3 clientes**, **2 cuentas activas**, **1 cliente bloqueado**, **1 cuenta bloqueada** y **$ 1.325,00** de saldo global.
2. Pulsa **Nuevo cliente**. Usa un documento y un correo ficticios sin registrar, una contraseña de al menos 12 caracteres, un PIN ficticio de cuatro dígitos y un saldo inicial de `50,00`. Guarda el número de cuenta que muestra el panel.
3. Busca el cliente por documento o número de cuenta y pulsa **Ver cliente**. Cambia el teléfono. Cambia la cuenta a **Bloqueado**, cancela la primera confirmación y luego repite aceptándola.
4. Intenta consignar `2,50` a la cuenta bloqueada. El panel debe mostrar que el titular y la cuenta deben estar activos. Vuelve a habilitar la cuenta y repite. El nuevo saldo debe ser **$ 52,50**.
5. En **Historial**, filtra por número de cuenta y tipo **Consignación**. Deben aparecer los dos movimientos correspondientes al saldo de apertura y a la consignación.

### API administrativa

Todas las rutas requieren una sesión `ADMIN`. Las escrituras requieren JSON y `Origin` igual al origen del simulador.

| Método y ruta | Parámetros |
| --- | --- |
| `GET /api/admin/metricas` | Clientes totales y bloqueados, cuentas activas y bloqueadas y saldo global |
| `GET /api/admin/clientes` | `buscar` opcional por nombre, documento, correo o cuenta y `pagina` desde 1 |
| `GET /api/admin/clientes/:id` | Identificador del cliente |
| `POST /api/admin/clientes` | `nombreCompleto`, `documento`, `correo`, `telefono`, `contrasena`, `pinAtm`, `tipoCuenta`, `saldoInicial` |
| `PUT /api/admin/clientes/:id` | Uno o más de `nombreCompleto`, `correo`, `telefono`, `estadoUsuario` y el par `idCuenta`, `estadoCuenta` |
| `POST /api/admin/consignar` | `numeroCuenta`, `monto` y `descripcion` |
| `GET /api/admin/movimientos` | `desde`, `hasta`, `tipo`, `numeroCuenta`, `pagina`, todos opcionales |

Los listados devuelven `elementos`, `pagina` y `hayMas`, con hasta 20 filas o clientes por página. Envía importes como texto con punto decimal o como número JSON con hasta dos decimales. Los saldos de salida son cadenas decimales. El panel muestra los importes en pesos colombianos con el prefijo `$ `, punto de miles y coma decimal. El PIN se envía como cadena. El intervalo de historial acepta fechas `AAAA-MM-DD` e incluye todo el último día en la zona horaria de la sesión SQL.

### Repetir las pruebas de administración

Crea una base vacía `simulador_fase4_prueba` y usa las mismas variables `MYSQL_PRUEBA_*` de la fase 3, con el nuevo nombre de base y un usuario de instalación de prueba autorizado a crear tablas y triggers en ella. Desde `backend`, ejecuta `npm.cmd run test:admin`. Para repetir, crea otra base vacía, por ejemplo `simulador_fase4_prueba_2`. La suite importa sus propias semillas, aplica la migración de sesiones y usa un trigger de fallo en la última prueba.

## Fase 5 — Banca virtual y transferencias en XAMPP

Usa la misma base que en Administración. Como administrador SQL en phpMyAdmin, añade estos dos permisos a la cuenta de aplicación. Sustituye `simulador_fase3_demo` y `simulador_web` si usaste otros nombres en `backend/.env`.

```sql
GRANT UPDATE (contrasena) ON simulador_fase3_demo.usuarios TO 'simulador_web'@'127.0.0.1';
GRANT INSERT ON simulador_fase3_demo.transferencias TO 'simulador_web'@'127.0.0.1';
```

La fase usa el esquema existente. Si Express está abierto, detenlo con `Ctrl+C` en su terminal. Desde la raíz del proyecto en VS Code:

```powershell
Set-Location backend
npm.cmd test
npm.cmd start
```

1. Abre `http://127.0.0.1:3000/inicio-sesion` y entra con `DEMO-002` y la contraseña `CLIENTE_1` que elegiste al generar las semillas. Debes ver su cuenta `9000000001`, el saldo en COP y su historial.
2. Transfiere `20,25` COP a `9000000002` y escribe una descripción ficticia. El saldo de origen debe bajar **$ 20,25**. En el historial de ese cliente aparece **Transferencia enviada**. Al entrar con `DEMO-003` y su contraseña `CLIENTE_2`, debe aparecer **Transferencia recibida** y el saldo debe aumentar por el mismo importe. Si las cuentas conservaban los saldos de las semillas, quedan en **$ 829,75** y **$ 420,25**.
3. Intenta enviar a la misma cuenta origen o un valor que supere su saldo. La aplicación rechaza ambas solicitudes. Como ADMIN, puedes verificar los dos movimientos en **Historial** y que la transferencia conserva el saldo global.
4. Edita el correo o el teléfono desde **Perfil**. En **Cambiar contraseña**, una contraseña actual incorrecta produce una denegación. Un cambio válido cierra todas las sesiones web del cliente. Ingresa nuevamente con la contraseña nueva. Usa una contraseña ficticia de al menos 12 caracteres para la demostración.

### API de banca virtual

Todas las rutas requieren una sesión `CLIENTE`. Las escrituras requieren JSON y `Origin` igual al origen del simulador.

| Método y ruta | Parámetros |
| --- | --- |
| `GET /api/banca/cuenta` | `idCuenta` opcional. Devuelve el resumen de la cuenta elegida y el listado de cuentas activas propias. |
| `GET /api/banca/movimientos` | `idCuenta` y `pagina` opcionales. Devuelve hasta 20 movimientos por página. |
| `POST /api/banca/transferir` | `cuentaDestino`, `monto`, `descripcion` opcional e `idCuentaOrigen` opcional. |
| `GET /api/banca/perfil` | Identidad obtenida de la sesión. |
| `PUT /api/banca/perfil` | `correo` y/o `telefono`. |
| `PUT /api/banca/contrasena` | `contrasenaActual` y `nuevaContrasena`. |

La interfaz solo muestra cuentas propias activas. Si hay varias, el selector fija la cuenta del resumen, el historial y el origen de la transferencia. En llamadas que omitan la cuenta, el servidor selecciona la cuenta activa propia con el menor identificador. Se puede transferir entre dos cuentas distintas activas, incluidas dos del mismo titular. Los importes de la API usan el mismo formato decimal que Administración. Las pantallas presentan los valores en pesos colombianos con el prefijo `$ `.

### Repetir las pruebas de banca virtual

Crea una base vacía `simulador_fase5_prueba` y usa las variables `MYSQL_PRUEBA_*` indicadas en la fase 3, con el nombre nuevo y una cuenta de instalación de prueba con permisos para crear tablas y triggers en esa base. Desde `backend`, ejecuta `npm.cmd run test:banca`. Para repetir, crea otra base vacía, por ejemplo `simulador_fase5_prueba_2`. La suite importa sus propias semillas y aplica la migración de sesiones.
