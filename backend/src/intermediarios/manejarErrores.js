const { ErrorApi } = require('../servicios/errorApi');

const erroresDePeticion = {
  'entity.parse.failed': [400, 'El cuerpo JSON no es válido.'],
  'entity.too.large': [413, 'El cuerpo de la petición es demasiado grande.'],
  'charset.unsupported': [415, 'La codificación del cuerpo no es compatible.'],
  'encoding.unsupported': [415, 'La codificación del cuerpo no es compatible.']
};

function manejarErrores(error, peticion, respuesta, siguiente) {
  if (respuesta.headersSent) return siguiente(error);

  if (error instanceof ErrorApi) {
    return respuesta.status(error.estado).json({ exito: false, mensaje: error.message, datos: null });
  }

  const [estado, mensaje] = Object.hasOwn(erroresDePeticion, error.type)
    ? erroresDePeticion[error.type]
    : [500, 'Ocurrió un error interno.'];
  return respuesta.status(estado).json({ exito: false, mensaje, datos: null });
}

module.exports = { manejarErrores };
