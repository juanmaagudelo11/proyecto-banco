async function consultarMetricas(conexion) {
  const [[metricas]] = await conexion.execute(`
    SELECT
      (SELECT COUNT(*) FROM usuarios WHERE rol = 'CLIENTE') AS clientesTotales,
      (SELECT COUNT(*) FROM usuarios WHERE rol = 'CLIENTE' AND estado = 'BLOQUEADO') AS clientesBloqueados,
      COUNT(CASE WHEN c.estado = 'ACTIVO' AND u.estado = 'ACTIVO' THEN 1 END) AS cuentasActivas,
      COUNT(CASE WHEN c.estado = 'BLOQUEADO' THEN 1 END) AS cuentasBloqueadas,
      COALESCE(SUM(c.saldo), 0.00) AS saldoGlobal
    FROM cuentas AS c JOIN usuarios AS u ON u.id_usuario = c.id_usuario
  `);
  return metricas;
}

async function buscarClientes(conexion, buscar, limite, desplazamiento) {
  const [clientes] = await conexion.execute(`
    SELECT u.id_usuario AS idUsuario, u.nombre_completo AS nombreCompleto,
           u.documento, u.correo, u.telefono, u.estado AS estadoUsuario
    FROM usuarios AS u
    WHERE u.rol = 'CLIENTE' AND (? = '' OR INSTR(u.nombre_completo, ?) > 0
      OR INSTR(u.documento, ?) > 0 OR INSTR(u.correo, ?) > 0 OR EXISTS (
        SELECT 1 FROM cuentas AS c WHERE c.id_usuario = u.id_usuario AND INSTR(c.numero_cuenta, ?) > 0
      ))
    ORDER BY u.id_usuario DESC LIMIT ? OFFSET ?
  `, [buscar, buscar, buscar, buscar, buscar, limite, desplazamiento]);
  return clientes;
}

async function listarCuentasDeClientes(conexion, clientes) {
  if (!clientes.length) return [];
  const parametros = clientes.map(() => '?').join(', ');
  const [cuentas] = await conexion.execute(`
    SELECT id_usuario AS idUsuario, id_cuenta AS idCuenta, numero_cuenta AS numeroCuenta,
           tipo_cuenta AS tipoCuenta, saldo, estado AS estadoCuenta
    FROM cuentas WHERE id_usuario IN (${parametros}) ORDER BY id_cuenta
  `, clientes.map((cliente) => cliente.idUsuario));
  return cuentas;
}

async function crearCliente(conexion, datos, hash) {
  const [resultado] = await conexion.execute(`
    INSERT INTO usuarios (nombre_completo, documento, correo, telefono, contrasena, rol, estado)
    VALUES (?, ?, ?, ?, ?, 'CLIENTE', 'ACTIVO')
  `, [datos.nombreCompleto, datos.documento, datos.correo, datos.telefono, hash]);
  return resultado.insertId;
}

async function crearCuenta(conexion, idUsuario, numeroCuenta, tipo, saldo, hash) {
  const [resultado] = await conexion.execute(`
    INSERT INTO cuentas (id_usuario, numero_cuenta, tipo_cuenta, saldo, pin_atm, estado)
    VALUES (?, ?, ?, ?, ?, 'ACTIVO')
  `, [idUsuario, numeroCuenta, tipo, saldo, hash]);
  return resultado.insertId;
}

async function actualizarCliente(conexion, idUsuario, cambios) {
  await conexion.execute(`
    UPDATE usuarios SET nombre_completo = COALESCE(?, nombre_completo),
      correo = COALESCE(?, correo), telefono = COALESCE(?, telefono), estado = COALESCE(?, estado)
    WHERE id_usuario = ? AND rol = 'CLIENTE'
  `, [cambios.nombreCompleto, cambios.correo, cambios.telefono, cambios.estadoUsuario, idUsuario]);
}

async function actualizarEstadoCuenta(conexion, idCuenta, idUsuario, estado) {
  await conexion.execute(
    'UPDATE cuentas SET estado = ? WHERE id_cuenta = ? AND id_usuario = ?', [estado, idCuenta, idUsuario]
  );
}

async function registrarConsignacion(conexion, idCuenta, monto, saldoAnterior, saldoResultante, descripcion) {
  const [resultado] = await conexion.execute(`
    INSERT INTO movimientos (id_cuenta, tipo_movimiento, monto, saldo_anterior, saldo_resultante, descripcion)
    VALUES (?, 'CONSIGNACION', ?, ?, ?, ?)
  `, [idCuenta, monto, saldoAnterior, saldoResultante, descripcion]);
  return resultado.insertId;
}

async function listarHistorial(conexion, filtros, limite, desplazamiento) {
  const [filas] = await conexion.execute(`
    SELECT m.id_movimiento AS idMovimiento, c.numero_cuenta AS numeroCuenta,
           m.tipo_movimiento AS tipoMovimiento, m.monto, m.saldo_anterior AS saldoAnterior,
           m.saldo_resultante AS saldoResultante, m.descripcion, m.fecha_movimiento AS fecha
    FROM movimientos AS m JOIN cuentas AS c ON c.id_cuenta = m.id_cuenta
    WHERE (? IS NULL OR m.fecha_movimiento >= ?)
      AND (? IS NULL OR m.fecha_movimiento < DATE_ADD(?, INTERVAL 1 DAY))
      AND (? IS NULL OR m.tipo_movimiento = ?)
      AND (? IS NULL OR c.numero_cuenta = ?)
    ORDER BY m.fecha_movimiento DESC, m.id_movimiento DESC LIMIT ? OFFSET ?
  `, [filtros.desde, filtros.desde, filtros.hasta, filtros.hasta, filtros.tipo,
    filtros.tipo, filtros.numeroCuenta, filtros.numeroCuenta, limite, desplazamiento]);
  return filas;
}

module.exports = {
  consultarMetricas, buscarClientes, listarCuentasDeClientes, crearCliente, crearCuenta,
  actualizarCliente, actualizarEstadoCuenta, registrarConsignacion, listarHistorial
};
