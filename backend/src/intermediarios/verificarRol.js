function verificarRol(rol) {
  return function verificarRolDeUsuario(peticion, respuesta, siguiente) {
    if (peticion.usuario?.rol === rol) return siguiente();

    return respuesta.status(403).json({
      exito: false, mensaje: 'Acceso no autorizado.', datos: null
    });
  };
}

module.exports = { verificarRol };
