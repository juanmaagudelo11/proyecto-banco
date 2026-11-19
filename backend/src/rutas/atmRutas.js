const { Router } = require('express');
const { rateLimit } = require('express-rate-limit');
const { validarEscritura } = require('../intermediarios/validarEscritura');
const { validarIngresoAtm } = require('../controladores/atmControlador');

function crearRutasAtm(controlador, origen) {
  const rutas = Router();
  const [origenValido, ...entradaJson] = validarEscritura(origen);
  const opciones = {
    windowMs: 15 * 60 * 1000,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    validate: { xForwardedForHeader: false },
    message: { exito: false, mensaje: 'Demasiados intentos. Vuelve a intentarlo más tarde.', datos: null }
  };
  const limitarIp = rateLimit({ ...opciones, limit: 20, identifier: 'atm-ip' });
  const limitarCuenta = rateLimit({
    ...opciones, limit: 5, identifier: 'atm-cuenta',
    keyGenerator: (peticion) => peticion.ingresoAtm.numeroCuenta
  });

  rutas.post('/login', origenValido, limitarIp, entradaJson, validarIngresoAtm, limitarCuenta, controlador.iniciar);
  rutas.get('/saldo', controlador.verificarSesion, controlador.saldo);
  rutas.get('/movimientos', controlador.verificarSesion, controlador.movimientos);
  rutas.post('/retirar', origenValido, controlador.verificarSesion, entradaJson, controlador.retirar);
  rutas.post('/logout', origenValido, controlador.salir);
  return rutas;
}

module.exports = { crearRutasAtm };
