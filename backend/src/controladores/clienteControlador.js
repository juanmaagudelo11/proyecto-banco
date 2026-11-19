const { ErrorApi } = require('../servicios/errorApi');
const { aCentavos } = require('../servicios/importes');

function entero(valor, maximo, nombre) {
  if (!['number', 'string'].includes(typeof valor) || !/^[1-9]\d*$/.test(String(valor)) || Number(valor) > maximo) {
    throw new ErrorApi(400, `${nombre} no es válido.`);
  }
  return Number(valor);
}

function validarCampos(cuerpo, permitidos) {
  const claves = Object.keys(cuerpo ?? {});
  if (!claves.length || claves.some((campo) => !permitidos.includes(campo))) {
    throw new ErrorApi(400, 'La solicitud contiene campos no permitidos o faltantes.');
  }
}

function texto(valor, maximo, nombre, admiteVacio = false) {
  const campo = typeof valor === 'string' ? valor.trim() : '';
  if (typeof valor !== 'string' || (!admiteVacio && !campo) || campo.length > maximo || campo.includes('\0')) {
    throw new ErrorApi(400, `${nombre} no es válido.`);
  }
  return campo;
}

function contrasena(valor, nueva = false) {
  if (typeof valor !== 'string' || !valor || Buffer.byteLength(valor, 'utf8') > 72 ||
      valor.includes('\0') || (nueva && valor.trim().length < 12)) {
    throw new ErrorApi(400, nueva ? 'La nueva contraseña requiere al menos 12 caracteres y admite hasta 72 bytes.'
      : 'Ingresa la contraseña actual.');
  }
  return valor;
}

function responder(respuesta, mensaje, datos, estado = 200) {
  return respuesta.status(estado).json({ exito: true, mensaje, datos });
}

function crearControladorCliente(servicio, nombreCookie, cookie) {
  return {
    async cuenta(peticion, respuesta) {
      const idCuenta = peticion.query.idCuenta === undefined ? undefined : entero(peticion.query.idCuenta, 4294967295, 'La cuenta');
      const datos = await servicio.consultarCuenta(peticion.usuario.idUsuario, idCuenta);
      return responder(respuesta, 'Resumen de la cuenta.', datos);
    },
    async movimientos(peticion, respuesta) {
      const { idCuenta, pagina = '1' } = peticion.query;
      const cuenta = idCuenta === undefined ? undefined : entero(idCuenta, 4294967295, 'La cuenta');
      const datos = await servicio.consultarMovimientos(peticion.usuario.idUsuario, cuenta, entero(pagina, 1000000, 'La página'));
      return responder(respuesta, 'Movimientos de la cuenta.', datos);
    },
    async perfil(peticion, respuesta) {
      return responder(respuesta, 'Datos del perfil.', await servicio.consultarPerfil(peticion.usuario.idUsuario));
    },
    async editarPerfil(peticion, respuesta) {
      const cuerpo = peticion.body;
      validarCampos(cuerpo, ['correo', 'telefono']);
      const correo = cuerpo.correo === undefined ? null : texto(cuerpo.correo, 100, 'El correo');
      if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
        throw new ErrorApi(400, 'El correo no es válido.');
      }
      const telefono = cuerpo.telefono === undefined ? null : texto(cuerpo.telefono, 20, 'El teléfono');
      const datos = await servicio.editarPerfil(peticion.usuario.idUsuario, { correo, telefono });
      return responder(respuesta, 'Perfil actualizado.', datos);
    },
    async cambiarContrasena(peticion, respuesta) {
      const cuerpo = peticion.body;
      validarCampos(cuerpo, ['contrasenaActual', 'nuevaContrasena']);
      await servicio.cambiarContrasena(
        peticion.usuario.idUsuario, contrasena(cuerpo.contrasenaActual), contrasena(cuerpo.nuevaContrasena, true)
      );
      respuesta.clearCookie(nombreCookie, cookie);
      return responder(respuesta, 'Contraseña actualizada. Inicia sesión de nuevo.', null);
    },
    async transferir(peticion, respuesta) {
      const cuerpo = peticion.body;
      validarCampos(cuerpo, ['idCuentaOrigen', 'cuentaDestino', 'monto', 'descripcion']);
      const monto = aCentavos(cuerpo.monto);
      if (monto === null || monto <= 0n) throw new ErrorApi(400, 'El monto debe ser positivo, con hasta 13 enteros y 2 decimales.');
      const datos = await servicio.transferir(peticion.usuario.idUsuario, {
        idCuentaOrigen: cuerpo.idCuentaOrigen === undefined ? undefined : entero(cuerpo.idCuentaOrigen, 4294967295, 'La cuenta origen'),
        cuentaDestino: texto(cuerpo.cuentaDestino, 20, 'La cuenta destino'),
        monto,
        descripcion: cuerpo.descripcion === undefined ? null : texto(cuerpo.descripcion, 255, 'La descripción', true) || null
      });
      return responder(respuesta, 'Transferencia realizada con éxito.', datos, 201);
    }
  };
}

module.exports = { crearControladorCliente };
