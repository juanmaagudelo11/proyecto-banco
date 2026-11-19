const { ErrorApi } = require('../servicios/errorApi');
const { aCentavos } = require('../servicios/importes');

const estados = ['ACTIVO', 'INACTIVO', 'BLOQUEADO'];
const tiposCuenta = ['AHORROS', 'CORRIENTE'];
const tiposMovimiento = ['CONSIGNACION', 'RETIRO', 'TRANSFERENCIA_ENVIADA', 'TRANSFERENCIA_RECIBIDA'];

function texto(valor, campo, maximo) {
  if (typeof valor !== 'string' || !valor.trim() || valor.trim().length > maximo || valor.includes('\0')) {
    throw new ErrorApi(400, `${campo} debe contener entre 1 y ${maximo} caracteres.`);
  }
  return valor.trim();
}

function correoValido(valor) {
  const correo = texto(valor, 'El correo', 100);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw new ErrorApi(400, 'El correo no es válido.');
  return correo;
}

function opcion(valor, opciones, campo) {
  if (!opciones.includes(valor)) throw new ErrorApi(400, `${campo} no es válido.`);
  return valor;
}

function entero(valor, maximo, campo) {
  if (!['string', 'number'].includes(typeof valor) || !/^[1-9]\d*$/.test(String(valor)) ||
      Number(valor) > maximo) throw new ErrorApi(400, `${campo} no es válido.`);
  return Number(valor);
}

function id(valor) {
  return entero(valor, 4294967295, 'El identificador');
}

function pagina(valor) {
  return valor === undefined ? 1 : entero(valor, 1000000, 'La página');
}

function importe(valor, admiteCero) {
  const centavos = aCentavos(valor);
  if (centavos === null || (!admiteCero && centavos === 0n)) {
    throw new ErrorApi(400, admiteCero
      ? 'El saldo inicial debe ser cero o positivo, con hasta 13 enteros y 2 decimales.'
      : 'El monto debe ser positivo, con hasta 13 enteros y 2 decimales.');
  }
  return centavos;
}

function fecha(valor) {
  if (valor === undefined || valor === '') return null;
  if (typeof valor !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(valor)) {
    throw new ErrorApi(400, 'La fecha debe usar el formato AAAA-MM-DD.');
  }
  const instante = new Date(`${valor}T00:00:00Z`);
  if (Number.isNaN(instante.valueOf()) || instante.toISOString().slice(0, 10) !== valor) {
    throw new ErrorApi(400, 'La fecha no es válida.');
  }
  return valor;
}

function datosRegistro(cuerpo) {
  const { contrasena, pinAtm } = cuerpo ?? {};
  if (typeof contrasena !== 'string' || contrasena.trim().length < 12 ||
      Buffer.byteLength(contrasena, 'utf8') > 72 || contrasena.includes('\0')) {
    throw new ErrorApi(400, 'La contraseña requiere al menos 12 caracteres y admite un máximo de 72 bytes.');
  }
  if (typeof pinAtm !== 'string' || !/^\d{4}$/.test(pinAtm)) {
    throw new ErrorApi(400, 'El PIN debe ser una cadena de cuatro dígitos.');
  }
  const documento = texto(cuerpo.documento, 'El documento', 20);
  if (documento.includes('@')) throw new ErrorApi(400, 'El documento no puede contener @.');
  return {
    nombreCompleto: texto(cuerpo.nombreCompleto, 'El nombre', 120), documento,
    correo: correoValido(cuerpo.correo), telefono: texto(cuerpo.telefono, 'El teléfono', 20),
    contrasena, pinAtm, tipoCuenta: opcion(cuerpo.tipoCuenta, tiposCuenta, 'El tipo de cuenta'),
    saldoInicial: importe(cuerpo.saldoInicial, true)
  };
}

function datosEdicion(cuerpo) {
  const permitidos = ['nombreCompleto', 'correo', 'telefono', 'estadoUsuario', 'idCuenta', 'estadoCuenta'];
  const claves = Object.keys(cuerpo ?? {});
  if (!claves.length || claves.some((campo) => !permitidos.includes(campo))) {
    throw new ErrorApi(400, 'Envía únicamente datos editables del cliente o de estado.');
  }

  if ((cuerpo.idCuenta === undefined) !== (cuerpo.estadoCuenta === undefined)) {
    throw new ErrorApi(400, 'Para cambiar el estado de la cuenta indica idCuenta y estadoCuenta.');
  }
  return {
    nombreCompleto: cuerpo.nombreCompleto === undefined ? null : texto(cuerpo.nombreCompleto, 'El nombre', 120),
    correo: cuerpo.correo === undefined ? null : correoValido(cuerpo.correo),
    telefono: cuerpo.telefono === undefined ? null : texto(cuerpo.telefono, 'El teléfono', 20),
    estadoUsuario: cuerpo.estadoUsuario === undefined ? null : opcion(cuerpo.estadoUsuario, estados, 'El estado del cliente'),
    idCuenta: cuerpo.idCuenta === undefined ? null : id(cuerpo.idCuenta),
    estadoCuenta: cuerpo.estadoCuenta === undefined ? null : opcion(cuerpo.estadoCuenta, estados, 'El estado de la cuenta')
  };
}

function responder(respuesta, datos, mensaje, estado = 200) {
  return respuesta.status(estado).json({ exito: true, mensaje, datos });
}

function crearControladorAdmin(servicio) {
  return {
    async metricas(peticion, respuesta) {
      return responder(respuesta, await servicio.consultarMetricas(), 'Métricas del banco.');
    },
    async clientes(peticion, respuesta) {
      const { buscar = '' } = peticion.query;
      const criterio = buscar === '' ? '' : texto(buscar, 'La búsqueda', 120);
      const datos = await servicio.listarClientes(criterio, pagina(peticion.query.pagina));
      return responder(respuesta, datos, 'Clientes encontrados.');
    },
    async cliente(peticion, respuesta) {
      return responder(respuesta, await servicio.consultarCliente(id(peticion.params.id)), 'Detalle del cliente.');
    },
    async registrar(peticion, respuesta) {
      const datos = await servicio.registrarCliente(datosRegistro(peticion.body));
      return responder(respuesta, datos, 'Cliente y cuenta registrados correctamente.', 201);
    },
    async editar(peticion, respuesta) {
      const datos = await servicio.editarCliente(id(peticion.params.id), datosEdicion(peticion.body));
      return responder(respuesta, datos, 'Cambios guardados.');
    },
    async consignar(peticion, respuesta) {
      const { numeroCuenta, cuentaDestino, monto, descripcion } = peticion.body ?? {};
      const destino = numeroCuenta ?? cuentaDestino;
      const datos = await servicio.consignar({
        numeroCuenta: texto(destino, 'El número de cuenta', 20),
        monto: importe(monto, false), descripcion: texto(descripcion, 'La descripción', 255)
      });
      return responder(respuesta, datos, 'Consignación registrada.', 201);
    },
    async movimientos(peticion, respuesta) {
      const { desde, hasta, tipo, numeroCuenta } = peticion.query;
      const filtros = {
        desde: fecha(desde), hasta: fecha(hasta),
        tipo: tipo ? opcion(tipo, tiposMovimiento, 'El tipo de movimiento') : null,
        numeroCuenta: numeroCuenta ? texto(numeroCuenta, 'El número de cuenta', 20) : null
      };
      if (filtros.desde && filtros.hasta && filtros.desde > filtros.hasta) {
        throw new ErrorApi(400, 'La fecha inicial debe ser anterior o igual a la final.');
      }
      const datos = await servicio.historial(filtros, pagina(peticion.query.pagina));
      return responder(respuesta, datos, 'Historial de movimientos.');
    }
  };
}

module.exports = { crearControladorAdmin };
