# Decisiones de la fase 1

- La especificación revisada está en `Proyecto_Bancario.docx`. La fase 1 cubre los requisitos técnicos de la arquitectura, la configuración privada y el acceso a MySQL. Los RF y reglas financieras corresponden a las fases que indica `AGENTS.md`.
- Se recomienda Node.js 26 LTS y se admite también Node.js 24 LTS. La versión 16 que menciona el documento ya alcanzó el fin de soporte. [Calendario oficial de Node.js](https://nodejs.org/en/about/previous-releases).
- Express sirve el frontend por el mismo origen y carga Bootstrap desde las dependencias locales. Se usa dotenv para `backend/.env` y `mysql2/promise` para verificar la conexión. Las pruebas usan `node:test`.
- Un HTTP 503 con `datos.servidor: disponible` indica que Express respondió y que MySQL está sin configurar o no pudo completar la comprobación. Un HTTP 200 comprueba ambos componentes. La respuesta omite parámetros de conexión y errores del controlador MySQL.
- El esquema y `database.sql` corresponden a la fase 2. Las decisiones del esquema y de las operaciones bancarias quedan pendientes de la fase correspondiente.
