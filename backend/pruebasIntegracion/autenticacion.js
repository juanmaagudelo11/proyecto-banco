const { test } = require('node:test');
const afirmar = require('node:assert/strict');
const { randomBytes, createHash } = require('node:crypto');
const { readFile } = require('node:fs/promises');
const { createServer } = require('node:http');
const { once } = require('node:events');
const ruta = require('node:path');
const mysql = require('mysql2/promise');
const { crearAplicacion, obtenerOrigen } = require('../src/app');
const { generarSqlConSemillas } = require('../herramientas/generarSemillas');

async function iniciarApi(contexto, conexiones, origenConfigurado) {
  const servidor = createServer().listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  const url = `http://127.0.0.1:${servidor.address().port}`;
  const origen = origenConfigurado ?? url;
  servidor.on('request', crearAplicacion(undefined, { conexiones, origen }));
  contexto.after(() => new Promise((resolver) => servidor.close(resolver)));

  function pedir(ruta, { metodo = 'GET', cookie, cuerpo, origenPeticion = origen, tipo = 'application/json', ipReenviada } = {}) {
    const headers = {};
    if (metodo === 'POST' && origenPeticion) headers.Origin = origenPeticion;
    if (cookie) headers.Cookie = cookie;
    if (ipReenviada) headers['X-Forwarded-For'] = ipReenviada;
    if (cuerpo !== undefined) headers['Content-Type'] = tipo;
    return fetch(url + ruta, { method: metodo, headers, body: cuerpo, redirect: 'manual' });
  }

  return pedir;
}

function entrar(pedir, campo, identificador, contrasena, opciones = {}) {
  return pedir('/api/auth/login', {
    metodo: 'POST', cuerpo: JSON.stringify({
      [campo]: identificador, contrasena, rol: 'ADMIN', idUsuario: 1
    }), ...opciones
  });
}

function cookieDe(respuesta) {
  const cabecera = respuesta.headers.get('set-cookie');
  afirmar.ok(cabecera, 'Se esperaba una cookie de sesión');
  return cabecera.split(';', 1)[0];
}

test('autenticación web con una base SQL de prueba', async (contexto) => {
  const {
    MYSQL_PRUEBA_BASE: base,
    MYSQL_PRUEBA_PUERTO: puerto = '3306',
    MYSQL_PRUEBA_USUARIO: usuario,
    MYSQL_PRUEBA_CONTRASENA: contrasena
  } = process.env;

  afirmar.match(base ?? '', /^simulador_fase3_prueba(?:_[a-z0-9]+)*$/,
    'Usa una base vacía exclusiva para las pruebas de la fase 3.');
  afirmar.ok(usuario && contrasena, 'Configura el usuario y la contraseña de la base de prueba.');

  const conexiones = mysql.createPool({
    host: '127.0.0.1', port: Number(puerto), database: base, user: usuario, password: contrasena,
    multipleStatements: true
  });
  contexto.after(() => conexiones.end());
  const [[{ total }]] = await conexiones.execute(
    'SELECT COUNT(*) AS total FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()'
  );
  afirmar.equal(total, 0, 'La base debe estar vacía antes de importar.');

  const credenciales = Object.fromEntries(
    ['ADMIN', 'CLIENTE_1', 'CLIENTE_2', 'CLIENTE_3'].map((campo) => [campo, randomBytes(24).toString('hex')])
  );
  for (let indice = 1; indice <= 3; indice++) {
    credenciales[`PIN_${indice}`] = String(indice).padStart(4, '0');
  }

  const raiz = ruta.resolve(__dirname, '../..');
  const esquema = await readFile(ruta.join(raiz, 'database.sql'), 'utf8');
  const migracion = await readFile(ruta.join(raiz, 'migraciones/003_sesiones_web.sql'), 'utf8');
  await conexiones.query(await generarSqlConSemillas(esquema, credenciales));
  await conexiones.query(migracion);
  await conexiones.query(migracion);

  await contexto.test('anonimato, archivos protegidos y acceso por correo o documento según el rol', async (caso) => {
    const pedir = await iniciarApi(caso, conexiones);
    const anonima = await pedir('/banca-virtual');
    afirmar.equal(anonima.status, 302);
    afirmar.equal(anonima.headers.get('location'), '/inicio-sesion');
    afirmar.equal((await pedir('/api/auth/sesion')).status, 401);
    afirmar.equal((await pedir('/paginas/panel%41dministrador.html')).status, 404);
    afirmar.equal((await pedir('/paginas/bancaVirtual.html')).status, 404);

    const admin = await entrar(pedir, 'correo', 'admin@example.test', credenciales.ADMIN);
    afirmar.equal(admin.status, 200);
    const datosAdmin = await admin.json();
    afirmar.deepEqual(Object.keys(datosAdmin.datos).sort(), ['idUsuario', 'nombre', 'rol']);
    afirmar.equal(datosAdmin.datos.rol, 'ADMIN');
    afirmar.equal(datosAdmin.datos.idUsuario, 1);
    const cabecera = admin.headers.get('set-cookie');
    afirmar.ok(cabecera.includes('HttpOnly') && cabecera.includes('SameSite=Strict'));
    afirmar.ok(cabecera.includes('Max-Age=1800') && !cabecera.includes('; Secure'));
    const sesionAdmin = cookieDe(admin);
    afirmar.equal((await pedir('/panel-administrador', { cookie: sesionAdmin })).status, 200);
    afirmar.equal((await pedir('/banca-virtual', { cookie: sesionAdmin })).status, 403);

    const cliente = await entrar(pedir, 'identificador', 'DEMO-002', credenciales.CLIENTE_1);
    afirmar.equal(cliente.status, 200);
    afirmar.equal((await cliente.json()).datos.rol, 'CLIENTE');
    const sesionCliente = cookieDe(cliente);
    const sesion = await pedir('/api/auth/sesion?idUsuario=3', { cookie: sesionCliente });
    afirmar.equal(sesion.status, 200);
    afirmar.equal((await sesion.json()).datos.idUsuario, 2);
    afirmar.equal((await pedir('/banca-virtual', { cookie: sesionCliente })).status, 200);
    afirmar.equal((await pedir('/panel-administrador', { cookie: sesionCliente })).status, 403);
  });

  await contexto.test('rechaza credenciales, cuerpos inválidos y usuarios o cuentas no activos', async (caso) => {
    const pedir = await iniciarApi(caso, conexiones);
    const noExiste = await entrar(pedir, 'correo', 'ausente@example.test', credenciales.ADMIN);
    const claveIncorrecta = await entrar(pedir, 'correo', 'admin@example.test', credenciales.CLIENTE_1);
    afirmar.equal(noExiste.status, 401);
    afirmar.equal(claveIncorrecta.status, 401);
    afirmar.deepEqual(await noExiste.json(), await claveIncorrecta.json());
    afirmar.equal(noExiste.headers.get('set-cookie'), null);
    afirmar.equal((await pedir('/api/auth/login', { metodo: 'POST', cuerpo: '{"' })).status, 400);
    afirmar.equal((await pedir('/api/auth/login', { metodo: 'POST', cuerpo: '{}' })).status, 400);
    const bloqueado = await entrar(pedir, 'documento', 'DEMO-004', credenciales.CLIENTE_3);
    afirmar.equal(bloqueado.status, 403);
    afirmar.equal(bloqueado.headers.get('set-cookie'), null);

    const cliente = await entrar(pedir, 'correo', 'cliente1@example.test', credenciales.CLIENTE_1);
    const cookieCliente = cookieDe(cliente);
    try {
      await conexiones.execute("UPDATE cuentas SET estado = 'INACTIVO' WHERE id_usuario = ?", [2]);
      afirmar.equal((await pedir('/api/auth/sesion', { cookie: cookieCliente })).status, 403);
      afirmar.equal((await entrar(pedir, 'documento', 'DEMO-002', credenciales.CLIENTE_1)).status, 403);
      await conexiones.execute("UPDATE usuarios SET estado = 'INACTIVO' WHERE id_usuario = ?", [3]);
      afirmar.equal((await entrar(pedir, 'documento', 'DEMO-003', credenciales.CLIENTE_2)).status, 403);
    } finally {
      await conexiones.execute("UPDATE cuentas SET estado = 'ACTIVO' WHERE id_usuario = ?", [2]);
      await conexiones.execute("UPDATE usuarios SET estado = 'ACTIVO' WHERE id_usuario = ?", [3]);
    }
    afirmar.equal((await pedir('/api/auth/sesion', { cookie: cookieCliente })).status, 401);
  });

  await contexto.test('comprueba origen, rota la sesión, expira y revoca en el servidor', async (caso) => {
    const pedir = await iniciarApi(caso, conexiones);
    const noAutorizado = await entrar(pedir, 'correo', 'admin@example.test', credenciales.ADMIN, {
      origenPeticion: 'https://externo.example.test'
    });
    afirmar.equal(noAutorizado.status, 403);
    const sinOrigen = await entrar(pedir, 'correo', 'admin@example.test', credenciales.ADMIN, { origenPeticion: null });
    afirmar.equal(sinOrigen.status, 403);

    const previa = cookieDe(await entrar(pedir, 'correo', 'admin@example.test', credenciales.ADMIN));
    const nueva = cookieDe(await entrar(pedir, 'correo', 'admin@example.test', credenciales.ADMIN, { cookie: previa }));
    afirmar.ok(previa !== nueva);
    afirmar.equal((await pedir('/api/auth/sesion', { cookie: previa })).status, 401);
    afirmar.equal((await pedir('/api/auth/logout', {
      metodo: 'POST', cookie: nueva, origenPeticion: 'https://externo.example.test'
    })).status, 403);
    afirmar.equal((await pedir('/api/auth/sesion', { cookie: nueva })).status, 200);
    const salida = await pedir('/api/auth/logout', { metodo: 'POST', cookie: nueva });
    afirmar.equal(salida.status, 200);
    afirmar.ok(salida.headers.get('set-cookie').includes('Expires='));
    afirmar.equal((await pedir('/api/auth/sesion', { cookie: nueva })).status, 401);
    afirmar.equal((await pedir('/panel-administrador', { cookie: nueva })).status, 302);

    const vigente = cookieDe(await entrar(pedir, 'correo', 'admin@example.test', credenciales.ADMIN));
    const token = vigente.slice(vigente.indexOf('=') + 1);
    const huella = createHash('sha256').update(token).digest();
    const [[{ total }]] = await conexiones.execute('SELECT COUNT(*) AS total FROM sesiones_web WHERE huella = ?', [huella]);
    afirmar.equal(total, 1);
    await conexiones.execute("UPDATE sesiones_web SET expira_en = '2000-01-01 00:00:00' WHERE huella = ?", [huella]);
    afirmar.equal((await pedir('/api/auth/sesion', { cookie: vigente })).status, 401);
  });

  await contexto.test('exige HTTPS en producción y marca Secure al configurar un origen HTTPS', async (caso) => {
    afirmar.throws(() => obtenerOrigen({ NODE_ENV: 'production', ORIGEN_APP: 'http://127.0.0.1:3000' }));
    const origen = obtenerOrigen({ NODE_ENV: 'production', ORIGEN_APP: 'https://simulador.example.test' });
    const pedir = await iniciarApi(caso, conexiones, origen);
    const respuesta = await entrar(pedir, 'correo', 'admin@example.test', credenciales.ADMIN);
    afirmar.equal(respuesta.status, 200);
    const cabecera = respuesta.headers.get('set-cookie');
    afirmar.ok(cabecera.startsWith('__Host-sesion_web=') && cabecera.includes('; Secure'));
    afirmar.ok(cabecera.includes('HttpOnly') && cabecera.includes('Path=/') && !cabecera.includes('Domain='));
  });

  await contexto.test('limita intentos desde una IP aunque cambie la cabecera reenviada', async (caso) => {
    const origen = 'http://127.0.0.1:3000';
    const pedir = await iniciarApi(caso, conexiones, origen);
    for (let indice = 0; indice < 10; indice++) {
      const respuesta = await pedir('/api/auth/login', { metodo: 'POST', cuerpo: '{}', ipReenviada: '192.0.2.' + (indice + 1) });
      afirmar.equal(respuesta.status, 400);
    }
    const respuesta = await entrar(pedir, 'correo', 'admin@example.test', credenciales.ADMIN, { ipReenviada: '192.0.2.99' });
    afirmar.equal(respuesta.status, 429);
    afirmar.ok(Number(respuesta.headers.get('retry-after')) > 0);
  });
});
