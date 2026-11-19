-- Selecciona primero la base del simulador.
CREATE TABLE IF NOT EXISTS sesiones_atm (
  huella BINARY(32) NOT NULL PRIMARY KEY,
  id_cuenta INT UNSIGNED NOT NULL,
  expira_en DATETIME(3) NOT NULL,
  INDEX idx_sesiones_atm_expiracion (expira_en),
  CONSTRAINT fk_sesiones_atm_cuenta FOREIGN KEY (id_cuenta) REFERENCES cuentas (id_cuenta)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS retiros_atm (
  huella_solicitud BINARY(32) NOT NULL PRIMARY KEY,
  id_movimiento INT UNSIGNED NOT NULL,
  CONSTRAINT uq_retiros_atm_movimiento UNIQUE (id_movimiento),
  CONSTRAINT fk_retiros_atm_movimiento FOREIGN KEY (id_movimiento) REFERENCES movimientos (id_movimiento)
) ENGINE=InnoDB;
