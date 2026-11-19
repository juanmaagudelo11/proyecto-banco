const { Router } = require('express');
const { verificarRol } = require('../intermediarios/verificarRol');
const { validarEscritura } = require('../intermediarios/validarEscritura');

function crearRutasCliente(controlador, verificarSesion, origen) {
  const rutas = Router();
  const escritura = validarEscritura(origen);
  rutas.use(verificarSesion, verificarRol('CLIENTE'));
  rutas.get('/cuenta', controlador.cuenta);
  rutas.get('/movimientos', controlador.movimientos);
  rutas.get('/perfil', controlador.perfil);
  rutas.put('/perfil', escritura, controlador.editarPerfil);
  rutas.put('/contrasena', escritura, controlador.cambiarContrasena);
  rutas.post('/transferir', escritura, controlador.transferir);
  return rutas;
}

module.exports = { crearRutasCliente };
