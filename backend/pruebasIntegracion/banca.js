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

test('banca virtual con una base SQL de prueba', async (contexto) => {
  const { MYSQL_PRUEBA_BASE: base, MYSQL_PRUEBA_PUERTO: puerto = '3306',
    MYSQL_PRUEBA_USUARIO: usuario, MYSQL_PRUEBA_CONTRASENA: contrasena } = process.env;
  afirmar.match(base ?? '', /^simulador_fase5_prueba(?:_[a-z0-9]+)*$/);
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
  const esquema = await readFile(ruta.join(raiz, 'database.sql'), 'utf8');
  await conexion.query(await generarSqlConSemillas(esquema, semillas));
  await conexion.query(await readFile(ruta.join(raiz, 'migraciones/003_sesiones_web.sql'), 'utf8'));

  const servidor = createServer().listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  const origen = `http://127.0.0.1:${servidor.address().port}`;
  servidor.on('request', crearAplicacion(undefined, { conexiones: conexion, origen }));
  contexto.after(() => new Promise((resolver) => servidor.close(resolver)));

  async function pedir(recurso, { metodo = 'GET', cuerpo, cookie, origenPeticion = origen } = {}) {
    const headers = { Origin: origenPeticion };
    if (cookie) headers.Cookie = cookie;
    if (cuerpo !== undefined) headers['Content-Type'] = 'application/json';
    const body = typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo);
    const respuesta = await fetch(origen + recurso, { method: metodo, headers, body, redirect: 'manual' });
    return { estado: respuesta.status, cookie: respuesta.headers.get('set-cookie')?.split(';')[0], ...await respuesta.json() };
  }
  function iniciar(identificador, contrasena) {
    return pedir('/api/auth/login', { metodo: 'POST', cuerpo: { identificador, contrasena } });
  }
  const admin = await iniciar('admin@example.test', semillas.ADMIN);
  const cliente = await iniciar('DEMO-002', semillas.CLIENTE_1);
  const otro = await iniciar('DEMO-003', semillas.CLIENTE_2);
  afirmar.deepEqual([admin.estado, cliente.estado, otro.estado], [200, 200, 200]);
  const api = (recurso, opciones) => pedir('/api/banca' + recurso, { cookie: cliente.cookie, ...opciones });
  const transferencia = { cuentaDestino: '9000000002', monto: '20.25', descripcion: 'Prueba de banca' };
  const enviar = (cuerpo, cookie = cliente.cookie) => api('/transferir', { metodo: 'POST', cuerpo, cookie });

  async function foto() {
    const [[fila]] = await conexion.execute(`
      SELECT (SELECT COUNT(*) FROM movimientos) AS movimientos,
             (SELECT COUNT(*) FROM transferencias) AS transferencias,
             (SELECT SUM(saldo) FROM cuentas) AS total,
             (SELECT saldo FROM cuentas WHERE id_cuenta = 1) AS origen,
             (SELECT saldo FROM cuentas WHERE id_cuenta = 2) AS destino
    `);
    return fila;
  }

  await contexto.test('protege todas las rutas y devuelve únicamente cuentas y movimientos propios', async () => {
    for (const [metodo, recurso] of [
      ['GET', '/cuenta'], ['GET', '/movimientos'], ['GET', '/perfil'],
      ['PUT', '/perfil'], ['PUT', '/contrasena'], ['POST', '/transferir']
    ]) {
      afirmar.equal((await pedir('/api/banca' + recurso, { metodo })).estado, 401);
      afirmar.equal((await api(recurso, { metodo, cookie: admin.cookie })).estado, 403);
    }
    afirmar.equal((await api('/transferir', {
      metodo: 'POST', cuerpo: transferencia, origenPeticion: 'https://externo.example.test'
    })).estado, 403);
    const cuenta = await api('/cuenta?idUsuario=3');
    afirmar.equal(cuenta.estado, 200);
    afirmar.equal(cuenta.datos.numeroCuenta, '9000000001');
    afirmar.equal(cuenta.datos.saldo, '850.00');
    afirmar.equal(cuenta.datos.estado, 'ACTIVO');
    afirmar.equal(cuenta.datos.tipoCuenta, 'AHORROS');
    afirmar.equal(cuenta.datos.titular, 'Cliente Demo Uno');
    afirmar.equal(cuenta.datos.cuentas.length, 1);
    afirmar.equal((await api('/cuenta?idCuenta=2')).estado, 404);
    afirmar.equal((await api('/movimientos?idCuenta=2')).estado, 404);
    const movimientos = await api('/movimientos');
    afirmar.equal(movimientos.estado, 200);
    afirmar.equal(movimientos.datos.elementos.length, 2);
    afirmar.deepEqual(movimientos.datos.elementos.map((fila) => fila.tipoMovimiento), ['TRANSFERENCIA_ENVIADA', 'CONSIGNACION']);
    afirmar.equal((await api('/movimientos?pagina=2')).datos.elementos.length, 0);
  });

  await contexto.test('edita únicamente correo y teléfono del perfil autenticado', async () => {
    const editar = (cuerpo) => api('/perfil', { metodo: 'PUT', cuerpo });
    const perfil = await api('/perfil?idUsuario=3');
    afirmar.equal(perfil.estado, 200);
    afirmar.equal(perfil.datos.documento, 'DEMO-002');
    afirmar.deepEqual(Object.keys(perfil.datos).sort(), ['correo', 'documento', 'nombreCompleto', 'telefono']);
    for (const campo of ['saldo', 'rol', 'estado', 'numeroCuenta', 'idUsuario', 'nombreCompleto']) {
      afirmar.equal((await editar({ [campo]: 'dato' })).estado, 400);
    }
    afirmar.equal((await editar({ correo: 'cliente2@example.test' })).estado, 409);
    afirmar.equal((await editar({ correo: 'inválido' })).estado, 400);
    const actualizado = await editar({ correo: 'perfil-demo@example.test', telefono: '0000000130' });
    afirmar.equal(actualizado.estado, 200);
    afirmar.equal(actualizado.datos.correo, 'perfil-demo@example.test');
    afirmar.equal(actualizado.datos.telefono, '0000000130');
    afirmar.equal((await api('/perfil', { cookie: otro.cookie })).datos.correo, 'cliente2@example.test');
  });

  await contexto.test('crea una transferencia y dos movimientos con saldo total constante', async () => {
    const antes = await foto();
    const resultado = await enviar({ ...transferencia, cuentaDestino: 9000000002, monto: 20.25 });
    afirmar.equal(resultado.estado, 201);
    afirmar.equal(resultado.datos.cuentaOrigen, '9000000001');
    afirmar.equal(resultado.datos.cuentaDestino, '9000000002');
    afirmar.equal(resultado.datos.nuevoSaldo, '829.75');
    afirmar.equal(resultado.datos.montoTransferido, '20.25');
    const despues = await foto();
    afirmar.equal(despues.origen, '829.75');
    afirmar.equal(despues.destino, '420.25');
    afirmar.equal(despues.total, antes.total);
    afirmar.equal(despues.movimientos, antes.movimientos + 2);
    afirmar.equal(despues.transferencias, antes.transferencias + 1);

    const [[fila]] = await conexion.execute(`
      SELECT id_cuenta_origen, id_cuenta_destino, monto, descripcion
      FROM transferencias WHERE id_transferencia = ?
    `, [resultado.datos.idTransferencia]);
    afirmar.deepEqual(fila, { id_cuenta_origen: 1, id_cuenta_destino: 2, monto: '20.25', descripcion: transferencia.descripcion });
    const [movimientos] = await conexion.execute(`
      SELECT id_cuenta, tipo_movimiento, monto, saldo_anterior, saldo_resultante
      FROM movimientos WHERE id_transferencia = ? ORDER BY id_cuenta
    `, [resultado.datos.idTransferencia]);
    afirmar.deepEqual(movimientos, [
      { id_cuenta: 1, tipo_movimiento: 'TRANSFERENCIA_ENVIADA', monto: '20.25', saldo_anterior: '850.00', saldo_resultante: '829.75' },
      { id_cuenta: 2, tipo_movimiento: 'TRANSFERENCIA_RECIBIDA', monto: '20.25', saldo_anterior: '400.00', saldo_resultante: '420.25' }
    ]);
    afirmar.equal((await api('/movimientos', { cookie: otro.cookie })).datos.elementos[0].tipoMovimiento, 'TRANSFERENCIA_RECIBIDA');
    afirmar.equal((await pedir('/api/admin/metricas', { cookie: admin.cookie })).datos.saldoGlobal, antes.total);
    const global = await pedir('/api/admin/movimientos?numeroCuenta=9000000001', { cookie: admin.cookie });
    afirmar.equal(global.datos.elementos[0].saldoResultante, '829.75');
  });

  let secundaria;
  await contexto.test('permite elegir otra cuenta propia y protege estados y límites', async () => {
    const [alta] = await conexion.execute(`
      INSERT INTO cuentas (id_usuario, numero_cuenta, pin_atm)
      SELECT id_usuario, '9000000099', pin_atm FROM cuentas WHERE id_cuenta = 1
    `);
    secundaria = alta.insertId;
    const cuentas = await api('/cuenta');
    afirmar.deepEqual(cuentas.datos.cuentas.map((cuenta) => cuenta.idCuenta), [1, secundaria]);
    const otra = await api('/cuenta?idCuenta=' + secundaria);
    afirmar.equal(otra.datos.saldo, '0.00');
    afirmar.equal((await api('/movimientos?idCuenta=' + secundaria)).datos.elementos.length, 0);
    afirmar.equal((await enviar({ cuentaDestino: '9000000099', monto: '25.50' })).estado, 201);
    afirmar.equal((await enviar({ idCuentaOrigen: secundaria, cuentaDestino: '9000000002', monto: '5.50' })).estado, 201);
    afirmar.equal((await api('/cuenta?idCuenta=' + secundaria)).datos.saldo, '20.00');

    const antes = await foto();
    for (const [cambio, estado] of [
      [{ cuentaDestino: '9000000001' }, 400], [{ cuentaDestino: '9000000003' }, 403],
      [{ cuentaDestino: '0000000000' }, 404], [{ idCuentaOrigen: 2 }, 404], [{ idUsuario: 3 }, 400],
      [{ monto: '0.00' }, 400], [{ monto: '-1.00' }, 400], [{ monto: '0.111' }, 400],
      [{ monto: '9999999999999.99' }, 409]
    ]) afirmar.equal((await enviar({ ...transferencia, ...cambio })).estado, estado);
    afirmar.equal((await enviar('{"cuentaDestino":"9000000002","monto":0.0100000000000000001}')).estado, 400);
    try {
      await conexion.execute("UPDATE cuentas SET estado = 'BLOQUEADO' WHERE id_cuenta = ?", [secundaria]);
      afirmar.equal((await api('/cuenta?idCuenta=' + secundaria)).estado, 404);
      afirmar.equal((await enviar({ ...transferencia, idCuentaOrigen: secundaria })).estado, 403);
      await conexion.execute("UPDATE cuentas SET estado = 'INACTIVO' WHERE id_cuenta = 2");
      afirmar.equal((await enviar(transferencia)).estado, 403);
      await conexion.execute("UPDATE cuentas SET estado = 'ACTIVO' WHERE id_cuenta = 2");
      await conexion.execute("UPDATE usuarios SET estado = 'INACTIVO' WHERE id_usuario = 3");
      afirmar.equal((await enviar(transferencia)).estado, 403);
      await conexion.execute("UPDATE cuentas SET saldo = '9999999999999.99' WHERE id_cuenta = 2");
      await conexion.execute("UPDATE usuarios SET estado = 'ACTIVO' WHERE id_usuario = 3");
      afirmar.equal((await enviar(transferencia)).estado, 409);
    } finally {
      await conexion.execute("UPDATE cuentas SET estado = 'ACTIVO' WHERE id_cuenta IN (?, 2)", [secundaria]);
      await conexion.execute('UPDATE cuentas SET saldo = ? WHERE id_cuenta = 2', [antes.destino]);
      await conexion.execute("UPDATE usuarios SET estado = 'ACTIVO' WHERE id_usuario = 3");
    }
    afirmar.deepEqual(await foto(), antes);
    afirmar.equal((await api('/cuenta?idCuenta=' + secundaria)).datos.saldo, '20.00');
  });

  await contexto.test('ordena transferencias cruzadas y evita el doble gasto', async () => {
    const antes = await foto();
    const cruzadas = await Promise.all([
      enviar({ cuentaDestino: '9000000002', monto: '0.20' }),
      enviar({ cuentaDestino: '9000000001', monto: '0.10' }, otro.cookie)
    ]);
    afirmar.deepEqual(cruzadas.map((r) => r.estado), [201, 201]);
    afirmar.equal((await foto()).total, antes.total);

    const previo = await foto();
    const orden = { idCuentaOrigen: secundaria, cuentaDestino: '9000000002', monto: '15.00' };
    const simultaneas = await Promise.all([enviar(orden), enviar(orden)]);
    afirmar.deepEqual(simultaneas.map((r) => r.estado).sort(), [201, 409]);
    const posterior = await foto();
    afirmar.equal(posterior.total, previo.total);
    afirmar.equal(posterior.transferencias, previo.transferencias + 1);
    afirmar.equal(posterior.movimientos, previo.movimientos + 2);
    afirmar.equal((await api('/cuenta?idCuenta=' + secundaria)).datos.saldo, '5.00');
  });

  await contexto.test('revierte ambos saldos, la transferencia y los movimientos si falla el crédito', async () => {
    const antes = await foto();
    await conexion.query(`
      CREATE TRIGGER fallo_credito_banca_prueba BEFORE INSERT ON movimientos FOR EACH ROW
      BEGIN
        IF NEW.tipo_movimiento = 'TRANSFERENCIA_RECIBIDA' THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Marcador privado de prueba';
        END IF;
      END
    `);
    const resultado = await enviar(transferencia);
    afirmar.equal(resultado.estado, 500);
    afirmar.equal(resultado.mensaje, 'Ocurrió un error interno.');
    afirmar.deepEqual(await foto(), antes);
  });

  await contexto.test('exige contraseña actual y revoca todas las sesiones al cambiarla', async () => {
    const otraSesion = await iniciar('DEMO-002', semillas.CLIENTE_1);
    afirmar.equal(otraSesion.estado, 200);
    const nueva = clave();
    const cambiar = (cuerpo) => api('/contrasena', { metodo: 'PUT', cuerpo });
    afirmar.equal((await cambiar({ nuevaContrasena: nueva })).estado, 400);
    afirmar.equal((await cambiar({ contrasenaActual: clave(), nuevaContrasena: nueva })).estado, 403);
    afirmar.equal((await api('/cuenta')).estado, 200);
    const cambio = await cambiar({ contrasenaActual: semillas.CLIENTE_1, nuevaContrasena: nueva });
    afirmar.equal(cambio.estado, 200);
    afirmar.equal(cambio.cookie, 'sesion_web=');
    afirmar.equal((await api('/cuenta')).estado, 401);
    afirmar.equal((await api('/cuenta', { cookie: otraSesion.cookie })).estado, 401);
    afirmar.equal((await iniciar('DEMO-002', semillas.CLIENTE_1)).estado, 401);
    afirmar.equal((await iniciar('perfil-demo@example.test', nueva)).estado, 200);
    const [[fila]] = await conexion.execute('SELECT contrasena FROM usuarios WHERE id_usuario = 2');
    afirmar.ok(await bcrypt.compare(nueva, fila.contrasena));
    afirmar.ok(!JSON.stringify(cambio).includes(nueva));
  });
});
