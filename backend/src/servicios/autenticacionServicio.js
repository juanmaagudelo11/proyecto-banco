const { createHash, randomBytes } = require('node:crypto');
const bcrypt = require('bcrypt');
const { buscarUsuarioParaIngreso } = require('../modelos/usuario');
const { tieneCuentaActiva } = require('../modelos/cuenta');
const {
  guardarSesion, buscarUsuarioDeSesion, eliminarSesion, eliminarSesionesVencidas
} = require('../modelos/sesion');

const vigenciaSegundos = 30 * 60;
// Hash de un valor aleatorio, usado para comparar también si la identidad no existe.
const hashSinUsuario = '$2b$12$Oe/ob3J1Q/RvLh.NwEUTXeOinVmXXsVniw8UkILkVQpDj8q9qETQG';

function huellaDeSesion(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return createHash('sha256').update(token).digest();
}

function datosPublicos(usuario) {
  return { rol: usuario.rol, idUsuario: usuario.id_usuario, nombre: usuario.nombre_completo };
}

function crearServicioAutenticacion(conexion) {
  async function puedeAcceder(usuario) {
    if (usuario.estado !== 'ACTIVO') return false;
    return usuario.rol === 'ADMIN' ||
      (usuario.rol === 'CLIENTE' && await tieneCuentaActiva(conexion, usuario.id_usuario));
  }

  async function cerrarSesion(token) {
    const huella = huellaDeSesion(token);
    if (huella) await eliminarSesion(conexion, huella);
  }

  async function iniciarSesion(identificador, contrasena, tokenAnterior) {
    const usuario = await buscarUsuarioParaIngreso(conexion, identificador);
    const coincide = await bcrypt.compare(contrasena, usuario?.contrasena ?? hashSinUsuario);
    if (!usuario || !coincide) return { estado: 401 };
    if (!await puedeAcceder(usuario)) return { estado: 403 };

    const token = randomBytes(32).toString('base64url');
    await cerrarSesion(tokenAnterior);
    await eliminarSesionesVencidas(conexion);
    await guardarSesion(conexion, huellaDeSesion(token), usuario.id_usuario, vigenciaSegundos);
    return { estado: 200, usuario: datosPublicos(usuario), token };
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
