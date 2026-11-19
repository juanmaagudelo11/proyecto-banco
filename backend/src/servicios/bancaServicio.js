const bcrypt = require('bcrypt');
const { enTransaccion } = require('../baseDatos/transaccion');
const {
  buscarUsuarioPorId, bloquearUsuario, buscarContrasena, actualizarContrasena, actualizarPerfil
} = require('../modelos/usuario');
const {
  listarCuentasActivasPorUsuario, tieneCuentaActiva, localizarCuenta, bloquearCuenta, actualizarSaldo
} = require('../modelos/cuenta');
const { listarMovimientosDeTitular, registrarMovimientosTransferencia } = require('../modelos/movimiento');
const { registrarTransferencia } = require('../modelos/transferencia');
const { eliminarSesionesDeUsuario } = require('../modelos/sesion');
const { aCentavos, aDecimal, maximoCentavos } = require('./importes');
const { ErrorApi } = require('./errorApi');

const tamanoPagina = 20;

function cuentaPublica(cuenta) {
  return {
    idCuenta: cuenta.id_cuenta, numeroCuenta: cuenta.numero_cuenta,
    tipoCuenta: cuenta.tipo_cuenta, estado: cuenta.estado, saldo: cuenta.saldo
  };
}

function perfilPublico(usuario) {
  if (usuario?.rol !== 'CLIENTE' || usuario.estado !== 'ACTIVO') {
    throw new ErrorApi(403, 'Acceso no disponible para este usuario.');
  }
  return {
    nombreCompleto: usuario.nombre_completo, documento: usuario.documento,
    correo: usuario.correo, telefono: usuario.telefono
  };
}

async function seleccionarCuenta(conexion, idUsuario, idCuenta) {
  const cuentas = await listarCuentasActivasPorUsuario(conexion, idUsuario);
  const cuenta = idCuenta === undefined ? cuentas[0] : cuentas.find((fila) => fila.id_cuenta === idCuenta);
  if (!cuenta) throw new ErrorApi(404, 'Cuenta disponible no encontrada.');
  return { cuenta, cuentas };
}

async function bloquearTitularActivo(conexion, idUsuario) {
  const titular = await bloquearUsuario(conexion, idUsuario);
  if (titular?.rol !== 'CLIENTE' || titular.estado !== 'ACTIVO' ||
      !await tieneCuentaActiva(conexion, idUsuario)) {
    throw new ErrorApi(403, 'Acceso no disponible para este usuario.');
  }
}

function crearServicioBanca(grupo) {
  async function consultarCuenta(idUsuario, idCuenta) {
    const { cuenta, cuentas } = await seleccionarCuenta(grupo, idUsuario, idCuenta);
    return { ...cuentaPublica(cuenta), titular: cuenta.nombre_completo, cuentas: cuentas.map(cuentaPublica) };
  }

  async function consultarMovimientos(idUsuario, idCuenta, pagina) {
    const { cuenta } = await seleccionarCuenta(grupo, idUsuario, idCuenta);
    const filas = await listarMovimientosDeTitular(
      grupo, idUsuario, cuenta.id_cuenta, tamanoPagina + 1, (pagina - 1) * tamanoPagina
    );
    return { idCuenta: cuenta.id_cuenta, elementos: filas.slice(0, tamanoPagina), pagina, hayMas: filas.length > tamanoPagina };
  }

  async function consultarPerfil(idUsuario) {
    return perfilPublico(await buscarUsuarioPorId(grupo, idUsuario));
  }

  async function editarPerfil(idUsuario, cambios) {
    return enTransaccion(grupo, async (conexion) => {
      await bloquearTitularActivo(conexion, idUsuario);
      try {
        await actualizarPerfil(conexion, idUsuario, cambios);
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') throw new ErrorApi(409, 'El correo ya está registrado.');
        throw error;
      }
      return perfilPublico(await buscarUsuarioPorId(conexion, idUsuario));
    });
  }

  async function cambiarContrasena(idUsuario, actual, nueva) {
    const hashActual = await buscarContrasena(grupo, idUsuario);
    if (!hashActual || !await bcrypt.compare(actual, hashActual)) {
      throw new ErrorApi(403, 'La contraseña actual no es correcta.');
    }
    const hashNuevo = await bcrypt.hash(nueva, 12);
    await enTransaccion(grupo, async (conexion) => {
      await bloquearTitularActivo(conexion, idUsuario);
      if (await buscarContrasena(conexion, idUsuario) !== hashActual) {
        throw new ErrorApi(403, 'La contraseña actual no es correcta.');
      }
      await actualizarContrasena(conexion, idUsuario, hashNuevo);
      await eliminarSesionesDeUsuario(conexion, idUsuario);
    });
  }

  async function transferir(idUsuario, { idCuentaOrigen, cuentaDestino, monto, descripcion }) {
    return enTransaccion(grupo, async (conexion) => {
      const origen = idCuentaOrigen === undefined
        ? (await seleccionarCuenta(conexion, idUsuario)).cuenta
        : { id_cuenta: idCuentaOrigen, id_usuario: idUsuario };
      const destino = await localizarCuenta(conexion, cuentaDestino);
      if (!destino) throw new ErrorApi(404, 'Cuenta destino no disponible.');

      const titulares = new Set([idUsuario, destino.id_usuario].sort((a, b) => a - b));
      for (const idTitular of titulares) {
        const usuario = await bloquearUsuario(conexion, idTitular);
        if (usuario?.rol !== 'CLIENTE' || usuario.estado !== 'ACTIVO') {
          throw new ErrorApi(403, 'Los titulares y las cuentas deben estar activos.');
        }
      }

      const cuentas = new Map();
      for (const referencia of [origen, destino].sort((a, b) => a.id_cuenta - b.id_cuenta)) {
        const cuenta = await bloquearCuenta(conexion, referencia.id_cuenta, referencia.id_usuario);
        if (!cuenta) throw new ErrorApi(404, 'Cuenta no disponible.');
        if (cuenta.estado !== 'ACTIVO') throw new ErrorApi(403, 'Los titulares y las cuentas deben estar activos.');
        cuentas.set(referencia.id_cuenta, cuenta);
      }
      if (origen.id_cuenta === destino.id_cuenta) {
        throw new ErrorApi(400, 'Selecciona una cuenta destino distinta de la cuenta origen.');
      }

      const cuentaOrigen = cuentas.get(origen.id_cuenta);
      const cuentaDestinoBloqueada = cuentas.get(destino.id_cuenta);
      const saldoOrigen = aCentavos(cuentaOrigen.saldo);
      const saldoDestino = aCentavos(cuentaDestinoBloqueada.saldo);
      if (monto > saldoOrigen) throw new ErrorApi(409, 'Saldo insuficiente.');
      if (saldoDestino + monto > maximoCentavos) {
        throw new ErrorApi(409, 'La transferencia excede el saldo máximo de la cuenta destino.');
      }

      const montoDecimal = aDecimal(monto);
      const nuevoSaldo = aDecimal(saldoOrigen - monto);
      const nuevoSaldoDestino = aDecimal(saldoDestino + monto);
      await actualizarSaldo(conexion, origen.id_cuenta, nuevoSaldo);
      await actualizarSaldo(conexion, destino.id_cuenta, nuevoSaldoDestino);
      const idTransferencia = await registrarTransferencia(
        conexion, origen.id_cuenta, destino.id_cuenta, montoDecimal, descripcion
      );
      await registrarMovimientosTransferencia(conexion, idTransferencia, montoDecimal, descripcion, [
        { idCuenta: origen.id_cuenta, saldoAnterior: cuentaOrigen.saldo, saldoResultante: nuevoSaldo },
        { idCuenta: destino.id_cuenta, saldoAnterior: cuentaDestinoBloqueada.saldo, saldoResultante: nuevoSaldoDestino }
      ]);
      return {
        idTransferencia, cuentaOrigen: cuentaOrigen.numero_cuenta, cuentaDestino: cuentaDestinoBloqueada.numero_cuenta,
        montoTransferido: montoDecimal, nuevoSaldo
      };
    });
  }

  return { consultarCuenta, consultarMovimientos, consultarPerfil, editarPerfil, cambiarContrasena, transferir };
}

module.exports = { crearServicioBanca };
