const mysql = require('mysql2/promise');
const { setTimeout: esperar } = require('node:timers/promises');

function crearGrupoConexiones(entorno = process.env) {
  const {
    MYSQL_HOST = '127.0.0.1',
    MYSQL_PUERTO = '3306',
    MYSQL_BASE,
    MYSQL_USUARIO,
    MYSQL_CONTRASENA
  } = entorno;
  const puerto = Number(MYSQL_PUERTO);

  if (!MYSQL_BASE || !MYSQL_USUARIO || !MYSQL_CONTRASENA ||
      !Number.isInteger(puerto) || puerto < 1 || puerto > 65535) {
    return null;
  }

  return mysql.createPool({
    host: MYSQL_HOST,
    port: puerto,
    database: MYSQL_BASE,
    user: MYSQL_USUARIO,
    password: MYSQL_CONTRASENA,
    connectTimeout: 2000,
    connectionLimit: 4,
    waitForConnections: true,
    queueLimit: 32
  });
}

function verificarConexion(conexiones) {
  return async function verificarMySql() {
    if (!conexiones) return false;

    const cancelacion = new AbortController();
    try {
      const consulta = conexiones.query({ sql: 'SELECT 1', timeout: 2000 }).then(() => true, () => false);
      return await Promise.race([consulta, esperar(2000, false, { signal: cancelacion.signal, ref: false })]);
    } finally {
      cancelacion.abort();
    }
  };
}

function crearVerificadorMySql(entorno) {
  return verificarConexion(crearGrupoConexiones(entorno));
}

module.exports = { crearGrupoConexiones, crearVerificadorMySql, verificarConexion };
