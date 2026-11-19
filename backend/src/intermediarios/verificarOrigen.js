function verificarOrigen(origen) {
  return function verificarOrigenDePeticion(peticion, respuesta, siguiente) {
    if (peticion.get('origin') === origen) return siguiente();
    return respuesta.status(403).json({
      exito: false, mensaje: 'Origen de la petición no autorizado.', datos: null
    });
  };
}

module.exports = { verificarOrigen };
