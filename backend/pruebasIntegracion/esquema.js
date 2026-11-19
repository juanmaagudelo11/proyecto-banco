const { test } = require('node:test');
const afirmar = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const ruta = require('node:path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const { buscarUsuarioPorId } = require('../src/modelos/usuario');
const { listarCuentasPorUsuario } = require('../src/modelos/cuenta');
const { listarMovimientosPorCuenta } = require('../src/modelos/movimiento');
const { buscarTransferenciaPorId } = require('../src/modelos/transferencia');

test('importa y verifica database.sql en MySQL 8.4 o MariaDB 10.4', async (contexto) => {
  const {
    MYSQL_PRUEBA_BASE: base,
    MYSQL_PRUEBA_PUERTO: puerto = '3306',
    MYSQL_PRUEBA_USUARIO: usuario,
    MYSQL_PRUEBA_CONTRASENA: contrasena
  } = process.env;

  afirmar.match(base ?? '', /^simulador_fase2_prueba(?:_[a-z0-9]+)*$/,
    'Indica una base MySQL vacía y exclusiva para las pruebas de la fase 2.');
  afirmar.ok(usuario && contrasena, 'Configura el usuario y la contraseña de MySQL de prueba.');

  const conexion = await mysql.createConnection({
    host: '127.0.0.1',
    port: Number(puerto),
    database: base,
    user: usuario,
    password: contrasena,
    multipleStatements: true
  });
  contexto.after(() => conexion.end());

  const [[servidor]] = await conexion.execute('SELECT VERSION() AS version');
  afirmar.match(servidor.version, /^(?:8\.4\.\d+|10\.4\.\d+-MariaDB)/);
  const esMariaDb = servidor.version.includes('MariaDB');
  const errorRestriccion = esMariaDb ? 4025 : 3819;
  const [[{ total }]] = await conexion.execute(
    'SELECT COUNT(*) AS total FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()'
  );
  afirmar.equal(total, 0, 'La base de prueba debe estar vacía antes de importar.');

  const esquema = await readFile(ruta.resolve(__dirname, '../../database.sql'), 'utf8');
  await conexion.query(esquema);

  await contexto.test('importa los conteos, roles, estados y tipos monetarios esperados', async () => {
    const [[conteos]] = await conexion.query(`
      SELECT (SELECT COUNT(*) FROM usuarios WHERE rol = 'ADMIN' AND estado = 'ACTIVO') AS admins,
             (SELECT COUNT(*) FROM usuarios WHERE rol = 'CLIENTE') AS clientes,
             (SELECT COUNT(*) FROM usuarios WHERE rol = 'CLIENTE' AND estado = 'BLOQUEADO') AS bloqueados,
             (SELECT COUNT(*) FROM cuentas) AS cuentas,
             (SELECT COUNT(*) FROM movimientos) AS movimientos,
             (SELECT COUNT(*) FROM transferencias) AS transferencias
    `);
    afirmar.deepEqual(conteos, {
      admins: 1, clientes: 3, bloqueados: 1, cuentas: 3, movimientos: 5, transferencias: 1
    });

    const [columnasMonetarias] = await conexion.query(`
      SELECT NUMERIC_PRECISION AS precision_decimal, NUMERIC_SCALE AS escala
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME IN ('saldo', 'monto', 'saldo_anterior', 'saldo_resultante')
    `);
    afirmar.equal(columnasMonetarias.length, 5);
    for (const columna of columnasMonetarias) {
      afirmar.equal(Number(columna.precision_decimal), 15);
      afirmar.equal(Number(columna.escala), 2);
    }
  });

  await contexto.test('los siete hashes persistidos tienen formato y coste de bcrypt y son únicos', async () => {
    const [filas] = await conexion.query(`
      SELECT contrasena AS hash FROM usuarios
      UNION ALL SELECT pin_atm AS hash FROM cuentas
    `);
    afirmar.equal(filas.length, 7);
    const hashes = new Set();
    for (const { hash } of filas) {
      afirmar.ok(/^\$2b\$12\$[./A-Za-z0-9]{53}$/.test(hash), 'Hash bcrypt malformado.');
      afirmar.equal(bcrypt.getRounds(hash), 12);
      hashes.add(hash);
    }
    afirmar.equal(hashes.size, 7);
  });

  await contexto.test('rechaza duplicados de documento, correo y número de cuenta', async () => {
    const insercionUsuario = `INSERT INTO usuarios (nombre_completo, documento, correo, telefono, contrasena)
      SELECT nombre_completo, ?, ?, telefono, contrasena FROM usuarios WHERE id_usuario = 2`;
    await afirmar.rejects(conexion.execute(insercionUsuario, ['DEMO-002', 'alterno@example.test']), {
      code: 'ER_DUP_ENTRY'
    });
    await afirmar.rejects(conexion.execute(insercionUsuario, ['DEMO-099', 'CLIENTE1@example.test']), {
      code: 'ER_DUP_ENTRY'
    });
    await afirmar.rejects(conexion.execute(`
      INSERT INTO cuentas (id_usuario, numero_cuenta, pin_atm)
      SELECT id_usuario, numero_cuenta, pin_atm FROM cuentas WHERE id_cuenta = ?
    `, [1]), { code: 'ER_DUP_ENTRY' });
  });

  await contexto.test('rechaza referencias huérfanas y acepta otra cuenta del mismo titular', async () => {
    const insercionCuenta = `INSERT INTO cuentas (id_usuario, numero_cuenta, pin_atm)
      SELECT ?, ?, pin_atm FROM cuentas WHERE id_cuenta = 1`;
    await conexion.beginTransaction();
    try {
      await conexion.execute(insercionCuenta, [2, '9000000098']);
      const cuentas = await listarCuentasPorUsuario(conexion, 2);
      afirmar.equal(cuentas.length, 2);
      afirmar.equal(cuentas[1].saldo, '0.00');
    } finally {
      await conexion.rollback();
    }
    await afirmar.rejects(conexion.execute(insercionCuenta, [999, '9000000099']), {
      code: 'ER_NO_REFERENCED_ROW_2'
    });
    const insercionTransferencia =
      'INSERT INTO transferencias (id_cuenta_origen, id_cuenta_destino, monto) VALUES (?, ?, 1.00)';
    for (const cuentas of [[999, 1], [1, 999]]) {
      await afirmar.rejects(conexion.execute(insercionTransferencia, cuentas), { code: 'ER_NO_REFERENCED_ROW_2' });
    }
    await afirmar.rejects(conexion.execute(`
      INSERT INTO movimientos (id_cuenta, tipo_movimiento, monto, saldo_anterior, saldo_resultante)
      VALUES (?, 'CONSIGNACION', 1.00, 0.00, 1.00)
    `, [999]), { code: 'ER_NO_REFERENCED_ROW_2' });
    await afirmar.rejects(conexion.execute(`
      INSERT INTO movimientos (id_cuenta, id_transferencia, tipo_movimiento, monto, saldo_anterior, saldo_resultante)
      VALUES (1, ?, 'TRANSFERENCIA_RECIBIDA', 1.00, 0.00, 1.00)
    `, [999]), { code: 'ER_NO_REFERENCED_ROW_2' });
  });

  await contexto.test('rechaza saldos negativos y operaciones con importes o vínculos inválidos', async () => {
    const restricciones = [
      ['UPDATE cuentas SET saldo = ? WHERE id_cuenta = 1', ['-0.01']],
      ['INSERT INTO transferencias (id_cuenta_origen, id_cuenta_destino, monto) VALUES (1, ?, ?)', [1, '1.00']],
      ['INSERT INTO transferencias (id_cuenta_origen, id_cuenta_destino, monto) VALUES (1, ?, ?)', [2, '0.00']]
    ];
    const insercionMovimiento = `INSERT INTO movimientos
      (id_cuenta, id_transferencia, tipo_movimiento, monto, saldo_anterior, saldo_resultante)
      VALUES (1, ?, ?, ?, ?, ?)`;
    restricciones.push(
      [insercionMovimiento, [null, 'CONSIGNACION', '0.00', '0.00', '0.00']],
      [insercionMovimiento, [null, 'RETIRO', '1.00', '0.00', '-1.00']],
      [insercionMovimiento, [null, 'CONSIGNACION', '1.00', '0.00', '2.00']],
      [insercionMovimiento, [null, 'TRANSFERENCIA_ENVIADA', '1.00', '5.00', '4.00']]
    );
    for (const [consulta, parametros] of restricciones) {
      await afirmar.rejects(conexion.execute(consulta, parametros), { errno: errorRestriccion });
    }
    await afirmar.rejects(
      conexion.execute(insercionMovimiento, [1, 'TRANSFERENCIA_ENVIADA', '1.00', '5.00', '4.00']),
      { code: 'ER_DUP_ENTRY' }
    );
  });

  await contexto.test('protege los registros históricos de modificaciones', async () => {
    for (const consulta of [
      'UPDATE movimientos SET descripcion = ? WHERE id_movimiento = 1',
      'UPDATE transferencias SET descripcion = ? WHERE id_transferencia = 1'
    ]) {
      await afirmar.rejects(conexion.execute(consulta, ['Cambio de prueba']), { sqlState: '45000' });
    }
    for (const consulta of [
      'DELETE FROM movimientos WHERE id_movimiento = ?',
      'DELETE FROM transferencias WHERE id_transferencia = ?'
    ]) {
      await conexion.beginTransaction();
      try {
        await afirmar.rejects(conexion.execute(consulta, [1]), { sqlState: '45000' });
      } finally {
        await conexion.rollback();
      }
    }
  });

  await contexto.test('los modelos concilian saldos, enlazan ambos lados de la transferencia y omiten hashes', async () => {
    afirmar.equal(await buscarUsuarioPorId(conexion, 999), null);
    afirmar.equal(await buscarTransferenciaPorId(conexion, 999), null);
    afirmar.deepEqual(await listarCuentasPorUsuario(conexion, 1), []);
    afirmar.deepEqual(await listarMovimientosPorCuenta(conexion, 999), []);

    const saldosEsperados = ['850.00', '400.00', '75.00'];
    const lados = new Map();
    for (const [indice, saldo] of saldosEsperados.entries()) {
      const idUsuario = indice + 2;
      const usuario = await buscarUsuarioPorId(conexion, idUsuario);
      afirmar.equal(usuario.rol, 'CLIENTE');
      afirmar.ok(!Object.hasOwn(usuario, 'contrasena'));
      const [cuenta] = await listarCuentasPorUsuario(conexion, idUsuario);
      afirmar.equal(cuenta.id_usuario, idUsuario);
      afirmar.equal(cuenta.estado, usuario.estado);
      afirmar.ok(!Object.hasOwn(cuenta, 'pin_atm'));
      afirmar.equal(cuenta.saldo, saldo);

      const movimientos = await listarMovimientosPorCuenta(conexion, cuenta.id_cuenta);
      let saldoAnterior = '0.00';
      for (const movimiento of movimientos.toReversed()) {
        afirmar.equal(movimiento.id_cuenta, cuenta.id_cuenta);
        afirmar.equal(movimiento.saldo_anterior, saldoAnterior);
        saldoAnterior = movimiento.saldo_resultante;
        if (movimiento.id_transferencia !== null) {
          lados.set(movimiento.tipo_movimiento, movimiento);
        }
      }
      afirmar.equal(movimientos.at(-1).tipo_movimiento, 'CONSIGNACION');
      afirmar.equal(saldoAnterior, cuenta.saldo);
    }

    const transferencia = await buscarTransferenciaPorId(conexion, 1);
    afirmar.equal(lados.size, 2);
    for (const [tipo, cuenta] of [
      ['TRANSFERENCIA_ENVIADA', transferencia.id_cuenta_origen],
      ['TRANSFERENCIA_RECIBIDA', transferencia.id_cuenta_destino]
    ]) {
      const movimiento = lados.get(tipo);
      afirmar.equal(movimiento.id_transferencia, transferencia.id_transferencia);
      afirmar.equal(movimiento.id_cuenta, cuenta);
      afirmar.equal(movimiento.monto, transferencia.monto);
    }
  });
});
