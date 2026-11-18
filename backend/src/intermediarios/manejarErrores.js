function manejarErrores(error, peticion, respuesta, siguiente) {
  if (respuesta.headersSent) {
    return siguiente(error);
  }

  respuesta.status(500).json({
    exito: false,
    mensaje: 'Ocurrió un error interno.',
    datos: null
  });
}

module.exports = { manejarErrores };
