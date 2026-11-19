const { test } = require('node:test');
const afirmar = require('node:assert/strict');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const { readFile } = require('node:fs/promises');
const { createServer } = require('node:http');
const { once } = require('node:events');
const ruta = require('node:path');
const mysql = require('mysql2/promise');
const { crearAplicacion } = require('../src/app');
const { generarSqlConSemillas } = require('../herramientas/generarSemillas');

async function iniciarApi(contexto, conexiones, origenConfigurado) {
  const servidor = createServer().listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  const url = `http://127.0.0.1:${servidor.address().port}`;
  const origen = origenConfigurado ?? url;
  servidor.on('request', crearAplicacion(undefined, { conexiones, origen }));
  contexto.after(() => new Promise((resolver) => servidor.close(resolver)));
  return async function pedir(ruta, { metodo = 'GET', cuerpo, cookie, clave, tipo = 'application/json',
    origenPeticion = origen, ip } = {}) {
    const headers = { Origin: origenPeticion };
    if (cookie) headers.Cookie = cookie;
    if (clave) headers['Idempotency-Key'] = clave;
    if (ip) headers['X-Forwarded-For'] = ip;
    if (cuerpo !== undefined) headers['Content-Type'] = tipo;
    const body = typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo);
    const respuesta = await fetch(url + ruta, { method: metodo, headers, body, redirect: 'manual' });
    const cabecera = respuesta.headers.get('set-cookie');
    return {
      estado: respuesta.status, cabecera, cookie: cabecera?.split(';')[0],
      reintento: respuesta.headers.get('retry-after'), ...await respuesta.json()
    };
  };
}

function huella(cookie) {
  return createHash('sha256').update(cookie.slice(cookie.indexOf('=') + 1)).digest();
}

test('cajero ATM con una base SQL aislada', async (contexto) => {
  const { MYSQL_PRUEBA_BASE: base, MYSQL_PRUEBA_PUERTO: puerto = '3306',
    MYSQL_PRUEBA_USUARIO: usuario, MYSQL_PRUEBA_CONTRASENA: contrasena } = process.env;
  afirmar.match(base ?? '', /^simulador_fase6_prueba(?:_[a-z0-9]+)*$/);
  afirmar.ok(usuario && contrasena, 'Configura la cuenta SQL de prueba.');
  const conexion = mysql.createPool({
    host: '127.0.0.1', port: Number(puerto), database: base, user: usuario, password: contrasena,
    multipleStatements: true
  });
  contexto.after(() => conexion.end());
  const [[{ total }]] = await conexion.execute(
    'SELECT COUNT(*) AS total FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()'
  );
  afirmar.equal(total, 0, 'La base de prueba debe estar vacía.');
  const clave = () => randomBytes(20).toString('hex');
  const semillas = {
    ADMIN: clave(), CLIENTE_1: clave(), CLIENTE_2: clave(), CLIENTE_3: clave(),
    PIN_1: String(7).padStart(4, '0'), PIN_2: String(17).padStart(4, '0'), PIN_3: String(27).padStart(4, '0')
  };
  const raiz = ruta.resolve(__dirname, '../..');
  await conexion.query(await generarSqlConSemillas(await readFile(ruta.join(raiz, 'database.sql'), 'utf8'), semillas));
  await conexion.query(await readFile(ruta.join(raiz, 'migraciones/003_sesiones_web.sql'), 'utf8'));
  const migracion = await readFile(ruta.join(raiz, 'migraciones/006_atm.sql'), 'utf8');
  await conexion.query(migracion);
  await conexion.query(migracion);

  const pedir = await iniciarApi(contexto, conexion);
  const admin = await pedir('/api/auth/login', { metodo: 'POST',
    cuerpo: { identificador: 'admin@example.test', contrasena: semillas.ADMIN } });
  const web = await pedir('/api/auth/login', { metodo: 'POST',
    cuerpo: { identificador: 'DEMO-002', contrasena: semillas.CLIENTE_1 } });
  afirmar.deepEqual([admin.estado, web.estado], [200, 200]);
  const entrar = (numeroCuenta = '9000000001', pin = semillas.PIN_1, mas = {}) =>
    pedir('/api/atm/login', { metodo: 'POST', cuerpo: { numeroCuenta, pin }, ...mas });
  let cookie;
  function retirar(monto, identificador, sesion = cookie) {
    return pedir('/api/atm/retirar', { metodo: 'POST', cookie: sesion, clave: identificador, cuerpo: { monto } });
  }
  async function foto() {
    const [[fila]] = await conexion.execute(`
      SELECT (SELECT COUNT(*) FROM movimientos) AS movimientos,
             (SELECT COUNT(*) FROM retiros_atm) AS solicitudes,
             (SELECT saldo FROM cuentas WHERE id_cuenta = 1) AS saldo,
             (SELECT saldo FROM cuentas WHERE id_cuenta = 2) AS saldoAjeno
    `);
    return fila;
  }

  await contexto.test('autentica con PIN de texto y mantiene separadas las sesiones', async () => {
    const fallo = await entrar('9000000001', semillas.PIN_2);
    const desconocida = await entrar('0000000000', semillas.PIN_1);
    afirmar.equal(fallo.estado, 401);
    afirmar.equal(desconocida.estado, 401);
    afirmar.equal(fallo.mensaje, desconocida.mensaje);
    afirmar.equal(fallo.cabecera, null);
    afirmar.equal((await entrar('9000000001', Number(semillas.PIN_1))).estado, 400);
    afirmar.equal((await entrar('9000000003', semillas.PIN_3)).estado, 403);
    afirmar.equal((await entrar('9000000001', semillas.PIN_1,
      { origenPeticion: 'https://ajeno.example.test' })).estado, 403);

    const correcto = await entrar(9000000001);
    afirmar.equal(correcto.estado, 200);
    afirmar.equal(correcto.datos.numeroCuenta, '9000000001');
    afirmar.equal(correcto.datos.saldo, '850.00');
    afirmar.equal(correcto.datos.segundosRestantes, 300);
    afirmar.ok(correcto.cabecera.includes('Path=/api/atm') && correcto.cabecera.includes('HttpOnly') &&
      correcto.cabecera.includes('SameSite=Strict') && correcto.cabecera.includes('Max-Age=300'));
    const serializado = JSON.stringify(correcto.datos);
    afirmar.ok(!serializado.includes('"pin') && !serializado.includes('token'));
    cookie = correcto.cookie;
    afirmar.equal((await pedir('/api/auth/sesion', { cookie })).estado, 401);
    afirmar.equal((await pedir('/api/banca/cuenta', { cookie })).estado, 401);
    afirmar.equal((await pedir('/api/atm/saldo', { cookie: web.cookie })).estado, 401);
    afirmar.equal((await pedir('/api/atm/movimientos', { cookie: admin.cookie })).estado, 401);
    afirmar.equal((await retirar('1.00', undefined, web.cookie)).estado, 401);
    afirmar.equal((await pedir('/api/atm/saldo?numeroCuenta=9000000002', { cookie })).datos.numeroCuenta, '9000000001');
    const historial = await pedir('/api/atm/movimientos?idCuenta=2', { cookie });
    afirmar.equal(historial.estado, 200);
    afirmar.deepEqual(historial.datos.elementos.map((movimiento) => movimiento.tipoMovimiento),
      ['TRANSFERENCIA_ENVIADA', 'CONSIGNACION']);
  });

  await contexto.test('rechaza importes inválidos, selección ajena y solicitudes de origen distinto', async () => {
    const antes = await foto();
    for (const monto of ['0.00', '-1.00', '0.111', '10000000000000.00']) afirmar.equal((await retirar(monto)).estado, 400);
    afirmar.equal((await retirar('851.00')).estado, 409);
    afirmar.equal((await retirar('1.00', 'invalida')).estado, 400);
    afirmar.equal((await pedir('/api/atm/retirar', {
      metodo: 'POST', cookie, cuerpo: '{"monto":0.0100000000000000001}'
    })).estado, 400);
    afirmar.equal((await pedir('/api/atm/retirar', {
      metodo: 'POST', cookie, cuerpo: { monto: '1.00', idCuenta: 2 }
    })).estado, 400);
    afirmar.equal((await pedir('/api/atm/retirar', {
      metodo: 'POST', cookie, cuerpo: { monto: '1.00' }, origenPeticion: 'https://ajeno.example.test'
    })).estado, 403);
    afirmar.deepEqual(await foto(), antes);
  });

  await contexto.test('el retiro repetido registra un solo movimiento y actualiza banca y administración', async () => {
    const antes = await foto();
    const identificador = randomUUID();
    const respuestas = await Promise.all([retirar(50.25, identificador), retirar('50.25', identificador)]);
    afirmar.deepEqual(respuestas.map((respuesta) => respuesta.estado).sort(), [200, 201]);
    afirmar.deepEqual(respuestas[0].datos, respuestas[1].datos);
    afirmar.equal(respuestas[0].datos.saldoResultante, '799.75');
    afirmar.equal((await retirar('50.26', identificador)).estado, 409);
    const despues = await foto();
    afirmar.equal(despues.movimientos, antes.movimientos + 1);
    afirmar.equal(despues.solicitudes, antes.solicitudes + 1);
    afirmar.equal(despues.saldoAjeno, antes.saldoAjeno);

    const [[movimiento]] = await conexion.execute(
      'SELECT id_cuenta, monto, saldo_anterior, saldo_resultante FROM movimientos WHERE id_movimiento = ?',
      [respuestas[0].datos.idMovimiento]
    );
    afirmar.deepEqual(movimiento, { id_cuenta: 1, monto: '50.25', saldo_anterior: '850.00', saldo_resultante: '799.75' });
    afirmar.equal((await pedir('/api/atm/saldo', { cookie })).datos.saldo, '799.75');
    afirmar.equal((await pedir('/api/banca/cuenta', { cookie: web.cookie })).datos.saldo, '799.75');
    const global = await pedir('/api/admin/movimientos?numeroCuenta=9000000001&tipo=RETIRO', { cookie: admin.cookie });
    afirmar.equal(global.datos.elementos.length, 1);
    afirmar.equal(global.datos.elementos[0].saldoResultante, '799.75');
    afirmar.equal((await pedir('/api/admin/metricas', { cookie: admin.cookie })).datos.saldoGlobal, '1274.75');
  });

  await contexto.test('revalida estado y sesión al bloquear, expirar o expulsar', async () => {
    const antes = await foto();
    try {
      await conexion.execute("UPDATE cuentas SET estado = 'BLOQUEADO' WHERE id_cuenta = 1");
      afirmar.equal((await retirar('1.00')).estado, 403);
      afirmar.equal((await pedir('/api/atm/saldo', { cookie })).estado, 401);
      await conexion.execute("UPDATE cuentas SET estado = 'ACTIVO' WHERE id_cuenta = 1");
      const nuevamente = await entrar();
      afirmar.equal(nuevamente.estado, 200);
      cookie = nuevamente.cookie;
      await conexion.execute("UPDATE usuarios SET estado = 'INACTIVO' WHERE id_usuario = 2");
      afirmar.equal((await pedir('/api/atm/movimientos', { cookie })).estado, 403);
      afirmar.equal((await entrar()).estado, 403);
    } finally {
      await conexion.execute("UPDATE cuentas SET estado = 'ACTIVO' WHERE id_cuenta = 1");
      await conexion.execute("UPDATE usuarios SET estado = 'ACTIVO' WHERE id_usuario = 2");
    }
    cookie = (await entrar()).cookie;
    await conexion.execute("UPDATE sesiones_atm SET expira_en = '2000-01-01' WHERE huella = ?", [huella(cookie)]);
    afirmar.equal((await pedir('/api/atm/saldo', { cookie })).estado, 401);
    cookie = (await entrar()).cookie;
    afirmar.equal((await pedir('/api/atm/logout', {
      metodo: 'POST', cookie, origenPeticion: 'https://ajeno.example.test'
    })).estado, 403);
    afirmar.equal((await pedir('/api/atm/saldo', { cookie })).estado, 200);
    const salida = await pedir('/api/atm/logout', { metodo: 'POST', cookie });
    afirmar.equal(salida.estado, 200);
    afirmar.ok(salida.cabecera.includes('Expires=') && salida.cabecera.includes('Path=/api/atm'));
    afirmar.equal((await pedir('/api/atm/saldo', { cookie })).estado, 401);
    afirmar.equal((await retirar('1.00')).estado, 401);
    afirmar.equal((await pedir('/api/auth/sesion', { cookie: web.cookie })).estado, 200);
    afirmar.deepEqual(await foto(), antes);
    cookie = (await entrar()).cookie;
  });

  await contexto.test('limita intentos por cuenta y por IP y configura cookie segura en HTTPS', async (caso) => {
    const limite = await iniciarApi(caso, conexion, 'https://simulador.example.test');
    const simular = (numeroCuenta, pin, ip) =>
      limite('/api/atm/login', { metodo: 'POST', cuerpo: { numeroCuenta, pin }, ip });

    const segura = await simular('9000000002', semillas.PIN_2);
    afirmar.equal(segura.estado, 200);
    afirmar.ok(segura.cabecera.startsWith('__Secure-sesion_atm=') && segura.cabecera.includes('; Secure'));
    for (let indice = 0; indice < 5; indice++) {
      afirmar.equal((await simular('9000000001', semillas.PIN_2, '192.0.2.' + indice)).estado, 401);
    }
    const bloqueada = await simular('9000000001', semillas.PIN_1);
    afirmar.equal(bloqueada.estado, 429);
    afirmar.ok(Number(bloqueada.reintento) > 0);
    const otroLimite = await iniciarApi(caso, conexion);
    for (let indice = 0; indice < 20; indice++) {
      afirmar.equal((await otroLimite('/api/atm/login', {
        metodo: 'POST', cuerpo: {}, ip: '192.0.2.' + indice
      })).estado, 400);
    }
    afirmar.equal((await otroLimite('/api/atm/login', {
      metodo: 'POST', cuerpo: { numeroCuenta: '9000000001', pin: semillas.PIN_1 }, ip: '192.0.2.99'
    })).estado, 429);
  });

  await contexto.test('dos retiros distintos conservan saldo y el historial se limita a los últimos cinco', async () => {
    const antes = await foto();
    const simultaneos = await Promise.all([retirar('500.00', randomUUID()), retirar('500.00', randomUUID())]);
    afirmar.deepEqual(simultaneos.map((respuesta) => respuesta.estado).sort(), [201, 409]);
    afirmar.equal((await foto()).saldo, '299.75');
    afirmar.equal((await foto()).movimientos, antes.movimientos + 1);
    for (let indice = 0; indice < 4; indice++) afirmar.equal((await retirar('0.25', randomUUID())).estado, 201);
    const historial = await pedir('/api/atm/movimientos', { cookie });
    afirmar.equal(historial.datos.elementos.length, 5);
    afirmar.ok(historial.datos.elementos.every((fila) => fila.tipoMovimiento === 'RETIRO'));
    afirmar.equal(historial.datos.elementos[0].saldoResultante, '298.75');
  });

  await contexto.test('un fallo intermedio revierte el débito y el comprobante', async () => {
    const antes = await foto();
    await conexion.query(`
      CREATE TRIGGER fallo_retiro_atm_prueba BEFORE INSERT ON retiros_atm FOR EACH ROW
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Marcador privado de prueba'
    `);
    const resultado = await retirar('1.25', randomUUID());
    afirmar.equal(resultado.estado, 500);
    afirmar.equal(resultado.mensaje, 'Ocurrió un error interno.');
    afirmar.deepEqual(await foto(), antes);
  });
});
