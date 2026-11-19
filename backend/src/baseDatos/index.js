const mysql = require('mysql2/promise');

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
    waitForConnections: false
  });
}

function verificarConexion(conexiones) {
  return async function verificarMySql() {
    if (!conexiones) return false;

    try {
      await conexiones.query({ sql: 'SELECT 1', timeout: 2000 });
      return true;
    } catch {
      return false;
    }
  };
}

function crearVerificadorMySql(entorno) {
  return verificarConexion(crearGrupoConexiones(entorno));
}

module.exports = { crearGrupoConexiones, crearVerificadorMySql, verificarConexion };
