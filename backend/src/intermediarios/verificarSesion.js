function crearVerificadorSesion(servicio, nombreCookie, cookie, esPagina = false) {
  return async function verificarSesion(peticion, respuesta, siguiente) {
    const resultado = await servicio.consultarSesion(peticion.cookies[nombreCookie]);
    if (resultado.estado === 200) {
      peticion.usuario = resultado.usuario;
      return siguiente();
    }

    if (peticion.cookies[nombreCookie]) respuesta.clearCookie(nombreCookie, cookie);
    if (esPagina && resultado.estado === 401) return respuesta.redirect('/inicio-sesion');

    return respuesta.status(resultado.estado).json({
      exito: false,
      mensaje: resultado.estado === 401 ? 'Inicia sesión para continuar.' : 'Acceso no disponible para este usuario.',
      datos: null
    });
  };
}

module.exports = { crearVerificadorSesion };
