const { Router } = require('express');
const { verificarRol } = require('../intermediarios/verificarRol');
const { validarEscritura } = require('../intermediarios/validarEscritura');

function crearRutasAdmin(controlador, verificarSesion, origen) {
  const rutas = Router();
  const escritura = validarEscritura(origen);

  rutas.use(verificarSesion, verificarRol('ADMIN'));
  rutas.get('/metricas', controlador.metricas);
  rutas.get('/clientes', controlador.clientes);
  rutas.get('/clientes/:id', controlador.cliente);
  rutas.post('/clientes', escritura, controlador.registrar);
  rutas.put('/clientes/:id', escritura, controlador.editar);
  rutas.post('/consignar', escritura, controlador.consignar);
  rutas.get('/movimientos', controlador.movimientos);
  return rutas;
}

module.exports = { crearRutasAdmin };
