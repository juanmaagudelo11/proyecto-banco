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

module.exports = { listarCuentasPorUsuario, tieneCuentaActiva };
