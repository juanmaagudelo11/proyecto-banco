const { json } = require('express');
const { verificarOrigen } = require('./verificarOrigen');
const { ErrorApi } = require('../servicios/errorApi');

function exigirJson(peticion, respuesta, siguiente) {
  if (!peticion.is('application/json')) throw new ErrorApi(415, 'Se requiere un cuerpo JSON.');
  siguiente();
}

function validarEscritura(origen) {
  return [verificarOrigen(origen), exigirJson, json({
    limit: '8kb',
    // Conserva los dígitos originales de los importes JSON antes del redondeo de Number.
    reviver: (clave, valor, contexto) => {
      if (typeof valor !== 'number') return valor;
      if (['monto', 'saldoInicial'].includes(clave)) return contexto.source;
      if (['documento', 'numeroCuenta', 'cuentaDestino'].includes(clave) && /^\d+$/.test(contexto.source)) {
        return contexto.source;
      }
      return valor;
    }
  })];
}

module.exports = { validarEscritura };
