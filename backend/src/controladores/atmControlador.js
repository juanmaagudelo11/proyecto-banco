const { ErrorApi } = require('../servicios/errorApi');
const { cuentaPublica, vigenciaAtmSegundos } = require('../servicios/atmServicio');
const { aCentavos } = require('../servicios/importes');

function validarIngresoAtm(peticion, respuesta, siguiente) {
  const { numeroCuenta, pin } = peticion.body ?? {};
  const numero = typeof numeroCuenta === 'string' ? numeroCuenta.trim() : '';
  if (!/^\d{1,20}$/.test(numero) || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
    throw new ErrorApi(400, 'Ingresa un número de cuenta y un PIN de cuatro dígitos.');
  }
  peticion.ingresoAtm = { numeroCuenta: numero, pin };
  siguiente();
}

function responder(respuesta, mensaje, datos, estado = 200) {
  return respuesta.status(estado).json({ exito: true, mensaje, datos });
}

function crearControladorAtm(servicio, nombreCookie, cookie) {
  return {
    async verificarSesion(peticion, respuesta, siguiente) {
      const token = peticion.cookies[nombreCookie];
      const resultado = await servicio.consultarSesion(token);
      if (resultado.estado === 200) {
        peticion.sesionAtm = resultado;
        return siguiente();
      }
      if (token) respuesta.clearCookie(nombreCookie, cookie);
      throw new ErrorApi(resultado.estado, resultado.estado === 401
        ? 'Identifícate en el cajero para continuar.' : 'La cuenta no está disponible para el cajero.');
    },
    async iniciar(peticion, respuesta) {
      const { numeroCuenta, pin } = peticion.ingresoAtm;
      const resultado = await servicio.iniciar(numeroCuenta, pin, peticion.cookies[nombreCookie]);
      respuesta.cookie(nombreCookie, resultado.token, { ...cookie, maxAge: vigenciaAtmSegundos * 1000 });
      return responder(respuesta, 'Identificación correcta.', resultado.cuenta);
    },
    saldo(peticion, respuesta) {
      return responder(respuesta, 'Saldo de la cuenta.', cuentaPublica(peticion.sesionAtm.cuenta));
    },
    async movimientos(peticion, respuesta) {
      return responder(respuesta, 'Últimos movimientos.', await servicio.movimientos(peticion.sesionAtm.cuenta));
    },
    async retirar(peticion, respuesta) {
      const cuerpo = peticion.body ?? {};
      const monto = aCentavos(cuerpo.monto);
      if (Object.keys(cuerpo).some((campo) => campo !== 'monto')) {
        throw new ErrorApi(400, 'El retiro solo admite el monto de la cuenta identificada.');
      }
      if (monto === null || monto <= 0n) {
        throw new ErrorApi(400, 'El monto debe ser positivo, con hasta 13 enteros y 2 decimales.');
      }
      const clave = peticion.get('idempotency-key');
      if (clave !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clave)) {
        throw new ErrorApi(400, 'La clave del retiro no es válida.');
      }
      const resultado = await servicio.retirar(peticion.sesionAtm, monto, clave?.toLowerCase());
      return responder(respuesta, resultado.repetido ? 'Este retiro ya estaba registrado.' : 'Retiro registrado.',
        resultado.datos, resultado.repetido ? 200 : 201);
    },
    async salir(peticion, respuesta) {
      await servicio.salir(peticion.cookies[nombreCookie]);
      respuesta.clearCookie(nombreCookie, cookie);
      return responder(respuesta, 'Sesión del cajero cerrada.', null);
    }
  };
}

module.exports = { crearControladorAtm, validarIngresoAtm };
