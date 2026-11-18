# AGENTS.md — Simulador Bancario Web

## 0. Misión y fuente de verdad
Construir **por fases comprobables** el Simulador Bancario Web definido en `Proyecto_Bancario.docx`. Este archivo traduce la especificación en instrucciones operativas para Codex; el documento original prevalece sobre preferencias de implementación cuando es inequívoco. Si el documento no está en el repositorio, solicitar que se añada o consultar `docs/decisiones.md` sin inventar requisitos.

**NORMA ABSOLUTA:** trabajar únicamente en la fase autorizada expresamente por el usuario. Nunca ejecutar fases futuras, implementar módulos adelantados ni avanzar automáticamente tras pasar las pruebas. Al cerrar cada fase, reportar evidencias y **DETENERSE** para pedir aprobación. Si el usuario no indica fase, empezar por la **fase 1**. Se puede preparar un esqueleto mínimo de carpetas de fases futuras, pero no implementar su funcionalidad.

Proyecto académico de simulación; **no** conectar a bancos reales ni procesar dinero real.

## 1. Requisitos técnicos no negociables
- Backend: Node.js compatible con versión estable soportada, Express.js y API REST JSON.
- Persistencia: MySQL (`mysql2/promise` preferible); una sola base de datos para todos los módulos. No reemplazar MySQL por SQLite, archivos JSON ni almacenamiento en memoria como fuente de verdad.
- Frontend: HTML5, CSS3, JavaScript vanilla con `fetch`, Bootstrap. No React, Vue, Angular, TypeScript ni frameworks de frontend nuevos sin aprobación.
- Arquitectura por capas: `rutas/` -> `controladores/` -> `servicios/` -> `modelos/` -> `baseDatos/`.
- Nombres del código, carpetas, variables, funciones y comentarios propios en **español** (salvo convenciones, APIs, paquetes y palabras reservadas); endpoints acordados en el documento conservan sus nombres.
- Dos roles: `ADMIN` y `CLIENTE`; tres estados: `ACTIVO`, `INACTIVO`, `BLOQUEADO`.
- Paquetes previstos: `express`, `mysql2`, `dotenv`, `bcrypt`; herramientas mínimas adicionales para sesiones, cookies, protección y pruebas solo cuando estén justificadas. Explicar elección y actualizar dependencias de forma controlada.
- Usar `.env` para secretos y `.env.example` sin secretos reales. Nunca versionar `.env`, credenciales, datos sensibles ni `node_modules/`.
- Mantener `README.md`, `database.sql` y `docs/` actualizados progresivamente.
- Ejecutable en local sin Docker obligatorio. No asumir que MySQL, Node o un servicio externo están instalados: comprobar el entorno.

## 2. Seguridad e integridad obligatorias
1. **Nunca almacenar contraseñas ni PIN en texto plano.** Guardar hash bcrypt; comparar en backend. El PIN del ATM es de 4 dígitos, mantenerlo como **cadena** para preservar ceros iniciales.
2. Credenciales viajan en el cuerpo de una petición HTTPS en producción; **no** en URL, logs ni respuestas. Aclaración técnica del documento: bcrypt es un hash, no cifrado reversible; HTTPS protege credenciales en tránsito. En desarrollo local permitir HTTP únicamente para pruebas locales.
3. Aplicar autenticación, autorización por rol y verificación de titularidad **en el servidor**; jamás confiar en `idUsuario`, cuenta origen, rol, estado o saldo enviados por cliente.
4. Usuarios o cuentas `INACTIVO`/`BLOQUEADO` no acceden a operaciones protegidas; volver a validar estado en **cada operación**, aunque exista sesión.
5. Toda consignación, transferencia, apertura de cuenta con saldo inicial y retiro debe ser **atómico** con transacciones SQL (`BEGIN`, `COMMIT`, `ROLLBACK`) y movimientos auditables según corresponda; rechazar importes inválidos o mayores al saldo.
6. Para transferencias concurrentes, bloquear filas con `SELECT ... FOR UPDATE` dentro de la misma transacción y orden determinista cuando se bloquean dos cuentas; no permitir saldo negativo, doble gasto ni movimientos parciales.
7. Importes monetarios en MySQL `DECIMAL(15,2)`; evitar aritmética de negocio con `float` sin control. Validar máximo 2 decimales, límites y valores mayores a cero (excepto saldo inicial que puede ser cero). Convertir con precisión decimal/céntimos y SQL parametrizado.
8. Un movimiento confirmado es inmutable; no exponer rutas de edición/eliminación de movimientos, clientes ni cuentas. Aplicar privilegios SQL mínimos cuando sea posible.
9. No exponer hashes, secretos ni trazas internas en JSON/logs. Respuestas de error seguras; credenciales incorrectas reciben respuesta genérica. Proteger sesiones (cookie HttpOnly, SameSite, Secure al usar HTTPS, expiración, invalidación real en logout, defensa CSRF apropiada al mecanismo escogido). Limitar intentos de login y PIN.
10. Usar siempre consultas parametrizadas; validar datos y permisos en backend aunque frontend valide también. No introducir datos reales de personas en semillas ni pruebas.
11. No ejecutar comandos destructivos sobre bases con datos existentes. Antes de `DROP`, `TRUNCATE`, reseteos, migraciones destructivas o borrado de archivos, solicitar permiso expreso. Las pruebas deben usar base de datos de prueba aislada.

## 3. Estructura objetivo
```text
simulador-bancario/
├── AGENTS.md
├── AGENT.md                     # copia informativa, AGENTS.md es el archivo principal de Codex
├── Proyecto_Bancario.docx       # si el usuario lo copia al repositorio
├── backend/
│   ├── src/
│   │   ├── baseDatos/index.js
│   │   ├── modelos/{usuario,cuenta,movimiento,transferencia}.js
│   │   ├── servicios/{autenticacionServicio,adminServicio,bancaServicio,atmServicio}.js
│   │   ├── controladores/{autenticacionControlador,adminControlador,clienteControlador,atmControlador}.js
│   │   ├── rutas/{autenticacionRutas,adminRutas,clienteRutas,atmRutas}.js
│   │   ├── intermediarios/{verificarSesion,verificarRol,manejarErrores}.js
│   │   └── app.js
│   ├── test/
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── paginas/{inicioSesion,panelAdministrador,bancaVirtual,cajeroAtm}.html
│   ├── css/estilos.css
│   ├── js/{api,autenticacion,administrador,bancaVirtual,cajeroAtm}.js
│   └── index.html
├── docs/
│   ├── PLAN_FASES.md
│   ├── ESTADO_PROYECTO.md
│   └── decisiones.md
├── database.sql
├── .gitignore
└── README.md
```
La estructura es una meta incremental: no crear archivos vacíos innecesarios ni código especulativo. Respetar el nombre `AGENTS.md` en la raíz para que Codex pueda encontrar las instrucciones.

## 4. Protocolo obligatorio por fase
**ANTES** de tocar código:
1. Leer `AGENTS.md`, `docs/ESTADO_PROYECTO.md`, `docs/PLAN_FASES.md` si existen y archivos involucrados. Comprobar si el repositorio ya tiene implementaciones; preservar lo que funciona.
2. Identificar fase autorizada, requerimientos RF/RN y dependencias de fases previas.
3. Exponer un plan breve: cambios previstos, pruebas automáticas y manuales, riesgos y criterios de aceptación. Si hay ambigüedad que compromete integridad, detenerse y preguntar; para detalles menores elegir solución mínima y dejarla documentada.

**DURANTE** la fase:
4. Implementar únicamente alcance aprobado, con cambios pequeños y revisables; no refactorizar módulos ajenos innecesariamente.
5. Preparar pruebas deterministas positivas, negativas y de autorización. Ejecutarlas y corregir defectos dentro de la fase actual.
6. No decir que una prueba pasó si no se ejecutó. Si falta MySQL o una variable de entorno, documentar comando exacto y marcar `NO EJECUTADA`, nunca `APROBADA`.
7. No usar credenciales reales ni modificar datos ajenos. Usar semillas locales demostrativas.

**AL TERMINAR**:
8. Actualizar `docs/ESTADO_PROYECTO.md` con fase, archivos, comandos, resultados reales (APROBADA/FALLIDA/NO EJECUTADA), incidencias y pendiente.
9. Entregar: resumen de cambios, cobertura RF/RN, comandos para iniciar, guía de prueba manual, resultados reales, limitaciones y una demostración de lo que funciona ahora.
10. **DETENERSE** y preguntar literalmente: `¿Apruebas la fase N para que continúe con la fase N+1?` No crear la fase siguiente hasta respuesta afirmativa explícita.

No hacer commits ni pushes remotos sin autorización explícita. Se pueden recomendar commits al finalizar cada fase.

## 5. Fases y criterios de aceptación

### FASE 1 — Preparación del entorno y esqueleto funcional
**Alcance:** repo y `.gitignore`, estructura base, `backend/package.json`, Express mínimo, dotenv y configuración MySQL, manejo básico de errores, `/api/salud` para verificar HTTP y disponibilidad de DB separadamente, `frontend/index.html` base, `.env.example`, instrucciones de instalación y `docs/`.
**Pruebas:** `npm install` y arranque sin errores con configuración válida; `GET /api/salud` responde JSON esperado; el servidor indica adecuadamente si MySQL no está disponible; `.env` no está versionado; no hay credenciales en consola ni repositorio. Verificar navegador en local.
**Salida:** estructura y comandos claros. **Sin crear la lógica bancaria todavía.**

### FASE 2 — Esquema MySQL, datos de prueba y restricciones
**Alcance:** `database.sql` con `usuarios`, `cuentas`, `movimientos`, `transferencias`; PK/FK/UNIQUE, estados, checks compatibles con versión de MySQL, `DECIMAL(15,2)`. Modelos básicos y semilla de 1 admin + 3 clientes, incluyendo un bloqueado, cuentas con saldos variados, movimientos de ejemplo consistentes y credenciales/PIN hasheados con bcrypt. Datos ficticios. Saldo inicial distinto de cero debe tener movimiento inicial de consignación coherente.
**Pruebas:** importación en base vacía de prueba; conteos y relaciones; unicidad de documento/correo/cuenta; no saldos negativos; credenciales no están en texto plano; movimientos y saldos de semillas concuerdan; se documenta cómo regenerar datos seguros.
**Salida:** esquema reproducible y prueba verificable de integridad.

### FASE 3 — Autenticación, sesiones y roles (RF-01, RF-02, RF-13 parcial)
**Alcance:** login con correo o documento + contraseña, logout; sesión segura; roles `ADMIN`/`CLIENTE`; rutas protegidas; login ATM separado por cuenta/PIN, o sentar infraestructura para implementarlo en fase 6. Vistas de login básicas. Prohibir accesos por estado y usuario ajeno. Mantener endpoint documentado `POST /api/auth/login`, `POST /api/auth/logout`.
**Pruebas:** admin y cliente activos entran a su área; contraseñas erróneas y bloqueados/inactivos son rechazados; roles no se cruzan; logout invalida sesión y ruta protegida; cookie segura en entorno apropiado; logs no muestran secretos.
**Salida:** acceso web funcional sin lógica financiera adelantada.

### FASE 4 — Administración (RF-03, RF-04, RF-06, RF-07, RF-08)
**Alcance:** dashboard métricas reales; crear cliente y cuenta; listar/buscar/ver/editar campos permitidos; cambiar estados con confirmación; consignaciones atómicas con historial; historial bancario con filtros; panel responsivo. Implementar `GET/POST /api/admin/clientes`, `PUT /api/admin/clientes/:id`, `POST /api/admin/consignar` y endpoints adicionales mínimos documentados para métricas, historial, detalle y filtros.
**Pruebas:** nuevo cliente + cuenta con hash y número único; duplicados rechazados; no eliminación física; depósito positivo cambia saldo y crea 1 movimiento; depósito inválido o cuenta bloqueada no cambia saldo ni historial; consulta global solo para admin; métricas coinciden con SQL; error intermedio revierte transacción.
**Salida:** administración demostrable por navegador y API.

### FASE 5 — Banca virtual y transferencias (RF-09 a RF-12)
**Alcance:** resumen saldo/tipo/número/estado, movimientos privados, perfil editable permitido y cambio de contraseña, transferencias entre cuentas activas con 2 movimientos y registro `transferencias` en 1 transacción; frontend `fetch`. Mantener `GET /api/banca/cuenta`, `GET /api/banca/movimientos`, `POST /api/banca/transferir`. Agregar endpoints necesarios para perfil y contraseña y documentarlos.
**Pruebas:** cliente ve solo información propia; rechaza editar saldo, rol, estado, número de cuenta; contraseña actual obligatoria; transferencias válidas dejan saldo total constante, 2 movimientos + registro de transferencia; cuenta propia, bloqueada, inexistente, montos <= 0, decimales inválidos y sobregiro son rechazados sin cambios; prueba de rollback; concurrencia sin doble gasto.
**Salida:** banca virtual funcional con historial consistente.

### FASE 6 — Cajero ATM (RF-13 a RF-16)
**Alcance:** login número de cuenta + PIN (hash bcrypt); sesión ATM de alcance reducido; `POST /api/atm/login`, `GET /api/atm/saldo`, `POST /api/atm/retirar`; consultar últimos movimientos y salida/expulsión segura mediante endpoints añadidos documentados; vista ATM responsiva.
**Pruebas:** PIN correcto e incorrecto, cero inicial, bloqueo de cuenta, límites de intentos; consultar solo cuenta identificada; retiro válido descuenta una sola vez y registra movimiento; sobregiro/importe inválido/estado no activo son rechazados sin efectos; salida invalida sesión; saldo se ve actualizado en banca/admin.
**Salida:** ATM totalmente demostrable.

### FASE 7 — Integración, concurrencia y pruebas de seguridad
**Alcance:** pruebas integrales de los 3 módulos, escenarios de error y concurrencia, autorización, inmutabilidad, regresión; corregir errores identificados **sin añadir funcionalidades fuera del alcance**.
**Pruebas:** ejecutar al menos CP-01 a CP-10 del documento, pruebas adicionales de concurrencia/rollback/seguridad y comprobar coherencia de saldos e historial en 3 módulos después de consignar, transferir y retirar. Documentar resultados reproducibles.
**Salida:** matriz de pruebas, fallos pendientes y evidencias.

### FASE 8 — Pulido, documentación y entrega
**Alcance:** usabilidad, diseño Bootstrap, accesibilidad básica, errores amigables, README de instalación MySQL/Node, `.env.example`, instrucciones de `database.sql`, comandos y flujo demostrativo; limpieza de código, verificación del esquema ER.
**Pruebas:** iniciar proyecto desde cero siguiendo README en un entorno limpio o simulado; pruebas automatizadas y checklist manual final; verificar responsive en móvil/tableta/escritorio; confirmar `.env` excluido.
**Salida:** entrega académica reproducible. No declarar completado si hay pruebas críticas fallidas.

## 6. Contrato API y reglas mínimas
- Mantener el contrato de rutas existente en la especificación; ampliarlo solo para funciones explícitas sin endpoint detallado (dashboard, historial global, perfil, cambio de contraseña, movimientos ATM, cierre ATM, consulta de cliente).
- JSON consistente: `{ "exito": true|false, "mensaje": "...", "datos": ... }`. No enviar hashes ni credenciales.
- Estados HTTP adecuados: `400` datos inválidos, `401` no autenticado, `403` no autorizado/bloqueado, `404` no encontrado si no filtra datos, `409` conflictos, `500` error interno genérico.
- El origen de transferencia se obtiene de la sesión autorizada y de la selección de una cuenta **propia**, nunca de un ID arbitrario de usuario pasado en JSON.
- Un cliente puede tener varias cuentas según relación 1:N del documento, aunque la interfaz del prototipo se centra en una cuenta. Si la selección de cuenta origen no está definida, implementar una cuenta primaria por defecto solo como decisión documentada o pedir definición al usuario antes de la fase 5. Nunca filtrar datos de cuentas ajenas.

## 7. Inconsistencias del documento: cómo resolverlas
Registrar en `docs/decisiones.md` cada discrepancia junto con elección y motivación, sin modificar a escondidas el alcance:
- **Tabla `cuentas`:** la primera columna rotulada `id_usuario` como PK AUTO_INCREMENT parece un error: debe ser `id_cuenta` PK y `id_usuario` FK; el campo `rol` duplicado en cuentas no es necesario porque el rol está en `usuarios`. El diagrama también difiere de la tabla textual. Proponer esquema coherente antes de implementarlo.
- **Movimientos/transferencias:** errores de escritura en `id_moviento`, `fecha_moviemto`, `id_tranferencia`. Usar nombres consistentes `id_movimiento`, `fecha_movimiento`, `id_transferencia` y documentar normalización.
- **RF-05:** numeración salta del RF-04 al RF-06; no inventar función adicional solo para llenar la numeración.
- **API:** se omiten rutas de funciones exigidas (dashboard, perfil, historial admin, historial ATM, logout ATM), y `POST /api/auth/login` no debe sustituir sin más a `POST /api/atm/login`; completar rutas necesarias manteniendo las ya especificadas.
- **Semillas y bcrypt:** hashes de ejemplo deben generarse realmente mediante bcrypt, no inventarse; la especificación incluye credenciales demostrativas, no usarlas como secretos de producción.
- **Transporte seguro:** la exigencia de que las credenciales 'no viajen en texto plano' no la satisface bcrypt en frontend; asegurar HTTPS fuera de localhost y no enviar hashes como credencial.
- **Estado de cuentas y usuarios:** bloquear acceso/operaciones si cualquiera de los dos está inactivo o bloqueado; definir y registrar comportamiento de métricas sin inflar conteos.
- **Movimiento de saldo inicial:** mantener trazabilidad del saldo de apertura mediante movimiento coherente, incluso en semillas.
- **Versiones:** aunque el documento cita Node >=16, usar una versión LTS vigente compatible, no una versión sin soporte de seguridad; registrar versión elegida.
Si alguna decisión afecta el dominio financiero, presentar alternativas y pedir aprobación antes de codificarla.

## 8. Evidencia obligatoria al cierre de cada fase
Responder con esta estructura:
```text
FASE N — [nombre]
Estado: APROBADA / BLOQUEADA / PARCIAL (no confundir con aprobación del usuario)
Requisitos cubiertos: [RF/RN]
Archivos creados/modificados: [...]
Implementación realizada: [...]
Pruebas ejecutadas: [comando] -> [resultado real]
Pruebas NO ejecutadas y motivo: [...]
Prueba manual: [pasos, entradas y resultado esperado]
Problemas o decisiones: [...]
Cómo iniciar: [comandos exactos]
Siguiente fase propuesta: N+1 (NO iniciada)
¿Apruebas la fase N para que continúe con la fase N+1?
```
La palabra APROBADA en informe técnico significa que las verificaciones de la fase pasaron; **no sustituye** la autorización del usuario para avanzar.
