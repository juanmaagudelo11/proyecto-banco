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

async function buscarContrasena(conexion, idUsuario) {
  const [[usuario]] = await conexion.execute('SELECT contrasena FROM usuarios WHERE id_usuario = ?', [idUsuario]);
  return usuario?.contrasena ?? null;
}

async function actualizarContrasena(conexion, idUsuario, hash) {
  await conexion.execute("UPDATE usuarios SET contrasena = ? WHERE id_usuario = ? AND rol = 'CLIENTE'", [hash, idUsuario]);
}

async function actualizarPerfil(conexion, idUsuario, { correo, telefono }) {
  await conexion.execute(`
    UPDATE usuarios SET correo = COALESCE(?, correo), telefono = COALESCE(?, telefono)
    WHERE id_usuario = ? AND rol = 'CLIENTE'
  `, [correo, telefono, idUsuario]);
}

async function bloquearUsuario(conexion, idUsuario) {
  const [[usuario]] = await conexion.execute(
    'SELECT id_usuario, rol, estado FROM usuarios WHERE id_usuario = ? FOR UPDATE', [idUsuario]
  );
  return usuario ?? null;
}

async function leerUsuarioParaSesion(conexion, idUsuario) {
  const [[usuario]] = await conexion.execute(`
    SELECT id_usuario, nombre_completo, contrasena, rol, estado
    FROM usuarios WHERE id_usuario = ? LOCK IN SHARE MODE
  `, [idUsuario]);
  return usuario ?? null;
}

module.exports = { leerUsuarioParaSesion, buscarUsuarioPorId, buscarUsuarioParaIngreso, bloquearUsuario, buscarContrasena, actualizarContrasena, actualizarPerfil };
