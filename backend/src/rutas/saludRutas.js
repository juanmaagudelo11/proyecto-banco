const { Router } = require('express');

function crearRutasSalud(responderSalud) {
  const rutas = Router();
  rutas.get('/salud', responderSalud);
  return rutas;
}

module.exports = { crearRutasSalud };
