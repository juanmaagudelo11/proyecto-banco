async function listarCuentasPorUsuario(conexion, idUsuario) {
  const [cuentas] = await conexion.execute(
    `SELECT id_cuenta, id_usuario, numero_cuenta, tipo_cuenta, saldo, estado, fecha_registro
     FROM cuentas WHERE id_usuario = ? ORDER BY id_cuenta`,
    [idUsuario]
  );
  return cuentas;
}

async function tieneCuentaActiva(conexion, idUsuario) {
  const [cuentas] = await conexion.execute(
    "SELECT 1 FROM cuentas WHERE id_usuario = ? AND estado = 'ACTIVO' LIMIT 1",
    [idUsuario]
  );
  return cuentas.length > 0;
}

async function listarCuentasActivasPorUsuario(conexion, idUsuario) {
  const [cuentas] = await conexion.execute(`
    SELECT c.id_cuenta, c.id_usuario, c.numero_cuenta, c.tipo_cuenta, c.saldo, c.estado, u.nombre_completo
    FROM cuentas AS c JOIN usuarios AS u ON u.id_usuario = c.id_usuario
    WHERE c.id_usuario = ? AND c.estado = 'ACTIVO' AND u.estado = 'ACTIVO' AND u.rol = 'CLIENTE'
    ORDER BY c.id_cuenta
  `, [idUsuario]);
  return cuentas;
}

async function localizarCuenta(conexion, numeroCuenta) {
  const [[cuenta]] = await conexion.execute(
    'SELECT id_cuenta, id_usuario FROM cuentas WHERE numero_cuenta = ?', [numeroCuenta]
  );
  return cuenta ?? null;
}

async function bloquearCuenta(conexion, idCuenta, idUsuario) {
  const [[cuenta]] = await conexion.execute(
    'SELECT numero_cuenta, saldo, estado FROM cuentas WHERE id_cuenta = ? AND id_usuario = ? FOR UPDATE',
    [idCuenta, idUsuario]
  );
  return cuenta ?? null;
}

async function actualizarSaldo(conexion, idCuenta, saldo) {
  await conexion.execute('UPDATE cuentas SET saldo = ? WHERE id_cuenta = ?', [saldo, idCuenta]);
}

module.exports = { listarCuentasPorUsuario, tieneCuentaActiva, listarCuentasActivasPorUsuario, localizarCuenta, bloquearCuenta, actualizarSaldo };
