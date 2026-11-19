-- Ejecutar una sola vez en una base MySQL 8.4 o MariaDB 10.4 vacía y seleccionada.
SET NAMES utf8mb4;

CREATE TABLE usuarios (
  id_usuario INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre_completo VARCHAR(120) NOT NULL,
  documento VARCHAR(20) NOT NULL,
  correo VARCHAR(100) NOT NULL,
  telefono VARCHAR(20) NOT NULL,
  contrasena VARCHAR(255) NOT NULL,
  rol ENUM('ADMIN', 'CLIENTE') NOT NULL DEFAULT 'CLIENTE',
  estado ENUM('ACTIVO', 'INACTIVO', 'BLOQUEADO') NOT NULL DEFAULT 'ACTIVO',
  fecha_registro TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_usuarios_documento UNIQUE (documento),
  CONSTRAINT uq_usuarios_correo UNIQUE (correo),
  CONSTRAINT ck_usuarios_rol CHECK (rol IN ('ADMIN', 'CLIENTE')),
  CONSTRAINT ck_usuarios_estado CHECK (estado IN ('ACTIVO', 'INACTIVO', 'BLOQUEADO'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE cuentas (
  id_cuenta INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT UNSIGNED NOT NULL,
  numero_cuenta VARCHAR(20) NOT NULL,
  tipo_cuenta ENUM('AHORROS', 'CORRIENTE') NOT NULL DEFAULT 'AHORROS',
  saldo DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  pin_atm VARCHAR(255) NOT NULL,
  estado ENUM('ACTIVO', 'INACTIVO', 'BLOQUEADO') NOT NULL DEFAULT 'ACTIVO',
  fecha_registro TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cuentas_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios (id_usuario),
  CONSTRAINT uq_cuentas_numero UNIQUE (numero_cuenta),
  CONSTRAINT ck_cuentas_tipo CHECK (tipo_cuenta IN ('AHORROS', 'CORRIENTE')),
  CONSTRAINT ck_cuentas_saldo CHECK (saldo >= 0),
  CONSTRAINT ck_cuentas_estado CHECK (estado IN ('ACTIVO', 'INACTIVO', 'BLOQUEADO'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE transferencias (
  id_transferencia INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_cuenta_origen INT UNSIGNED NOT NULL,
  id_cuenta_destino INT UNSIGNED NOT NULL,
  monto DECIMAL(15,2) NOT NULL,
  descripcion VARCHAR(255),
  fecha_transferencia TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_transferencias_origen FOREIGN KEY (id_cuenta_origen) REFERENCES cuentas (id_cuenta),
  CONSTRAINT fk_transferencias_destino FOREIGN KEY (id_cuenta_destino) REFERENCES cuentas (id_cuenta),
  CONSTRAINT ck_transferencias_cuentas_distintas CHECK (id_cuenta_origen <> id_cuenta_destino),
  CONSTRAINT ck_transferencias_monto CHECK (monto > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE movimientos (
  id_movimiento INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_cuenta INT UNSIGNED NOT NULL,
  id_transferencia INT UNSIGNED,
  tipo_movimiento ENUM('CONSIGNACION', 'RETIRO', 'TRANSFERENCIA_ENVIADA', 'TRANSFERENCIA_RECIBIDA') NOT NULL,
  monto DECIMAL(15,2) NOT NULL,
  saldo_anterior DECIMAL(15,2) NOT NULL,
  saldo_resultante DECIMAL(15,2) NOT NULL,
  descripcion VARCHAR(255),
  fecha_movimiento TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_movimientos_cuenta_fecha (id_cuenta, fecha_movimiento, id_movimiento),
  CONSTRAINT fk_movimientos_cuenta FOREIGN KEY (id_cuenta) REFERENCES cuentas (id_cuenta),
  CONSTRAINT fk_movimientos_transferencia FOREIGN KEY (id_transferencia) REFERENCES transferencias (id_transferencia),
  CONSTRAINT uq_movimientos_transferencia_tipo UNIQUE (id_transferencia, tipo_movimiento),
  CONSTRAINT ck_movimientos_monto CHECK (monto > 0),
  CONSTRAINT ck_movimientos_saldos CHECK (saldo_anterior >= 0 AND saldo_resultante >= 0),
  CONSTRAINT ck_movimientos_operacion CHECK (
    (tipo_movimiento = 'CONSIGNACION' AND id_transferencia IS NULL AND saldo_resultante = saldo_anterior + monto)
    OR (tipo_movimiento = 'RETIRO' AND id_transferencia IS NULL AND saldo_resultante = saldo_anterior - monto)
    OR (tipo_movimiento = 'TRANSFERENCIA_RECIBIDA' AND id_transferencia IS NOT NULL
        AND saldo_resultante = saldo_anterior + monto)
    OR (tipo_movimiento = 'TRANSFERENCIA_ENVIADA' AND id_transferencia IS NOT NULL
        AND saldo_resultante = saldo_anterior - monto)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TRIGGER impedir_edicion_movimiento BEFORE UPDATE ON movimientos FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El registro de movimiento es inmutable';
CREATE TRIGGER impedir_borrado_movimiento BEFORE DELETE ON movimientos FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El registro de movimiento es inmutable';
CREATE TRIGGER impedir_edicion_transferencia BEFORE UPDATE ON transferencias FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El registro de transferencia es inmutable';
CREATE TRIGGER impedir_borrado_transferencia BEFORE DELETE ON transferencias FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El registro de transferencia es inmutable';

START TRANSACTION;

-- Identidades ficticias. Los hashes iniciales se generaron con valores aleatorios.
INSERT INTO usuarios (id_usuario, nombre_completo, documento, correo, telefono, contrasena, rol, estado) VALUES
  (1, 'Administración Demo', 'DEMO-001', 'admin@example.test', '0000000001', /* bcrypt:ADMIN */ '$2b$12$1JxgNRzsvwFyWvZZi3E8XeUHQVpozECtNAXr3X/UNGfXcuYH7qJbq', 'ADMIN', 'ACTIVO'),
  (2, 'Cliente Demo Uno', 'DEMO-002', 'cliente1@example.test', '0000000002', /* bcrypt:CLIENTE_1 */ '$2b$12$gmLt7WvGoIHn/zO.AexJleGAaa4lTqU/kYoASWFDALijYRf2fWUmi', 'CLIENTE', 'ACTIVO'),
  (3, 'Cliente Demo Dos', 'DEMO-003', 'cliente2@example.test', '0000000003', /* bcrypt:CLIENTE_2 */ '$2b$12$B6DBV1X4/gzN.5YeRrZYWu5qZI/IcCo256wsGkkc.IqawSBaNaeai', 'CLIENTE', 'ACTIVO'),
  (4, 'Cliente Demo Tres', 'DEMO-004', 'cliente3@example.test', '0000000004', /* bcrypt:CLIENTE_3 */ '$2b$12$4DZem755y8f4noUJwrBtLez27kkZjoL/8CoAuaxSo9JOlCNxdjvIe', 'CLIENTE', 'BLOQUEADO');

INSERT INTO cuentas (id_cuenta, id_usuario, numero_cuenta, tipo_cuenta, saldo, pin_atm, estado) VALUES
  (1, 2, '9000000001', 'AHORROS', 850.00, /* bcrypt:PIN_1 */ '$2b$12$3fgwuEdKtlEf4/xEqMEsweNG.HRVIEBki96NeLUv76JS/0.QDRXcS', 'ACTIVO'),
  (2, 3, '9000000002', 'CORRIENTE', 400.00, /* bcrypt:PIN_2 */ '$2b$12$pj45MM0hVDSy69URxYq8T.OvqdAFnJxWkabkoVoFkbGM/gonEsD8m', 'ACTIVO'),
  (3, 4, '9000000003', 'AHORROS', 75.00, /* bcrypt:PIN_3 */ '$2b$12$/SjfFtJMsPY2ER8twRmdv.dDDqiQhmV7wowsr/4mc/l408rKPkjMW', 'BLOQUEADO');

INSERT INTO transferencias (id_transferencia, id_cuenta_origen, id_cuenta_destino, monto, descripcion, fecha_transferencia)
VALUES (1, 1, 2, 150.00, 'Transferencia de demostración', '2025-01-02 12:00:00');

INSERT INTO movimientos
  (id_cuenta, id_transferencia, tipo_movimiento, monto, saldo_anterior, saldo_resultante, descripcion, fecha_movimiento)
VALUES
  (1, NULL, 'CONSIGNACION', 1000.00, 0.00, 1000.00, 'Consignación de apertura', '2025-01-01 12:00:00'),
  (2, NULL, 'CONSIGNACION', 250.00, 0.00, 250.00, 'Consignación de apertura', '2025-01-01 12:00:00'),
  (3, NULL, 'CONSIGNACION', 75.00, 0.00, 75.00, 'Consignación de apertura', '2025-01-01 12:00:00'),
  (1, 1, 'TRANSFERENCIA_ENVIADA', 150.00, 1000.00, 850.00, 'Transferencia de demostración', '2025-01-02 12:00:00'),
  (2, 1, 'TRANSFERENCIA_RECIBIDA', 150.00, 250.00, 400.00, 'Transferencia de demostración', '2025-01-02 12:00:00');

COMMIT;
