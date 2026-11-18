function crearControladorSalud(consultarSalud) {
  return async function responderSalud(peticion, respuesta) {
    const datos = await consultarSalud();
    const disponible = datos.baseDatos === 'disponible';

    respuesta.status(disponible ? 200 : 503).json({
      exito: disponible,
      mensaje: disponible ? 'Servidor y MySQL disponibles.' : 'Servidor disponible. MySQL no disponible.',
      datos
    });
  };
}

module.exports = { crearControladorSalud };
