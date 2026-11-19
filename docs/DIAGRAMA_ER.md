# Diagrama entidad-relación

Esquema final de la base de datos del Simulador Bancario Web, incluyendo las tablas base y las agregadas por las migraciones (sesiones web, sesiones ATM y retiros ATM).

```mermaid
erDiagram
  USUARIOS ||--o{ CUENTAS : tiene
  USUARIOS ||--o{ SESIONES_WEB : abre
  CUENTAS ||--o{ MOVIMIENTOS : registra
  CUENTAS ||--o{ SESIONES_ATM : abre
  CUENTAS ||--o{ TRANSFERENCIAS : origina
  CUENTAS ||--o{ TRANSFERENCIAS : recibe
  TRANSFERENCIAS ||--o{ MOVIMIENTOS : genera
  MOVIMIENTOS ||--o| RETIROS_ATM : respalda

  USUARIOS {
    int id_usuario PK
    string nombre_completo
    string documento UK
    string correo UK
    string telefono
    string contrasena
    enum rol
    enum estado
  }
  CUENTAS {
    int id_cuenta PK
    int id_usuario FK
    string numero_cuenta UK
    enum tipo_cuenta
    decimal saldo
    string pin_atm
    enum estado
  }
  TRANSFERENCIAS {
    int id_transferencia PK
    int id_cuenta_origen FK
    int id_cuenta_destino FK
    decimal monto
    string descripcion
  }
  MOVIMIENTOS {
    int id_movimiento PK
    int id_cuenta FK
    int id_transferencia FK
    enum tipo_movimiento
    decimal monto
    decimal saldo_anterior
    decimal saldo_resultante
  }
  SESIONES_WEB {
    binary huella PK
    int id_usuario FK
    datetime expira_en
  }
  SESIONES_ATM {
    binary huella PK
    int id_cuenta FK
    datetime expira_en
  }
  RETIROS_ATM {
    binary huella_solicitud PK
        int id_movimiento FK
  }
```