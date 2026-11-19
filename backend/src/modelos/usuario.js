async function buscarUsuarioPorId(conexion, idUsuario) {
  const [usuarios] = await conexion.execute(
    `SELECT id_usuario, nombre_completo, documento, correo, telefono, rol, estado, fecha_registro
     FROM usuarios WHERE id_usuario = ?`,
    [idUsuario]
  );
  return usuarios[0] ?? null;
}

async function buscarUsuarioParaIngreso(conexion, identificador) {
  const [usuarios] = await conexion.execute(
    `SELECT id_usuario, nombre_completo, contrasena, rol, estado
     FROM usuarios WHERE correo = ? OR documento = ? LIMIT 2`,
    [identificador, identificador]
  );
  return usuarios.length === 1 ? usuarios[0] : null;
}

module.exports = { buscarUsuarioPorId, buscarUsuarioParaIngreso };
