const { test } = require('node:test');
const afirmar = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { readFile } = require('node:fs/promises');
const { createServer } = require('node:http');
const { once } = require('node:events');
const ruta = require('node:path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const { crearAplicacion } = require('../src/app');
const { generarSqlConSemillas } = require('../herramientas/generarSemillas');

test('administración sobre una base SQL aislada', async (contexto) => {
  const {
    MYSQL_PRUEBA_BASE: base,
    MYSQL_PRUEBA_PUERTO: puerto = '3306',
    MYSQL_PRUEBA_USUARIO: usuario,
    MYSQL_PRUEBA_CONTRASENA: contrasena
  } = process.env;
  afirmar.match(base ?? '', /^simulador_fase4_prueba(?:_[a-z0-9]+)*$/);
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
  const credenciales = {
    ADMIN: clave(), CLIENTE_1: clave(), CLIENTE_2: clave(), CLIENTE_3: clave(),
    PIN_1: String(7).padStart(4, '0'), PIN_2: String(17).padStart(4, '0'), PIN_3: String(27).padStart(4, '0')
  };
  const esquema = await readFile(ruta.resolve(__dirname, '../../database.sql'), 'utf8');
  const migracion = await readFile(ruta.resolve(__dirname, '../../migraciones/003_sesiones_web.sql'), 'utf8');
  await conexion.query(await generarSqlConSemillas(esquema, credenciales));
  await conexion.query(migracion);

  const servidor = createServer().listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  const origen = `http://127.0.0.1:${servidor.address().port}`;
  servidor.on('request', crearAplicacion(undefined, { conexiones: conexion, origen }));
  contexto.after(() => new Promise((resolver) => servidor.close(resolver)));

  async function pedir(ruta, { metodo = 'GET', cuerpo, cookie, origenPeticion = origen } = {}) {
    const headers = { Origin: origenPeticion };
    if (cookie) headers.Cookie = cookie;
    if (cuerpo !== undefined) headers['Content-Type'] = 'application/json';
    const body = typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo);
    const respuesta = await fetch(origen + ruta, { method: metodo, headers, body, redirect: 'manual' });
    return { estado: respuesta.status, cookie: respuesta.headers.get('set-cookie')?.split(';')[0], ...await respuesta.json() };
  }

  async function iniciar(identificador, contrasena) {
    const sesion = await pedir('/api/auth/login', { metodo: 'POST', cuerpo: { identificador, contrasena } });
    afirmar.equal(sesion.estado, 200);
    return sesion.cookie;
  }

  const admin = await iniciar('admin@example.test', credenciales.ADMIN);
  const cliente = await iniciar('DEMO-002', credenciales.CLIENTE_1);
  const api = (ruta, opciones) => pedir('/api/admin' + ruta, { cookie: admin, ...opciones });
  const nuevo = {
    nombreCompleto: 'Cliente Demo de Oficina', documento: 'DEMO-040', correo: 'oficina@example.test',
    telefono: '0000000199', contrasena: clave(), pinAtm: String(321).padStart(4, '0'),
    tipoCuenta: 'AHORROS', saldoInicial: 45.75
  };
  let creado;

  async function estadoDb() {
    const [[fila]] = await conexion.execute(`
      SELECT (SELECT COUNT(*) FROM usuarios) AS usuarios,
             (SELECT COUNT(*) FROM cuentas) AS cuentas,
             (SELECT COUNT(*) FROM movimientos) AS movimientos,
             (SELECT saldo FROM cuentas WHERE numero_cuenta = '9000000001') AS saldo
    `);
    return fila;
  }

  await contexto.test('métricas SQL y autorización de las rutas', async () => {
    const metricas = await api('/metricas');
    afirmar.equal(metricas.estado, 200);
    afirmar.deepEqual(metricas.datos, {
      clientesTotales: 3, clientesBloqueados: 1, cuentasActivas: 2, cuentasBloqueadas: 1, saldoGlobal: '1325.00'
    });
    for (const [metodo, recurso] of [
      ['GET', '/metricas'], ['GET', '/clientes'], ['GET', '/clientes/2'], ['GET', '/movimientos'],
      ['POST', '/clientes'], ['PUT', '/clientes/2'], ['POST', '/consignar']
    ]) {
      afirmar.equal((await pedir('/api/admin' + recurso, { metodo })).estado, 401);
      afirmar.equal((await pedir('/api/admin' + recurso, { metodo, cookie: cliente })).estado, 403);
    }
    afirmar.equal((await api('/clientes', { metodo: 'POST', cuerpo: nuevo,
      origenPeticion: 'https://externo.example.test' })).estado, 403);
    afirmar.equal((await api('/clientes/1')).estado, 404);
    afirmar.equal((await api('/clientes/2', { metodo: 'DELETE' })).estado, 404);
  });

  await contexto.test('alta, hashes, historial inicial, búsquedas y duplicados', async () => {
    const alta = await api('/clientes', { metodo: 'POST', cuerpo: { ...nuevo, rol: 'ADMIN' } });
    afirmar.equal(alta.estado, 201);
    creado = alta.datos;
    afirmar.ok(/^\d{10}$/.test(creado.numeroCuenta));
    const [[secreto]] = await conexion.execute(`
      SELECT u.contrasena, u.rol, c.pin_atm, c.saldo, c.estado
      FROM usuarios AS u JOIN cuentas AS c ON c.id_usuario = u.id_usuario WHERE u.id_usuario = ?
    `, [creado.idUsuario]);
    afirmar.equal(secreto.rol, 'CLIENTE');
    afirmar.equal(secreto.estado, 'ACTIVO');
    afirmar.equal(secreto.saldo, '45.75');
    afirmar.ok(await bcrypt.compare(nuevo.contrasena, secreto.contrasena));
    afirmar.ok(await bcrypt.compare(nuevo.pinAtm, secreto.pin_atm));
    afirmar.equal(await bcrypt.compare('321', secreto.pin_atm), false);

    const historial = await api(`/movimientos?numeroCuenta=${creado.numeroCuenta}`);
    afirmar.equal(historial.estado, 200);
    afirmar.equal(historial.datos.elementos.length, 1);
    const [apertura] = historial.datos.elementos;
    afirmar.equal(apertura.tipoMovimiento, 'CONSIGNACION');
    afirmar.equal(apertura.saldoAnterior, '0.00');
    afirmar.equal(apertura.saldoResultante, '45.75');

    for (const buscar of ['de Oficina', 'DEMO-040', nuevo.correo, creado.numeroCuenta]) {
      const listado = await api('/clientes?buscar=' + encodeURIComponent(buscar));
      afirmar.equal(listado.estado, 200);
      afirmar.equal(listado.datos.elementos.length, 1);
      afirmar.equal(listado.datos.elementos[0].cuentas[0].numeroCuenta, creado.numeroCuenta);
    }
    const detalle = await api(`/clientes/${creado.idUsuario}`);
    afirmar.equal(detalle.estado, 200);
    const representacion = JSON.stringify(detalle);
    afirmar.ok(![nuevo.contrasena, secreto.contrasena, secreto.pin_atm, 'pinAtm', 'contrasena']
      .some((valor) => representacion.includes(valor)));
    const antes = await estadoDb();
    afirmar.equal((await api('/clientes', {
      metodo: 'POST', cuerpo: { ...nuevo, correo: 'alterno@example.test' }
    })).estado, 409);
    afirmar.equal((await api('/clientes', {
      metodo: 'POST', cuerpo: { ...nuevo, documento: 'DEMO-041' }
    })).estado, 409);
    afirmar.deepEqual(await estadoDb(), antes);

    const sinSaldo = await api('/clientes', { metodo: 'POST', cuerpo: {
      ...nuevo, documento: 'DEMO-042', correo: 'sin-saldo@example.test', saldoInicial: '0.00'
    } });
    afirmar.equal(sinSaldo.estado, 201);
    afirmar.ok(sinSaldo.datos.numeroCuenta !== creado.numeroCuenta);
    afirmar.equal((await api('/movimientos?numeroCuenta=' + sinSaldo.datos.numeroCuenta)).datos.elementos.length, 0);
  });

  await contexto.test('edita campos permitidos y respeta titularidad y estados', async () => {
    const editar = (idUsuario, cuerpo) => api('/clientes/' + idUsuario, { metodo: 'PUT', cuerpo });
    const cambios = await editar(creado.idUsuario, { nombreCompleto: 'Cliente Demo Actualizado', telefono: '0000000100' });
    afirmar.equal(cambios.estado, 200);
    afirmar.equal(cambios.datos.nombreCompleto, 'Cliente Demo Actualizado');
    afirmar.equal((await editar(creado.idUsuario, { correo: 'cliente1@example.test' })).estado, 409);
    afirmar.equal((await editar(creado.idUsuario, { saldo: '1.00' })).estado, 400);
    afirmar.equal((await editar(2, { idCuenta: creado.idCuenta, estadoCuenta: 'BLOQUEADO' })).estado, 404);

    const consignar = () => api('/consignar', { metodo: 'POST', cuerpo: {
      numeroCuenta: creado.numeroCuenta, monto: '1.00', descripcion: 'Validación de estado'
    } });
    const antes = await estadoDb();
    afirmar.equal((await editar(creado.idUsuario, { estadoUsuario: 'INACTIVO' })).estado, 200);
    afirmar.equal((await consignar()).estado, 403);
    afirmar.equal((await editar(creado.idUsuario, { estadoUsuario: 'ACTIVO' })).estado, 200);
    afirmar.equal((await editar(creado.idUsuario, { idCuenta: creado.idCuenta, estadoCuenta: 'BLOQUEADO' })).estado, 200);
    afirmar.equal((await consignar()).estado, 403);
    afirmar.equal((await editar(creado.idUsuario, { idCuenta: creado.idCuenta, estadoCuenta: 'ACTIVO' })).estado, 200);
    afirmar.deepEqual(await estadoDb(), antes);
    afirmar.equal((await api('/clientes/' + creado.idUsuario)).datos.cuentas[0].saldo, '45.75');
  });

  await contexto.test('consigna importes exactos y serializa movimientos concurrentes', async () => {
    const cuenta = '9000000001';
    const consignar = (monto, numeroCuenta = cuenta) => api('/consignar', { metodo: 'POST', cuerpo: {
      numeroCuenta, monto, descripcion: 'Prueba de ventanilla'
    } });
    const antes = await estadoDb();
    for (const monto of ['0.00', '-1.00', '0.123', '10000000000000.00']) {
      afirmar.equal((await consignar(monto)).estado, 400);
    }
    afirmar.equal((await api('/consignar', { metodo: 'POST',
      cuerpo: '{"numeroCuenta":"9000000001","monto":0.0100000000000000001,"descripcion":"Prueba"}' })).estado, 400);
    afirmar.equal((await consignar('1.00', '0000000000')).estado, 404);
    afirmar.equal((await consignar('1.00', '9000000003')).estado, 403);
    afirmar.equal((await consignar('9999999999999.99')).estado, 409);
    afirmar.deepEqual(await estadoDb(), antes);

    const ingreso = await consignar(0.75, 9000000001);
    afirmar.equal(ingreso.estado, 201);
    afirmar.equal(ingreso.datos.monto, '0.75');
    afirmar.equal(ingreso.datos.saldoResultante, '850.75');
    const simultaneas = await Promise.all([consignar('0.10'), consignar('0.20')]);
    afirmar.deepEqual(simultaneas.map((resultado) => resultado.estado), [201, 201]);
    const posterior = await estadoDb();
    afirmar.equal(posterior.saldo, '851.05');
    afirmar.equal(posterior.movimientos, antes.movimientos + 3);
    const [movimientos] = await conexion.execute(`
      SELECT saldo_anterior, saldo_resultante FROM movimientos
      WHERE id_movimiento IN (?, ?) ORDER BY id_movimiento
    `, simultaneas.map(({ datos }) => datos.idMovimiento));
    afirmar.equal(movimientos[0].saldo_anterior, '850.75');
    afirmar.equal(movimientos[0].saldo_resultante, movimientos[1].saldo_anterior);
    afirmar.equal(movimientos[1].saldo_resultante, '851.05');
    const [[{ saldoGlobal }]] = await conexion.execute('SELECT SUM(saldo) AS saldoGlobal FROM cuentas');
    afirmar.equal((await api('/metricas')).datos.saldoGlobal, saldoGlobal);
  });

  await contexto.test('historial por fecha inclusiva, tipo y cuenta', async () => {
    const filtrado = await api('/movimientos?desde=2025-01-02&hasta=2025-01-02&tipo=TRANSFERENCIA_ENVIADA&numeroCuenta=9000000001');
    afirmar.equal(filtrado.estado, 200);
    afirmar.equal(filtrado.datos.elementos.length, 1);
    afirmar.equal(filtrado.datos.elementos[0].monto, '150.00');
    afirmar.equal((await api('/movimientos?desde=2025-02-30')).estado, 400);
    afirmar.equal((await api('/movimientos?desde=2025-02-02&hasta=2025-02-01')).estado, 400);
    afirmar.equal((await api('/clientes?pagina=2')).datos.elementos.length, 0);
  });

  await contexto.test('un fallo del historial revierte una consignación y un alta completa', async () => {
    const antes = await estadoDb();
    await conexion.query(`
      CREATE TRIGGER fallo_movimiento_admin_prueba BEFORE INSERT ON movimientos FOR EACH ROW
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Marcador privado de prueba'
    `);
    const consignar = await api('/consignar', { metodo: 'POST', cuerpo: {
      numeroCuenta: '9000000001', monto: '1.25', descripcion: 'Debe revertirse'
    } });
    afirmar.equal(consignar.estado, 500);
    afirmar.equal(consignar.mensaje, 'Ocurrió un error interno.');
    afirmar.deepEqual(await estadoDb(), antes);
    const alta = await api('/clientes', { metodo: 'POST', cuerpo: {
      ...nuevo, documento: 'DEMO-049', correo: 'rollback@example.test'
    } });
    afirmar.equal(alta.estado, 500);
    afirmar.equal(alta.mensaje, 'Ocurrió un error interno.');
    afirmar.deepEqual(await estadoDb(), antes);
  });
});
