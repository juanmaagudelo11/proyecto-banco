async function buscarTransferenciaPorId(conexion, idTransferencia) {
  const [transferencias] = await conexion.execute(
    `SELECT id_transferencia, id_cuenta_origen, id_cuenta_destino, monto, descripcion, fecha_transferencia
     FROM transferencias WHERE id_transferencia = ?`,
    [idTransferencia]
  );
  return transferencias[0] ?? null;
}

module.exports = { buscarTransferenciaPorId };
