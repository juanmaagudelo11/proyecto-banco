async function buscarCredencialesAtm(conexion, numeroCuenta) {
  const [[cuenta]] = await conexion.execute(`
    SELECT c.id_cuenta, c.id_usuario, c.pin_atm, c.estado, u.estado AS estado_usuario, u.rol
    FROM cuentas AS c JOIN usuarios AS u ON u.id_usuario = c.id_usuario
    WHERE c.numero_cuenta = ?
  `, [numeroCuenta]);
  return cuenta ?? null;
}

async function guardarSesionAtm(conexion, huella, idCuenta, vigencia) {
  await conexion.execute(`
    INSERT INTO sesiones_atm (huella, id_cuenta, expira_en)
    VALUES (?, ?, TIMESTAMPADD(SECOND, ?, UTC_TIMESTAMP(3)))
  `, [huella, idCuenta, vigencia]);
}

async function buscarCuentaDeSesion(conexion, huella) {
  const [[cuenta]] = await conexion.execute(`
    SELECT c.id_cuenta, c.id_usuario, c.numero_cuenta, c.saldo, c.estado, u.estado AS estado_usuario, u.rol,
           CEIL(TIMESTAMPDIFF(MICROSECOND, UTC_TIMESTAMP(3), s.expira_en) / 1000000) AS segundos_restantes
    FROM sesiones_atm AS s
    JOIN cuentas AS c ON c.id_cuenta = s.id_cuenta
    JOIN usuarios AS u ON u.id_usuario = c.id_usuario
    WHERE s.huella = ? AND s.expira_en > UTC_TIMESTAMP(3)
  `, [huella]);
  return cuenta ?? null;
}

async function bloquearSesionVigente(conexion, huella, idCuenta) {
  const [[sesion]] = await conexion.execute(`
    SELECT 1 FROM sesiones_atm
    WHERE huella = ? AND id_cuenta = ? AND expira_en > UTC_TIMESTAMP(3) LOCK IN SHARE MODE
  `, [huella, idCuenta]);
  return Boolean(sesion);
}

async function eliminarSesionAtm(conexion, huella) {
  await conexion.execute('DELETE FROM sesiones_atm WHERE huella = ?', [huella]);
}

async function eliminarSesionesAtmVencidas(conexion) {
  await conexion.execute('DELETE FROM sesiones_atm WHERE expira_en <= UTC_TIMESTAMP(3)');
}

async function buscarRetiroPrevio(conexion, huellaSolicitud) {
  const [[movimiento]] = await conexion.execute(`
    SELECT m.id_movimiento AS idMovimiento, m.monto, m.saldo_resultante AS saldoResultante
    FROM retiros_atm AS r JOIN movimientos AS m ON m.id_movimiento = r.id_movimiento
    WHERE r.huella_solicitud = ?
  `, [huellaSolicitud]);
  return movimiento ?? null;
}

async function recordarRetiro(conexion, huellaSolicitud, idMovimiento) {
  await conexion.execute(
    'INSERT INTO retiros_atm (huella_solicitud, id_movimiento) VALUES (?, ?)', [huellaSolicitud, idMovimiento]
  );
}

module.exports = {
  buscarCredencialesAtm, guardarSesionAtm, buscarCuentaDeSesion, bloquearSesionVigente,
  eliminarSesionAtm, eliminarSesionesAtmVencidas, buscarRetiroPrevio, recordarRetiro
};
