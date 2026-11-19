async function listarMovimientosPorCuenta(conexion, idCuenta) {
  const [movimientos] = await conexion.execute(
    `SELECT id_movimiento, id_cuenta, id_transferencia, tipo_movimiento, monto,
            saldo_anterior, saldo_resultante, descripcion, fecha_movimiento
     FROM movimientos WHERE id_cuenta = ? ORDER BY fecha_movimiento DESC, id_movimiento DESC`,
    [idCuenta]
  );
  return movimientos;
}

async function listarMovimientosDeTitular(conexion, idUsuario, idCuenta, limite, desplazamiento) {
  const [movimientos] = await conexion.execute(`
    SELECT m.id_movimiento AS idMovimiento, m.tipo_movimiento AS tipoMovimiento,
           m.monto, m.saldo_resultante AS saldoResultante, m.descripcion, m.fecha_movimiento AS fecha
    FROM movimientos AS m JOIN cuentas AS c ON c.id_cuenta = m.id_cuenta
    JOIN usuarios AS u ON u.id_usuario = c.id_usuario
    WHERE m.id_cuenta = ? AND c.id_usuario = ? AND c.estado = 'ACTIVO' AND u.estado = 'ACTIVO' AND u.rol = 'CLIENTE'
    ORDER BY m.fecha_movimiento DESC, m.id_movimiento DESC
    LIMIT ? OFFSET ?
  `, [idCuenta, idUsuario, limite, desplazamiento]);
  return movimientos;
}

async function registrarMovimientosTransferencia(conexion, idTransferencia, monto, descripcion, [origen, destino]) {
  await conexion.execute(`
    INSERT INTO movimientos (id_cuenta, id_transferencia, tipo_movimiento, monto, saldo_anterior, saldo_resultante, descripcion)
    VALUES (?, ?, 'TRANSFERENCIA_ENVIADA', ?, ?, ?, ?), (?, ?, 'TRANSFERENCIA_RECIBIDA', ?, ?, ?, ?)
  `, [origen.idCuenta, idTransferencia, monto, origen.saldoAnterior, origen.saldoResultante, descripcion,
    destino.idCuenta, idTransferencia, monto, destino.saldoAnterior, destino.saldoResultante, descripcion]);
}

async function registrarRetiro(conexion, idCuenta, monto, saldoAnterior, saldoResultante) {
  const [resultado] = await conexion.execute(`
    INSERT INTO movimientos (id_cuenta, tipo_movimiento, monto, saldo_anterior, saldo_resultante, descripcion)
    VALUES (?, 'RETIRO', ?, ?, ?, 'Retiro en cajero ATM')
  `, [idCuenta, monto, saldoAnterior, saldoResultante]);
  return resultado.insertId;
}

module.exports = { registrarRetiro, listarMovimientosPorCuenta, listarMovimientosDeTitular, registrarMovimientosTransferencia };
