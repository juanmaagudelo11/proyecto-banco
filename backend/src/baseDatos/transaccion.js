async function enTransaccion(grupo, operacion) {
  const conexion = await grupo.getConnection();
  try {
    await conexion.beginTransaction();
    const resultado = await operacion(conexion);
    await conexion.commit();
    return resultado;
  } catch (error) {
    try {
      await conexion.rollback();
    } catch {
      conexion.destroy();
    }
    throw error;
  } finally {
    conexion.release();
  }
}

module.exports = { enTransaccion };
