const ruta = require('node:path');
const express = require('express');
const dotenv = require('dotenv');
const leerCookies = require('cookie-parser');
const { crearGrupoConexiones, verificarConexion } = require('./baseDatos');
const { crearModeloSalud } = require('./modelos/salud');
const { crearServicioSalud } = require('./servicios/saludServicio');
const { crearControladorSalud } = require('./controladores/saludControlador');
const { crearRutasSalud } = require('./rutas/saludRutas');
const { crearServicioAutenticacion } = require('./servicios/autenticacionServicio');
const { crearControladorAutenticacion } = require('./controladores/autenticacionControlador');
const { crearRutasAutenticacion } = require('./rutas/autenticacionRutas');
const { crearServicioAdmin } = require('./servicios/adminServicio');
const { crearControladorAdmin } = require('./controladores/adminControlador');
const { crearRutasAdmin } = require('./rutas/adminRutas');
const { crearServicioBanca } = require('./servicios/bancaServicio');
const { crearControladorCliente } = require('./controladores/clienteControlador');
const { crearRutasCliente } = require('./rutas/clienteRutas');
const { crearVerificadorSesion } = require('./intermediarios/verificarSesion');
const { verificarRol } = require('./intermediarios/verificarRol');
const { manejarErrores } = require('./intermediarios/manejarErrores');

const carpetaFrontend = ruta.resolve(__dirname, '../../frontend');

function obtenerOrigen(entorno = process.env) {
  const origen = new URL(entorno.ORIGEN_APP || `http://127.0.0.1:${entorno.PUERTO ?? '3000'}`);
  const esHttps = origen.protocol === 'https:';
  const esHttpLocal = origen.protocol === 'http:' &&
    ['127.0.0.1', 'localhost', '[::1]'].includes(origen.hostname) && entorno.NODE_ENV !== 'production';
  if ((!esHttps && !esHttpLocal) || origen.username || origen.password ||
      origen.pathname !== '/' || origen.search || origen.hash) {
    throw new Error('Configura ORIGEN_APP como un origen HTTPS o HTTP local de desarrollo.');
  }
  return origen.origin;
}

function crearAplicacion(verificarMySql, {
  conexiones = crearGrupoConexiones(),
  origen = obtenerOrigen()
} = {}) {
  const aplicacion = express();
  const consultarSalud = crearServicioSalud(crearModeloSalud(verificarMySql ?? verificarConexion(conexiones)));
  const autenticacion = crearServicioAutenticacion(conexiones);
  const segura = origen.startsWith('https://');
  const nombreCookie = segura ? '__Host-sesion_web' : 'sesion_web';
  const cookie = { httpOnly: true, secure: segura, sameSite: 'strict', path: '/' };
  const verificarSesion = crearVerificadorSesion(autenticacion, nombreCookie, cookie);
  const verificarSesionDePagina = crearVerificadorSesion(autenticacion, nombreCookie, cookie, true);
  const controlador = crearControladorAutenticacion(autenticacion, nombreCookie, cookie);

  aplicacion.disable('x-powered-by');
  aplicacion.use((peticion, respuesta, siguiente) => {
    respuesta.set({
      'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      'X-Content-Type-Options': 'nosniff'
    });
    siguiente();
  });

  function evitarCache(peticion, respuesta, siguiente) {
    respuesta.set('Cache-Control', 'no-store');
    siguiente();
  }

  aplicacion.use('/api', evitarCache);
  aplicacion.use('/api', crearRutasSalud(crearControladorSalud(consultarSalud)));
  aplicacion.use('/api/auth', leerCookies(), crearRutasAutenticacion(controlador, verificarSesion, origen));
  const admin = crearControladorAdmin(crearServicioAdmin(conexiones));
  aplicacion.use('/api/admin', leerCookies(), crearRutasAdmin(admin, verificarSesion, origen));
  const cliente = crearControladorCliente(crearServicioBanca(conexiones), nombreCookie, cookie);
  aplicacion.use('/api/banca', leerCookies(), crearRutasCliente(cliente, verificarSesion, origen));

  function servirArchivo(...segmentos) {
    const archivo = ruta.join(carpetaFrontend, ...segmentos);
    return (peticion, respuesta) => respuesta.sendFile(archivo);
  }

  aplicacion.get(['/', '/index.html'], servirArchivo('index.html'));
  aplicacion.get('/inicio-sesion', servirArchivo('paginas', 'inicioSesion.html'));
  aplicacion.get('/panel-administrador', evitarCache, leerCookies(), verificarSesionDePagina,
    verificarRol('ADMIN'), servirArchivo('paginas', 'panelAdministrador.html'));
  aplicacion.get('/banca-virtual', evitarCache, leerCookies(), verificarSesionDePagina,
    verificarRol('CLIENTE'), servirArchivo('paginas', 'bancaVirtual.html'));
  aplicacion.get('/css/bootstrap.min.css', (peticion, respuesta) => {
    respuesta.sendFile(require.resolve('bootstrap/dist/css/bootstrap.min.css'));
  });
  aplicacion.use('/css', express.static(ruta.join(carpetaFrontend, 'css'), { index: false }));
  aplicacion.use('/js', express.static(ruta.join(carpetaFrontend, 'js'), { index: false }));
  aplicacion.use((peticion, respuesta) => {
    respuesta.status(404).json({ exito: false, mensaje: 'Ruta no encontrada.', datos: null });
  });
  aplicacion.use(manejarErrores);

  return aplicacion;
}

if (require.main === module) {
  dotenv.config({ path: ruta.resolve(__dirname, '../.env'), quiet: true });
  const puerto = Number(process.env.PUERTO ?? '3000');

  if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) {
    console.error('PUERTO debe ser un entero entre 1 y 65535.');
    process.exitCode = 1;
  } else {
    try {
      const origen = obtenerOrigen();
      const direccion = '127.0.0.1';
      const servidor = crearAplicacion(undefined, { origen }).listen(puerto, direccion, () => {
        console.log(`Simulador disponible en ${origen}`);
      });
      servidor.on('error', () => {
        console.error('No se pudo iniciar el servidor. Verifica que el puerto esté libre.');
        process.exitCode = 1;
      });
    } catch {
      console.error('Configura ORIGEN_APP como un origen HTTPS o HTTP local de desarrollo.');
      process.exitCode = 1;
    }
  }
}

module.exports = { crearAplicacion, obtenerOrigen };
