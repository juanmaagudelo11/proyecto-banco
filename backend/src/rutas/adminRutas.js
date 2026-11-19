const { Router, json } = require('express');
const { verificarRol } = require('../intermediarios/verificarRol');
const { verificarOrigen } = require('../intermediarios/verificarOrigen');
const { ErrorApi } = require('../servicios/errorApi');

function exigirJson(peticion, respuesta, siguiente) {
  if (!peticion.is('application/json')) throw new ErrorApi(415, 'Se requiere un cuerpo JSON.');
  siguiente();
}

function crearRutasAdmin(controlador, verificarSesion, origen) {
  const rutas = Router();
  const validarEscritura = [verificarOrigen(origen), exigirJson, json({
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

  rutas.use(verificarSesion, verificarRol('ADMIN'));
  rutas.get('/metricas', controlador.metricas);
  rutas.get('/clientes', controlador.clientes);
  rutas.get('/clientes/:id', controlador.cliente);
  rutas.post('/clientes', validarEscritura, controlador.registrar);
  rutas.put('/clientes/:id', validarEscritura, controlador.editar);
  rutas.post('/consignar', validarEscritura, controlador.consignar);
  rutas.get('/movimientos', controlador.movimientos);
  return rutas;
}

module.exports = { crearRutasAdmin };
