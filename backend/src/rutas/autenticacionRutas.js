const { Router, json } = require('express');
const { rateLimit } = require('express-rate-limit');
const { verificarOrigen } = require('../intermediarios/verificarOrigen');

function exigirJson(peticion, respuesta, siguiente) {
  if (peticion.is('application/json')) return siguiente();
  return respuesta.status(415).json({
    exito: false, mensaje: 'Se requiere un cuerpo JSON.', datos: null
  });
}

function crearRutasAutenticacion(controlador, verificarSesion, origen) {
  const rutas = Router();
  const origenValido = verificarOrigen(origen);
  const limitarIntentos = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
    message: { exito: false, mensaje: 'Demasiados intentos. Vuelve a intentarlo más tarde.', datos: null }
  });

  rutas.post('/login', origenValido, limitarIntentos, exigirJson, json({ limit: '4kb' }), controlador.ingresar);
  rutas.post('/logout', origenValido, verificarSesion, controlador.salir);
  rutas.get('/sesion', verificarSesion, controlador.sesion);
  return rutas;
}

module.exports = { crearRutasAutenticacion };
