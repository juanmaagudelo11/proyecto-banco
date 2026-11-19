const { crearTokenSesion, huellaDeSesion, hashSimulado } = require('./seguridadSesion');
const bcrypt = require('bcrypt');
const { buscarUsuarioParaIngreso, leerUsuarioParaSesion } = require('../modelos/usuario');
const { enTransaccion } = require('../baseDatos/transaccion');
const { tieneCuentaActiva } = require('../modelos/cuenta');
const {
  guardarSesion, buscarUsuarioDeSesion, eliminarSesion, eliminarSesionesVencidas
} = require('../modelos/sesion');

const vigenciaSegundos = 30 * 60;

function datosPublicos(usuario) {
  return { rol: usuario.rol, idUsuario: usuario.id_usuario, nombre: usuario.nombre_completo };
}

function crearServicioAutenticacion(conexion) {
  async function puedeAcceder(usuario, datos = conexion) {
    if (usuario.estado !== 'ACTIVO') return false;
    return usuario.rol === 'ADMIN' ||
      (usuario.rol === 'CLIENTE' && await tieneCuentaActiva(datos, usuario.id_usuario));
  }

  async function cerrarSesion(token) {
    const huella = huellaDeSesion(token);
    if (huella) await eliminarSesion(conexion, huella);
  }

  async function iniciarSesion(identificador, contrasena, tokenAnterior) {
    const usuario = await buscarUsuarioParaIngreso(conexion, identificador);
    const coincide = await bcrypt.compare(contrasena, usuario?.contrasena ?? hashSimulado);
    if (!usuario || !coincide) return { estado: 401 };
    if (!await puedeAcceder(usuario)) return { estado: 403 };

    const token = crearTokenSesion();
    await cerrarSesion(tokenAnterior);
    await eliminarSesionesVencidas(conexion);
    return enTransaccion(conexion, async (transaccion) => {
      const vigente = await leerUsuarioParaSesion(transaccion, usuario.id_usuario);
      if (vigente?.contrasena !== usuario.contrasena) return { estado: 401 };
      if (!vigente || !await puedeAcceder(vigente, transaccion)) return { estado: 403 };
      await guardarSesion(transaccion, huellaDeSesion(token), usuario.id_usuario, vigenciaSegundos);
      return { estado: 200, usuario: datosPublicos(vigente), token };
    });
  }

  async function consultarSesion(token) {
    const huella = huellaDeSesion(token);
    if (!huella) return { estado: 401 };

    const usuario = await buscarUsuarioDeSesion(conexion, huella);
    if (!usuario) return { estado: 401 };
    if (!await puedeAcceder(usuario)) {
      await eliminarSesion(conexion, huella);
      return { estado: 403 };
    }
    return { estado: 200, usuario: datosPublicos(usuario) };
  }

  return { iniciarSesion, cerrarSesion, consultarSesion };
}

module.exports = { crearServicioAutenticacion, vigenciaSegundos };
