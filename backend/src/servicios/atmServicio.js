const { createHash } = require('node:crypto');
const bcrypt = require('bcrypt');
const { enTransaccion } = require('../baseDatos/transaccion');
const { bloquearUsuario } = require('../modelos/usuario');
const { bloquearCuenta, actualizarSaldo } = require('../modelos/cuenta');
const { listarMovimientosDeTitular, registrarRetiro } = require('../modelos/movimiento');
const atm = require('../modelos/atm');
const { crearTokenSesion, huellaDeSesion, hashSimulado } = require('./seguridadSesion');
const { aCentavos, aDecimal } = require('./importes');
const { ErrorApi } = require('./errorApi');

const vigenciaAtmSegundos = 5 * 60;

function cuentaActiva(cuenta) {
  return cuenta.estado === 'ACTIVO' && cuenta.estado_usuario === 'ACTIVO' && cuenta.rol === 'CLIENTE';
}

function cuentaPublica(cuenta) {
  return { numeroCuenta: cuenta.numero_cuenta, saldo: cuenta.saldo, segundosRestantes: Number(cuenta.segundos_restantes) };
}

function crearServicioAtm(grupo) {
  async function salir(token) {
    const huella = huellaDeSesion(token);
    if (huella) await atm.eliminarSesionAtm(grupo, huella);
  }

  async function iniciar(numeroCuenta, pin, tokenPrevio) {
    const datos = await atm.buscarCredencialesAtm(grupo, numeroCuenta);
    const coincide = await bcrypt.compare(pin, datos?.pin_atm ?? hashSimulado);
    if (!datos || !coincide) throw new ErrorApi(401, 'Número de cuenta o PIN incorrectos.');
    if (!cuentaActiva(datos)) throw new ErrorApi(403, 'La cuenta no está disponible para el cajero.');

    await salir(tokenPrevio);
    await atm.eliminarSesionesAtmVencidas(grupo);
    return enTransaccion(grupo, async (conexion) => {
      const titular = await bloquearUsuario(conexion, datos.id_usuario);
      const cuenta = await bloquearCuenta(conexion, datos.id_cuenta, datos.id_usuario);
      if (titular?.estado !== 'ACTIVO' || titular.rol !== 'CLIENTE' || cuenta?.estado !== 'ACTIVO') {
        throw new ErrorApi(403, 'La cuenta no está disponible para el cajero.');
      }
      const vigente = await atm.buscarCredencialesAtm(conexion, numeroCuenta);
      if (vigente?.pin_atm !== datos.pin_atm) {
        throw new ErrorApi(401, 'Número de cuenta o PIN incorrectos.');
      }
      const token = crearTokenSesion();
      await atm.guardarSesionAtm(conexion, huellaDeSesion(token), datos.id_cuenta, vigenciaAtmSegundos);
      return { token, cuenta: cuentaPublica({ ...cuenta, segundos_restantes: vigenciaAtmSegundos }) };
    });
  }

  async function consultarSesion(token) {
    const huella = huellaDeSesion(token);
    if (!huella) return { estado: 401 };
    const cuenta = await atm.buscarCuentaDeSesion(grupo, huella);
    if (!cuenta) return { estado: 401 };
    if (!cuentaActiva(cuenta)) {
      await atm.eliminarSesionAtm(grupo, huella);
      return { estado: 403 };
    }
    return { estado: 200, cuenta, huella };
  }

  async function movimientos(cuenta) {
    return { elementos: await listarMovimientosDeTitular(grupo, cuenta.id_usuario, cuenta.id_cuenta, 5, 0) };
  }

  async function retirar(sesion, monto, clave) {
    const importe = aDecimal(monto);
    const huellaSolicitud = clave
      ? createHash('sha256').update(sesion.huella).update(clave).digest()
      : null;

    return enTransaccion(grupo, async (conexion) => {
      const { cuenta: referencia, huella } = sesion;
      const titular = await bloquearUsuario(conexion, referencia.id_usuario);
      const cuenta = await bloquearCuenta(conexion, referencia.id_cuenta, referencia.id_usuario);
      if (titular?.estado !== 'ACTIVO' || titular.rol !== 'CLIENTE' || cuenta?.estado !== 'ACTIVO') {
        throw new ErrorApi(403, 'La cuenta no está disponible para el cajero.');
      }
      if (!await atm.bloquearSesionVigente(conexion, huella, referencia.id_cuenta)) {
        throw new ErrorApi(401, 'Identifícate de nuevo en el cajero.');
      }

      const previo = huellaSolicitud && await atm.buscarRetiroPrevio(conexion, huellaSolicitud);
      if (previo) {
        if (previo.monto !== importe) {
          throw new ErrorApi(409, 'Esta solicitud de retiro ya se usó con otro monto.');
        }
        return { repetido: true, datos: { numeroCuenta: cuenta.numero_cuenta, ...previo } };
      }

      const saldo = aCentavos(cuenta.saldo);
      if (monto > saldo) throw new ErrorApi(409, 'Saldo insuficiente.');
      const saldoResultante = aDecimal(saldo - monto);
      await actualizarSaldo(conexion, referencia.id_cuenta, saldoResultante);
      const idMovimiento = await registrarRetiro(conexion, referencia.id_cuenta, importe, cuenta.saldo, saldoResultante);
      if (huellaSolicitud) await atm.recordarRetiro(conexion, huellaSolicitud, idMovimiento);
      return {
        repetido: false,
        datos: { numeroCuenta: cuenta.numero_cuenta, idMovimiento, monto: importe, saldoResultante }
      };
    });
  }

  return { iniciar, salir, consultarSesion, movimientos, retirar };
}

module.exports = { crearServicioAtm, cuentaPublica, vigenciaAtmSegundos };
