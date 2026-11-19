async function buscarTransferenciaPorId(conexion, idTransferencia) {
  const [transferencias] = await conexion.execute(
    `SELECT id_transferencia, id_cuenta_origen, id_cuenta_destino, monto, descripcion, fecha_transferencia
     FROM transferencias WHERE id_transferencia = ?`,
    [idTransferencia]
  );
  return transferencias[0] ?? null;
}

async function registrarTransferencia(conexion, idOrigen, idDestino, monto, descripcion) {
  const [resultado] = await conexion.execute(`
    INSERT INTO transferencias (id_cuenta_origen, id_cuenta_destino, monto, descripcion) VALUES (?, ?, ?, ?)
  `, [idOrigen, idDestino, monto, descripcion]);
  return resultado.insertId;
}

module.exports = { buscarTransferenciaPorId, registrarTransferencia };
