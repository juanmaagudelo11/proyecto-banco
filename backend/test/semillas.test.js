const { test } = require('node:test');
const afirmar = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { readFile } = require('node:fs/promises');
const ruta = require('node:path');
const bcrypt = require('bcrypt');
const { generarSqlConSemillas } = require('../herramientas/generarSemillas');

const rutaSql = ruta.resolve(__dirname, '../../database.sql');

function crearCredencialesFicticias() {
  return {
    ADMIN: randomBytes(20).toString('hex'),
    CLIENTE_1: randomBytes(20).toString('hex'),
    CLIENTE_2: randomBytes(20).toString('hex'),
    CLIENTE_3: randomBytes(20).toString('hex'),
    PIN_1: String(7).padStart(4, '0'),
    PIN_2: String(42).padStart(4, '0'),
    PIN_3: String(842).padStart(4, '0')
  };
}

test('regenera siete hashes comprobables y preserva el cero inicial del PIN', async () => {
  const esquema = await readFile(rutaSql, 'utf8');
  const credenciales = crearCredencialesFicticias();
  const sql = await generarSqlConSemillas(esquema, credenciales);
  const hashes = [...sql.matchAll(/\/\* bcrypt:([A-Z0-9_]+) \*\/ '(\$2b\$12\$[./A-Za-z0-9]{53})'/g)];
  afirmar.equal(hashes.length, 7);

  for (const [, campo, hash] of hashes) {
    afirmar.ok(!esquema.includes(hash));
    afirmar.ok(await bcrypt.compare(credenciales[campo], hash));
    afirmar.ok(!sql.includes(`'${credenciales[campo]}'`));
  }

  const hashPin = hashes.find((coincidencia) => coincidencia[1] === 'PIN_1')[2];
  afirmar.equal(await bcrypt.compare(String(Number(credenciales.PIN_1)), hashPin), false);
});

test('rechaza credenciales incompletas y las que bcrypt truncaría', async () => {
  const esquema = await readFile(rutaSql, 'utf8');
  const credenciales = crearCredencialesFicticias();
  await afirmar.rejects(generarSqlConSemillas(esquema, { ...credenciales, PIN_1: 7 }), /SEMILLA_PIN_1/);
  await afirmar.rejects(generarSqlConSemillas(esquema, { ...credenciales, ADMIN: undefined }), /SEMILLA_ADMIN/);
  await afirmar.rejects(generarSqlConSemillas(esquema, { ...credenciales, ADMIN: 'á'.repeat(37) }), /72 bytes/);
});
