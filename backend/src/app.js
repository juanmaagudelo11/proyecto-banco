const ruta = require('node:path');
const express = require('express');
const dotenv = require('dotenv');
const { crearVerificadorMySql } = require('./baseDatos');
const { crearModeloSalud } = require('./modelos/salud');
const { crearServicioSalud } = require('./servicios/saludServicio');
const { crearControladorSalud } = require('./controladores/saludControlador');
const { crearRutasSalud } = require('./rutas/saludRutas');
const { manejarErrores } = require('./intermediarios/manejarErrores');

function crearAplicacion(verificarMySql = crearVerificadorMySql()) {
  const aplicacion = express();
  const consultarSalud = crearServicioSalud(crearModeloSalud(verificarMySql));

  aplicacion.disable('x-powered-by');
  aplicacion.use('/api', (peticion, respuesta, siguiente) => {
    respuesta.set('Cache-Control', 'no-store');
    siguiente();
  });
  aplicacion.use('/api', crearRutasSalud(crearControladorSalud(consultarSalud)));

  aplicacion.get('/css/bootstrap.min.css', (peticion, respuesta) => {
    respuesta.sendFile(require.resolve('bootstrap/dist/css/bootstrap.min.css'));
  });
  aplicacion.use(express.static(ruta.resolve(__dirname, '../../frontend')));
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
    const direccion = '127.0.0.1';
    const servidor = crearAplicacion().listen(puerto, direccion, () => {
      console.log(`Simulador disponible en http://${direccion}:${puerto}`);
    });
    servidor.on('error', () => {
      console.error('No se pudo iniciar el servidor. Verifica que el puerto esté libre.');
      process.exitCode = 1;
    });
  }
}

module.exports = { crearAplicacion };
