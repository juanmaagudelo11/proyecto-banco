async function listarMovimientosPorCuenta(conexion, idCuenta) {
  const [movimientos] = await conexion.execute(
    `SELECT id_movimiento, id_cuenta, id_transferencia, tipo_movimiento, monto,
            saldo_anterior, saldo_resultante, descripcion, fecha_movimiento
     FROM movimientos WHERE id_cuenta = ? ORDER BY fecha_movimiento DESC, id_movimiento DESC`,
    [idCuenta]
  );
  return movimientos;
}

module.exports = { listarMovimientosPorCuenta };
