# Estado del proyecto

## Fase 1 — Preparación del entorno y esqueleto funcional

**Estado técnico: APROBADA.** Verificación local del 18 de noviembre de 2026, pendiente de aprobación del usuario para avanzar.

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

**Pendiente.** Aprobación expresa de la fase 1. Fase 2 sin iniciar.
