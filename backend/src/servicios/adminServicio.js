const { randomInt } = require('node:crypto');
const bcrypt = require('bcrypt');
const administracion = require('../modelos/administracion');
const { buscarUsuarioPorId } = require('../modelos/usuario');
const { listarCuentasPorUsuario } = require('../modelos/cuenta');
const { ErrorApi } = require('./errorApi');
const { aCentavos, aDecimal, maximoCentavos } = require('./importes');

const tamanoPagina = 20;

async function enTransaccion(grupo, operacion) {
  const conexion = await grupo.getConnection();
  try {
    await conexion.beginTransaction();
    const resultado = await operacion(conexion);
    await conexion.commit();
    return resultado;
  } catch (error) {
    try {
      await conexion.rollback();
    } catch {
      conexion.destroy();
    }
    throw error;
  } finally {
    conexion.release();
  }
}

function respuestaPaginada(filas, pagina) {
  return { elementos: filas.slice(0, tamanoPagina), pagina, hayMas: filas.length > tamanoPagina };
}

function datosCuenta(cuenta) {
  return {
    idCuenta: cuenta.id_cuenta, numeroCuenta: cuenta.numero_cuenta,
    tipoCuenta: cuenta.tipo_cuenta, saldo: cuenta.saldo, estadoCuenta: cuenta.estado
  };
}

async function abrirCuenta(conexion, idUsuario, tipo, saldo, hash) {
  for (let intento = 0; intento < 5; intento++) {
    const numeroCuenta = String(randomInt(1000000000, 10000000000));
    try {
      const idCuenta = await administracion.crearCuenta(conexion, idUsuario, numeroCuenta, tipo, saldo, hash);
      return { idCuenta, numeroCuenta };
    } catch (error) {
      if (error.code !== 'ER_DUP_ENTRY') throw error;
    }
  }
  throw new ErrorApi(503, 'No se pudo asignar un número de cuenta. Inténtalo de nuevo.');
}

function crearServicioAdmin(grupo) {
  async function listarClientes(buscar, pagina) {
    const filas = await administracion.buscarClientes(grupo, buscar, tamanoPagina + 1, (pagina - 1) * tamanoPagina);
    const listado = respuestaPaginada(filas, pagina);
    const clientes = new Map(listado.elementos.map((cliente) => {
      cliente.cuentas = [];
      return [cliente.idUsuario, cliente];
    }));
    const cuentas = await administracion.listarCuentasDeClientes(grupo, listado.elementos);
    for (const { idUsuario, ...cuenta } of cuentas) {
      clientes.get(idUsuario).cuentas.push(cuenta);
    }
    return listado;
  }

  async function consultarCliente(idUsuario) {
    const usuario = await buscarUsuarioPorId(grupo, idUsuario);
    if (!usuario || usuario.rol !== 'CLIENTE') throw new ErrorApi(404, 'Cliente no encontrado.');
    const cuentas = await listarCuentasPorUsuario(grupo, idUsuario);
    return {
      idUsuario, nombreCompleto: usuario.nombre_completo, documento: usuario.documento,
      correo: usuario.correo, telefono: usuario.telefono, estadoUsuario: usuario.estado,
      cuentas: cuentas.map(datosCuenta)
    };
  }

  async function registrarCliente(datos) {
    const [hashContrasena, hashPin] = await Promise.all([
      bcrypt.hash(datos.contrasena, 12), bcrypt.hash(datos.pinAtm, 12)
    ]);

    return enTransaccion(grupo, async (conexion) => {
      let idUsuario;
      try {
        idUsuario = await administracion.crearCliente(conexion, datos, hashContrasena);
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') throw new ErrorApi(409, 'El documento o correo ya está registrado.');
        throw error;
      }
      const saldo = aDecimal(datos.saldoInicial);
      const cuenta = await abrirCuenta(conexion, idUsuario, datos.tipoCuenta, saldo, hashPin);
      if (datos.saldoInicial > 0n) {
        await administracion.registrarConsignacion(
          conexion, cuenta.idCuenta, saldo, '0.00', saldo, 'Consignación de apertura'
        );
      }
      return { idUsuario, ...cuenta };
    });
  }

  async function editarCliente(idUsuario, cambios) {
    await enTransaccion(grupo, async (conexion) => {
      const usuario = await administracion.bloquearUsuario(conexion, idUsuario);
      if (usuario?.rol !== 'CLIENTE') throw new ErrorApi(404, 'Cliente no encontrado.');
      if (cambios.idCuenta !== null) {
        const cuenta = await administracion.bloquearCuenta(conexion, cambios.idCuenta, idUsuario);
        if (!cuenta) throw new ErrorApi(404, 'Cuenta no encontrada para este cliente.');
        await administracion.actualizarEstadoCuenta(conexion, cambios.idCuenta, idUsuario, cambios.estadoCuenta);
      }

      const cambiaUsuario = [cambios.nombreCompleto, cambios.correo, cambios.telefono, cambios.estadoUsuario]
        .some((valor) => valor !== null);
      if (cambiaUsuario) {
        try {
          await administracion.actualizarCliente(conexion, idUsuario, cambios);
        } catch (error) {
          if (error.code === 'ER_DUP_ENTRY') throw new ErrorApi(409, 'El correo ya está registrado.');
          throw error;
        }
      }
    });
    return consultarCliente(idUsuario);
  }

  async function consignar({ numeroCuenta, monto, descripcion }) {
    return enTransaccion(grupo, async (conexion) => {
      const destino = await administracion.localizarCuenta(conexion, numeroCuenta);
      if (!destino) throw new ErrorApi(404, 'Cuenta no encontrada.');

      const titular = await administracion.bloquearUsuario(conexion, destino.id_usuario);
      const cuenta = await administracion.bloquearCuenta(conexion, destino.id_cuenta, destino.id_usuario);
      if (!cuenta) throw new ErrorApi(404, 'Cuenta no encontrada.');
      if (titular?.estado !== 'ACTIVO' || cuenta.estado !== 'ACTIVO') {
        throw new ErrorApi(403, 'El titular y la cuenta deben estar activos.');
      }

      const suma = aCentavos(cuenta.saldo) + monto;
      if (suma > maximoCentavos) throw new ErrorApi(409, 'La consignación excede el saldo máximo de la cuenta.');
      const saldoResultante = aDecimal(suma);
      const importe = aDecimal(monto);
      await administracion.actualizarSaldo(conexion, destino.id_cuenta, saldoResultante);
      const idMovimiento = await administracion.registrarConsignacion(
        conexion, destino.id_cuenta, importe, cuenta.saldo, saldoResultante, descripcion
      );
      return { idMovimiento, numeroCuenta, monto: importe, saldoAnterior: cuenta.saldo, saldoResultante };
    });
  }

  async function historial(filtros, pagina) {
    const filas = await administracion.listarHistorial(grupo, filtros, tamanoPagina + 1, (pagina - 1) * tamanoPagina);
    return respuestaPaginada(filas, pagina);
  }

  return {
    consultarMetricas: () => administracion.consultarMetricas(grupo),
    listarClientes, consultarCliente, registrarCliente, editarCliente, consignar, historial
  };
}

module.exports = { crearServicioAdmin };
