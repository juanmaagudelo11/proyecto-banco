const { test } = require('node:test');
const afirmar = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { readFile } = require('node:fs/promises');
const { createServer } = require('node:http');
const { once } = require('node:events');
const ruta = require('node:path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const { crearAplicacion } = require('../src/app');
const { crearGrupoConexiones } = require('../src/baseDatos');
const { aCentavos, aDecimal } = require('../src/servicios/importes');
const { generarSqlConSemillas } = require('../herramientas/generarSemillas');

function extraerCookie(respuesta) {
  return respuesta.headers.getSetCookie()[0]?.split(';', 1)[0];
}

async function prepararBase(conexion) {
  const [[{ total }]] = await conexion.execute(
    'SELECT COUNT(*) AS total FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()'
  );
  afirmar.equal(total, 0, 'La base de integración debe estar vacía.');

  const clave = () => randomBytes(20).toString('hex');
  const semillas = {
    ADMIN: clave(), CLIENTE_1: clave(), CLIENTE_2: clave(), CLIENTE_3: clave(),
    PIN_1: String(7).padStart(4, '0'), PIN_2: String(17).padStart(4, '0'), PIN_3: String(27).padStart(4, '0')
  };
  const raiz = ruta.resolve(__dirname, '../..');
  const esquema = await readFile(ruta.join(raiz, 'database.sql'), 'utf8');
  await conexion.query(await generarSqlConSemillas(esquema, semillas));
  for (const migracion of ['003_sesiones_web.sql', '006_atm.sql']) {
    await conexion.query(await readFile(ruta.join(raiz, 'migraciones', migracion), 'utf8'));
  }
  return semillas;
}

test('flujo de los tres módulos con una sola base aislada', async (contexto) => {
  const {
    MYSQL_PRUEBA_BASE: base, MYSQL_PRUEBA_PUERTO: puerto = '3306',
    MYSQL_PRUEBA_USUARIO: usuario, MYSQL_PRUEBA_CONTRASENA: contrasena,
    MYSQL_PRUEBA_USUARIO_APP: usuarioApp, MYSQL_PRUEBA_CONTRASENA_APP: contrasenaApp
  } = process.env;
  afirmar.ok(base, 'Falta MYSQL_PRUEBA_BASE. Crea una base vacía simulador_fase7_prueba y ejecuta el bloque de PowerShell del README de la fase 7 en la misma terminal.');
  afirmar.match(base, /^simulador_fase7_prueba(?:_[a-z0-9]+)*$/,
    'Usa una base de prueba con un nombre como simulador_fase7_prueba o simulador_fase7_prueba_2.');
  afirmar.ok(usuario && contrasena, 'Configura MYSQL_PRUEBA_USUARIO y MYSQL_PRUEBA_CONTRASENA en esta terminal.');
  afirmar.ok(Number.isInteger(Number(puerto)) && Number(puerto) >= 1 && Number(puerto) <= 65535,
    'MYSQL_PRUEBA_PUERTO debe ser un puerto TCP válido.');
  afirmar.equal(Boolean(usuarioApp), Boolean(contrasenaApp),
    'Completa ambas variables MYSQL_PRUEBA_*_APP o deja ambas sin definir.');
  if (usuarioApp) {
    afirmar.match(usuarioApp, /^fase7_app(?:_[a-z0-9]+)*$/);
    afirmar.notEqual(usuarioApp, usuario, 'Usa cuentas distintas para instalar y ejecutar la aplicación.');
  }

  const conexion = await mysql.createConnection({
    host: '127.0.0.1', port: Number(puerto), database: base, user: usuario, password: contrasena,
    multipleStatements: true
  });
  contexto.after(() => conexion.end());
  const semillas = await prepararBase(conexion);

  if (usuarioApp) {
    const permisos = [
      ['usuarios', 'SELECT, INSERT, UPDATE (nombre_completo, correo, telefono, estado, contrasena)'],
      ['cuentas', 'SELECT, INSERT, UPDATE (saldo, estado)'],
      ['movimientos', 'SELECT, INSERT'],
      ['transferencias', 'INSERT'],
      ['sesiones_web', 'SELECT, INSERT, DELETE'],
      ['sesiones_atm', 'SELECT, INSERT, DELETE'],
      ['retiros_atm', 'SELECT, INSERT']
    ];
    for (const [tabla, privilegios] of permisos) {
      await conexion.query('GRANT ' + privilegios + ' ON ??.?? TO ?@?', [base, tabla, usuarioApp, '127.0.0.1']);
    }
  }

  const grupo = crearGrupoConexiones({
    MYSQL_HOST: '127.0.0.1', MYSQL_PUERTO: puerto, MYSQL_BASE: base,
    MYSQL_USUARIO: usuarioApp || usuario, MYSQL_CONTRASENA: contrasenaApp || contrasena
  });
  contexto.after(() => grupo.end());
  const servidor = createServer().listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  const origen = `http://127.0.0.1:${servidor.address().port}`;
  servidor.on('request', crearAplicacion(undefined, { conexiones: grupo, origen }));
  contexto.after(() => new Promise((resolver) => servidor.close(resolver)));

  async function pedir(recurso, { metodo = 'GET', cuerpo, cookie, clave, origenPeticion = origen } = {}) {
    const headers = { Origin: origenPeticion };
    if (cookie) headers.Cookie = cookie;
    if (clave) headers['Idempotency-Key'] = clave;
    if (cuerpo !== undefined) headers['Content-Type'] = 'application/json';
    const respuesta = await fetch(origen + recurso, {
      method: metodo, headers, body: JSON.stringify(cuerpo), redirect: 'manual', signal: AbortSignal.timeout(10000)
    });
    return {
      estado: respuesta.status, cookie: extraerCookie(respuesta), cache: respuesta.headers.get('cache-control'),
      ...await respuesta.json()
    };
  }

  const accesoWeb = (identificador, contrasena) =>
    pedir('/api/auth/login', { metodo: 'POST', cuerpo: { identificador, contrasena } });
  const accesoAtm = (numeroCuenta, pin) =>
    pedir('/api/atm/login', { metodo: 'POST', cuerpo: { numeroCuenta, pin } });
  let admin;
  let banca;
  let receptor;
  let cajero;
  let idClienteNuevo;

  const cuentaOrigen = '9000000001';
  const cuentaReceptora = '9000000002';
  const alta = {
    nombreCompleto: 'Cliente Ficticio Integración', documento: 'DEMO-INTEGRAL', correo: 'integracion@example.test',
    telefono: '0000000118', contrasena: randomBytes(20).toString('hex'), pinAtm: String(8).padStart(4, '0'),
    tipoCuenta: 'AHORROS', saldoInicial: '25.00'
  };

  const altaAdmin = (datos) => pedir('/api/admin/clientes', { metodo: 'POST', cookie: admin, cuerpo: datos });
  const depositar = (monto) => pedir('/api/admin/consignar', {
    metodo: 'POST', cookie: admin, cuerpo: { numeroCuenta: cuentaOrigen, monto, descripcion: 'Consignación integral' }
  });
  const transferir = (monto, destino = cuentaReceptora) => pedir('/api/banca/transferir', {
    metodo: 'POST', cookie: banca, cuerpo: { cuentaDestino: destino, monto, descripcion: 'Transferencia integral' }
  });
  const retirar = (monto, clave = randomUUID()) =>
    pedir('/api/atm/retirar', { metodo: 'POST', cookie: cajero, clave, cuerpo: { monto } });

  async function foto() {
    const [[fila]] = await conexion.execute(`
      SELECT (SELECT SUM(saldo) FROM cuentas) AS saldoGlobal,
             (SELECT COUNT(*) FROM movimientos) AS movimientos,
             (SELECT COUNT(*) FROM transferencias) AS transferencias,
             (SELECT COUNT(*) FROM retiros_atm) AS comprobantes
    `);
    return fila;
  }

  async function conciliar() {
    const [cuentas] = await conexion.execute('SELECT id_cuenta, saldo FROM cuentas ORDER BY id_cuenta');
    const [movimientos] = await conexion.execute(`
      SELECT id_cuenta, tipo_movimiento, monto, saldo_anterior, saldo_resultante
      FROM movimientos ORDER BY id_cuenta, fecha_movimiento, id_movimiento
    `);
    const saldos = new Map(cuentas.map((cuenta) => [cuenta.id_cuenta, 0n]));
    for (const movimiento of movimientos) {
      const anterior = saldos.get(movimiento.id_cuenta);
      const monto = aCentavos(movimiento.monto);
      const debito = ['RETIRO', 'TRANSFERENCIA_ENVIADA'].includes(movimiento.tipo_movimiento);
      const resultante = anterior + (debito ? -monto : monto);
      afirmar.equal(movimiento.saldo_anterior, aDecimal(anterior));
      afirmar.equal(movimiento.saldo_resultante, aDecimal(resultante));
      afirmar.ok(resultante >= 0n);
      saldos.set(movimiento.id_cuenta, resultante);
    }
    for (const cuenta of cuentas) afirmar.equal(cuenta.saldo, aDecimal(saldos.get(cuenta.id_cuenta)));
  }

  async function verificarModulos(saldo, saldoReceptor, tipo, idMovimiento) {
    const [cuenta, atm, historialWeb, historialAtm, historialGlobal, destino, metricas] = await Promise.all([
      pedir('/api/banca/cuenta', { cookie: banca }), pedir('/api/atm/saldo', { cookie: cajero }),
      pedir('/api/banca/movimientos', { cookie: banca }), pedir('/api/atm/movimientos', { cookie: cajero }),
      pedir('/api/admin/movimientos?numeroCuenta=' + cuentaOrigen, { cookie: admin }),
      pedir('/api/banca/cuenta', { cookie: receptor }), pedir('/api/admin/metricas', { cookie: admin })
    ]);
    afirmar.deepEqual([cuenta, atm, historialWeb, historialAtm, historialGlobal, destino, metricas].map(r => r.estado),
      [200, 200, 200, 200, 200, 200, 200]);
    afirmar.equal(cuenta.datos.saldo, saldo);
    afirmar.equal(atm.datos.saldo, saldo);
    afirmar.equal(destino.datos.saldo, saldoReceptor);
    afirmar.equal(metricas.datos.saldoGlobal, (await foto()).saldoGlobal);
    for (const historial of [historialWeb, historialAtm, historialGlobal]) {
      const [ultimo] = historial.datos.elementos;
      afirmar.equal(ultimo.tipoMovimiento, tipo);
      afirmar.equal(ultimo.saldoResultante, saldo);
      if (idMovimiento !== undefined) afirmar.equal(ultimo.idMovimiento, idMovimiento);
    }
    await conciliar();
  }

  await contexto.test('CP-01: acceso válido del administrador y sesiones de prueba', async () => {
    const inicio = await accesoWeb('admin@example.test', semillas.ADMIN);
    afirmar.equal(inicio.estado, 200);
    afirmar.equal(inicio.datos.rol, 'ADMIN');
    admin = inicio.cookie;
    const panel = await fetch(origen + '/panel-administrador', { headers: { Cookie: admin } });
    afirmar.equal(panel.status, 200);
    afirmar.match(await panel.text(), /Panel de administraci/);
    const cliente = await accesoWeb('DEMO-002', semillas.CLIENTE_1);
    const destino = await accesoWeb('DEMO-003', semillas.CLIENTE_2);
    const atm = await accesoAtm(cuentaOrigen, semillas.PIN_1);
    afirmar.deepEqual([cliente, destino, atm].map(r => r.estado), [200, 200, 200]);
    banca = cliente.cookie;
    receptor = destino.cookie;
    cajero = atm.cookie;
  });

  await contexto.test('CP-02: credenciales incorrectas web y ATM reciben respuesta genérica', async () => {
    const web = await accesoWeb('admin@example.test', semillas.CLIENTE_1);
    const otroWeb = await accesoWeb('ausente@example.test', semillas.CLIENTE_1);
    const atm = await accesoAtm(cuentaOrigen, semillas.PIN_2);
    const otroAtm = await accesoAtm('0000000000', semillas.PIN_2);
    for (const r of [web, otroWeb, atm, otroAtm]) {
      afirmar.equal(r.estado, 401);
      afirmar.equal(r.cookie, undefined);
      afirmar.equal(r.datos, null);
    }
    afirmar.equal(web.mensaje, otroWeb.mensaje);
    afirmar.equal(atm.mensaje, otroAtm.mensaje);
  });

  await contexto.test('CP-03: el usuario y la cuenta bloqueados no entran', async () => {
    const web = await accesoWeb('DEMO-004', semillas.CLIENTE_3);
    const atm = await accesoAtm('9000000003', semillas.PIN_3);
    afirmar.deepEqual([web.estado, atm.estado], [403, 403]);
    afirmar.ok(!web.cookie && !atm.cookie);
  });

  await contexto.test('CP-04: alta y cuenta activas en SQL con hashes y movimiento inicial', async () => {
    const resultado = await altaAdmin(alta);
    afirmar.equal(resultado.estado, 201);
    idClienteNuevo = resultado.datos.idUsuario;
    const [[fila]] = await conexion.execute(`
      SELECT u.rol, u.estado, u.contrasena, c.pin_atm, c.saldo, c.numero_cuenta
      FROM usuarios AS u JOIN cuentas AS c ON c.id_usuario = u.id_usuario WHERE u.id_usuario = ?
    `, [idClienteNuevo]);
    afirmar.equal(fila.rol, 'CLIENTE');
    afirmar.equal(fila.estado, 'ACTIVO');
    afirmar.equal(fila.saldo, '25.00');
    afirmar.equal(fila.numero_cuenta, resultado.datos.numeroCuenta);
    afirmar.ok(await bcrypt.compare(alta.contrasena, fila.contrasena));
    afirmar.ok(await bcrypt.compare(alta.pinAtm, fila.pin_atm));
    const detalle = await pedir('/api/admin/clientes/' + idClienteNuevo, { cookie: admin });
    afirmar.equal(detalle.estado, 200);
    afirmar.ok(![fila.contrasena, fila.pin_atm, alta.contrasena, 'contrasena', 'pinAtm'].some(
      valor => JSON.stringify(detalle).includes(valor)));
    await conciliar();
  });

  await contexto.test('CP-05: los duplicados se rechazan sin cambios parciales', async () => {
    const antes = await foto();
    afirmar.equal((await altaAdmin({ ...alta, correo: 'otro@example.test' })).estado, 409);
    afirmar.equal((await altaAdmin({ ...alta, documento: 'DEMO-DUPLICADO' })).estado, 409);
    const [[{ total }]] = await conexion.execute('SELECT COUNT(*) AS total FROM usuarios');
    afirmar.equal(total, 5);
    afirmar.deepEqual(await foto(), antes);
  });

  await contexto.test('CP-06: la consignación sincroniza saldo y movimiento en los tres módulos', async () => {
    const resultado = await depositar('100.50');
    afirmar.equal(resultado.estado, 201);
    await verificarModulos('950.50', '400.00', 'CONSIGNACION', resultado.datos.idMovimiento);
  });

  await contexto.test('CP-07: la transferencia sincroniza ambos lados y conserva el saldo global', async () => {
    const antes = await foto();
    const resultado = await transferir('150.25');
    afirmar.equal(resultado.estado, 201);
    const [[{ total }]] = await conexion.execute(
      'SELECT COUNT(*) AS total FROM movimientos WHERE id_transferencia = ?', [resultado.datos.idTransferencia]);
    afirmar.equal(total, 2);
    afirmar.equal((await foto()).saldoGlobal, antes.saldoGlobal);
    await verificarModulos('800.25', '550.25', 'TRANSFERENCIA_ENVIADA');
    const destino = await pedir('/api/banca/movimientos', { cookie: receptor });
    afirmar.equal(destino.datos.elementos[0].tipoMovimiento, 'TRANSFERENCIA_RECIBIDA');
    afirmar.equal(destino.datos.elementos[0].monto, '150.25');
  });

  await contexto.test('CP-08: los sobregiros de banca y ATM se rechazan', async () => {
    const antes = await foto();
    afirmar.equal((await transferir('800.26')).estado, 409);
    afirmar.equal((await retirar('800.26')).estado, 409);
    afirmar.deepEqual(await foto(), antes);
    await conciliar();
  });

  await contexto.test('CP-09: se rechaza transferir hacia la misma cuenta', async () => {
    const antes = await foto();
    afirmar.equal((await transferir('1.00', cuentaOrigen)).estado, 400);
    afirmar.deepEqual(await foto(), antes);
  });

  await contexto.test('CP-10: retiro por PIN con un débito y un comprobante', async () => {
    const clave = randomUUID();
    const antes = await foto();
    const resultado = await retirar('50.25', clave);
    afirmar.equal(resultado.estado, 201);
    const repetido = await retirar('50.25', clave);
    afirmar.equal(repetido.estado, 200);
    afirmar.deepEqual(repetido.datos, resultado.datos);
    const despues = await foto();
    afirmar.equal(despues.movimientos, antes.movimientos + 1);
    afirmar.equal(despues.comprobantes, antes.comprobantes + 1);
    afirmar.equal(despues.saldoGlobal, '1400.25');
    await verificarModulos('750.00', '550.25', 'RETIRO', resultado.datos.idMovimiento);
  });

  await contexto.test('una ráfaga de los tres módulos espera conexiones y conserva el historial', async () => {
    const antes = await foto();
    const ocupadas = [];
    let solicitudes = [];
    let encolada = false;

    const cancelacion = new AbortController();
    try {
      for (let indice = 0; indice < 4; indice++) ocupadas.push(await grupo.getConnection());
      const primeraEnCola = once(grupo, 'enqueue', { signal: cancelacion.signal }).then(() => true, () => false);
      solicitudes = [
        depositar('5.00'), depositar('5.00'),
        transferir('1.00'), transferir('1.00'),
        retirar('2.50'), retirar('2.50')
      ];
      encolada = await Promise.race([primeraEnCola, Promise.race(solicitudes).then(() => false)]);
    } finally {
      cancelacion.abort();
      for (const ocupada of ocupadas) ocupada.release();
    }

    const respuestas = await Promise.all(solicitudes);
    afirmar.deepEqual(respuestas.map((r) => r.estado), [201, 201, 201, 201, 201, 201],
      'Las operaciones deben esperar una conexión disponible.');
    afirmar.ok(encolada, 'La prueba debe observar congestión del grupo de conexiones.');
    const despues = await foto();
    afirmar.equal(despues.movimientos, antes.movimientos + 8);
    afirmar.equal(despues.transferencias, antes.transferencias + 2);
    afirmar.equal(despues.comprobantes, antes.comprobantes + 2);
    afirmar.equal(despues.saldoGlobal, '1405.25');
    afirmar.equal((await pedir('/api/atm/saldo', { cookie: cajero })).datos.saldo, '753.00');
    afirmar.equal((await pedir('/api/banca/cuenta', { cookie: receptor })).datos.saldo, '552.25');
    await conciliar();
  });

  await contexto.test('la comprobación de salud responde aunque la cola SQL esté frenada', async () => {
    const ocupadas = [];
    try {
      for (let indice = 0; indice < 4; indice++) ocupadas.push(await grupo.getConnection());
      const respuesta = await fetch(origen + '/api/salud', { signal: AbortSignal.timeout(5000) });
      afirmar.equal(respuesta.status, 503);
      afirmar.deepEqual((await respuesta.json()).datos, { servidor: 'disponible', baseDatos: 'no_disponible' });
    } finally {
      for (const ocupada of ocupadas) ocupada.release();
    }
    afirmar.equal((await pedir('/api/salud')).estado, 200);
  });

  await contexto.test('un rol o una sesión incorrecta no accede a datos de otro canal o titular', async () => {
    afirmar.equal((await pedir('/api/admin/clientes', { cookie: banca })).estado, 403);
    afirmar.equal((await pedir('/api/banca/cuenta', { cookie: admin })).estado, 403);
    afirmar.equal((await pedir('/api/banca/cuenta?idCuenta=2', { cookie: banca })).estado, 404);
    afirmar.equal((await pedir('/api/banca/movimientos?idCuenta=2', { cookie: banca })).estado, 404);
    afirmar.equal((await pedir('/api/atm/saldo', { cookie: banca })).estado, 401);
    afirmar.equal((await pedir('/api/auth/sesion', { cookie: cajero })).estado, 401);
    afirmar.equal((await pedir('/api/atm/saldo?idCuenta=2', { cookie: cajero })).datos.numeroCuenta, cuentaOrigen);
    afirmar.equal((await pedir('/api/admin/consignar', {
      metodo: 'POST', cookie: admin, origenPeticion: 'https://ajeno.example.test',
      cuerpo: { numeroCuenta: cuentaOrigen, monto: '1.00', descripcion: 'Prueba de origen' }
    })).estado, 403);
    afirmar.equal((await pedir('/api/atm/retirar', {
      metodo: 'POST', cookie: cajero, origenPeticion: 'https://ajeno.example.test', cuerpo: { monto: '1.00' }
    })).estado, 403);
    afirmar.equal((await pedir('/api/banca/cuenta', { cookie: banca })).cache, 'no-store');
    for (const recurso of ['/.env', '/database.sql', '/migraciones/006_atm.sql', '/paginas/panelAdministrador.html']) {
      afirmar.equal((await pedir(recurso)).estado, 404);
    }
  });

  await contexto.test('la cuenta SQL del servidor tiene permisos acotados', { skip: !usuarioApp }, async () => {
    const sql = await grupo.getConnection();
    const denegado = (error) => ['ER_COLUMNACCESS_DENIED_ERROR', 'ER_TABLEACCESS_DENIED_ERROR'].includes(error.code);
    try {
      await sql.beginTransaction();
      await afirmar.rejects(sql.execute('UPDATE cuentas SET numero_cuenta = ? WHERE id_cuenta = ?', ['0000000000', 1]), denegado);
      await afirmar.rejects(sql.execute('DELETE FROM cuentas WHERE id_cuenta = ?', [3]), denegado);
      await afirmar.rejects(sql.execute('DELETE FROM movimientos WHERE id_movimiento = ?', [1]), denegado);
    } finally {
      await sql.rollback();
      sql.release();
    }
  });

  await contexto.test('el historial confirmado es inmutable también en SQL', async () => {
    const antes = await foto();
    await conexion.beginTransaction();
    try {
      for (const sql of [
        'UPDATE movimientos SET descripcion = ? WHERE id_movimiento = 1',
        'UPDATE transferencias SET descripcion = ? WHERE id_transferencia = 1'
      ]) await afirmar.rejects(conexion.execute(sql, ['Prueba aislada']), { sqlState: '45000' });
      await afirmar.rejects(conexion.execute('DELETE FROM movimientos WHERE id_movimiento = ?', [1]), { sqlState: '45000' });
      await afirmar.rejects(conexion.execute('DELETE FROM transferencias WHERE id_transferencia = ?', [1]), { sqlState: '45000' });
    } finally {
      await conexion.rollback();
    }
    afirmar.deepEqual(await foto(), antes);
    await conciliar();
  });

  await contexto.test('los tres módulos revierten su operación cuando falla el historial', async () => {
    const antes = await foto();
    await conexion.query(`
      CREATE TRIGGER fallo_historial_integracion BEFORE INSERT ON movimientos FOR EACH ROW
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Marcador interno de integración'
    `);
    for (const operar of [depositar, transferir, retirar]) {
      const resultado = await operar('2.00');
      afirmar.equal(resultado.estado, 500);
      afirmar.equal(resultado.mensaje, 'Ocurrió un error interno.');
      afirmar.deepEqual(await foto(), antes);
    }
    await conciliar();
  });


  await contexto.test('un cambio de estado administrativo revoca el acceso de sesiones ya abiertas', async () => {
    const antes = await foto();
    const cambio = await pedir('/api/admin/clientes/2', {
      metodo: 'PUT', cookie: admin, cuerpo: { estadoUsuario: 'INACTIVO' }
    });
    afirmar.equal(cambio.estado, 200);
    afirmar.equal((await pedir('/api/banca/cuenta', { cookie: banca })).estado, 403);
    afirmar.equal((await retirar('1.00')).estado, 403);
    afirmar.equal((await pedir('/api/banca/movimientos', { cookie: banca })).estado, 401);
    afirmar.equal((await pedir('/api/atm/saldo', { cookie: cajero })).estado, 401);
    afirmar.deepEqual(await foto(), antes);
  });
});
