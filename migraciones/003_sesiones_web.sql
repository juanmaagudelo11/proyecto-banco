-- Selecciona primero la base que contiene las tablas de la fase 2.
CREATE TABLE IF NOT EXISTS sesiones_web (
  huella BINARY(32) NOT NULL PRIMARY KEY,
  id_usuario INT UNSIGNED NOT NULL,
  expira_en DATETIME(3) NOT NULL,
  INDEX idx_sesiones_web_expiracion (expira_en),
  CONSTRAINT fk_sesiones_web_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios (id_usuario)
) ENGINE=InnoDB;
