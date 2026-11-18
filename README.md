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
