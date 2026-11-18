const { test } = require('node:test');
const afirmar = require('node:assert/strict');
const { createServer } = require('node:net');
const { once } = require('node:events');
const { crearAplicacion } = require('../src/app');
const { crearVerificadorMySql } = require('../src/baseDatos');

async function iniciarAplicacion(contexto, verificarMySql) {
  const servidor = crearAplicacion(verificarMySql).listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  contexto.after(() => new Promise((resolver) => servidor.close(resolver)));
  return `http://127.0.0.1:${servidor.address().port}`;
}

test('responde 200 cuando ambas comprobaciones tienen éxito', async (contexto) => {
  const origen = await iniciarAplicacion(contexto, async () => true);
  const respuesta = await fetch(`${origen}/api/salud`);
  afirmar.equal(respuesta.status, 200);
  afirmar.equal(respuesta.headers.get('cache-control'), 'no-store');
  afirmar.deepEqual(await respuesta.json(), {
    exito: true,
    mensaje: 'Servidor y MySQL disponibles.',
    datos: { servidor: 'disponible', baseDatos: 'disponible' }
  });
});

test('responde 503 cuando el cliente MySQL pierde la conexión', async (contexto) => {
  const simuladorTcp = createServer((conexion) => conexion.destroy());
  simuladorTcp.listen(0, '127.0.0.1');
  await once(simuladorTcp, 'listening');
  contexto.after(() => new Promise((resolver) => simuladorTcp.close(resolver)));

  const origen = await iniciarAplicacion(contexto, crearVerificadorMySql({
    MYSQL_PUERTO: String(simuladorTcp.address().port),
    MYSQL_BASE: 'prueba',
    MYSQL_USUARIO: 'usuario_ficticio',
    MYSQL_CONTRASENA: 'valor_ficticio'
  }));
  const respuesta = await fetch(`${origen}/api/salud`);
  afirmar.equal(respuesta.status, 503);
  afirmar.deepEqual(await respuesta.json(), {
    exito: false,
    mensaje: 'Servidor disponible. MySQL no disponible.',
    datos: { servidor: 'disponible', baseDatos: 'no_disponible' }
  });
});

test('responde 503 con la configuración de MySQL incompleta', async (contexto) => {
  const origen = await iniciarAplicacion(contexto, crearVerificadorMySql({}));
  const respuesta = await fetch(`${origen}/api/salud`);
  afirmar.equal(respuesta.status, 503);
  afirmar.equal((await respuesta.json()).datos.servidor, 'disponible');
});

test('publica la página y sus recursos y devuelve 404 para rutas privadas o inexistentes', async (contexto) => {
  const origen = await iniciarAplicacion(contexto, async () => true);
  const portada = await fetch(origen);
  afirmar.equal(portada.status, 200);
  afirmar.match(await portada.text(), /Simulador Bancario Web/);
  for (const recurso of ['/css/bootstrap.min.css', '/css/estilos.css', '/js/api.js']) {
    const respuesta = await fetch(origen + recurso);
    afirmar.equal(respuesta.status, 200);
    await respuesta.arrayBuffer();
  }
  for (const recurso of ['/api/inexistente', '/.env', '/backend/.env.example', '/AGENTS.md']) {
    const respuesta = await fetch(origen + recurso);
    afirmar.equal(respuesta.status, 404);
    afirmar.deepEqual(await respuesta.json(), {
      exito: false, mensaje: 'Ruta no encontrada.', datos: null
    });
  }
});

test('oculta detalles internos en los errores 500', async (contexto) => {
  const origen = await iniciarAplicacion(contexto, async () => {
    throw new Error('Detalle interno ficticio');
  });
  const respuesta = await fetch(`${origen}/api/salud`);
  afirmar.equal(respuesta.status, 500);
  afirmar.deepEqual(await respuesta.json(), {
    exito: false, mensaje: 'Ocurrió un error interno.', datos: null
  });
});
