async function guardarSesion(conexion, huella, idUsuario, vigenciaSegundos) {
  await conexion.execute(
    `INSERT INTO sesiones_web (huella, id_usuario, expira_en)
     VALUES (?, ?, TIMESTAMPADD(SECOND, ?, UTC_TIMESTAMP(3)))`,
    [huella, idUsuario, vigenciaSegundos]
  );
}

async function buscarUsuarioDeSesion(conexion, huella) {
  const [usuarios] = await conexion.execute(
    `SELECT u.id_usuario, u.nombre_completo, u.rol, u.estado
     FROM sesiones_web AS s
     JOIN usuarios AS u ON u.id_usuario = s.id_usuario
     WHERE s.huella = ? AND s.expira_en > UTC_TIMESTAMP(3)`,
    [huella]
  );
  return usuarios[0] ?? null;
}

async function eliminarSesion(conexion, huella) {
  await conexion.execute('DELETE FROM sesiones_web WHERE huella = ?', [huella]);
}

async function eliminarSesionesVencidas(conexion) {
  await conexion.execute('DELETE FROM sesiones_web WHERE expira_en <= UTC_TIMESTAMP(3)');
}

async function eliminarSesionesDeUsuario(conexion, idUsuario) {
  await conexion.execute('DELETE FROM sesiones_web WHERE id_usuario = ?', [idUsuario]);
}

module.exports = { guardarSesion, buscarUsuarioDeSesion, eliminarSesion, eliminarSesionesVencidas, eliminarSesionesDeUsuario };
