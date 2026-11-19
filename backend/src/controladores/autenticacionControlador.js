const { vigenciaSegundos } = require('../servicios/autenticacionServicio');

function leerCredenciales(cuerpo) {
  const { identificador, correo, documento, contrasena } = cuerpo ?? {};
  const entradas = [identificador, correo, documento].filter((valor) => valor !== undefined);
  if (entradas.length !== 1 || typeof entradas[0] !== 'string' ||
      typeof contrasena !== 'string') return null;

  const usuario = entradas[0].trim();
  if (!usuario || usuario.length > 100 || !contrasena ||
      Buffer.byteLength(contrasena, 'utf8') > 72 || contrasena.includes('\0')) return null;
  return { usuario, contrasena };
}

function crearControladorAutenticacion(servicio, nombreCookie, cookie) {
  async function ingresar(peticion, respuesta) {
    const credenciales = leerCredenciales(peticion.body);
    if (!credenciales) {
      return respuesta.status(400).json({
        exito: false, mensaje: 'Ingresa un correo o documento y una contraseña válidos.', datos: null
      });
    }

    const resultado = await servicio.iniciarSesion(
      credenciales.usuario, credenciales.contrasena, peticion.cookies[nombreCookie]
    );
    if (resultado.estado !== 200) {
      return respuesta.status(resultado.estado).json({
        exito: false,
        mensaje: resultado.estado === 401 ? 'Credenciales incorrectas.' : 'Acceso no disponible para este usuario.',
        datos: null
      });
    }

    respuesta.cookie(nombreCookie, resultado.token, { ...cookie, maxAge: vigenciaSegundos * 1000 });
    return respuesta.json({ exito: true, mensaje: 'Inicio de sesión exitoso.', datos: resultado.usuario });
  }

  async function salir(peticion, respuesta) {
    await servicio.cerrarSesion(peticion.cookies[nombreCookie]);
    respuesta.clearCookie(nombreCookie, cookie);
    return respuesta.json({ exito: true, mensaje: 'Sesión cerrada.', datos: null });
  }

  function sesion(peticion, respuesta) {
    return respuesta.json({ exito: true, mensaje: 'Sesión activa.', datos: peticion.usuario });
  }

  return { ingresar, salir, sesion };
}

module.exports = { crearControladorAutenticacion };
