const { readFile, writeFile } = require('node:fs/promises');
const ruta = require('node:path');
const bcrypt = require('bcrypt');

const rutaEsquema = ruta.resolve(__dirname, '../../database.sql');
const campos = ['ADMIN', 'CLIENTE_1', 'CLIENTE_2', 'CLIENTE_3', 'PIN_1', 'PIN_2', 'PIN_3'];
const marcador = /\/\* bcrypt:([A-Z0-9_]+) \*\/ '(?:\$2b\$[0-9]{2}\$[./A-Za-z0-9]{53}|PENDIENTE)'/g;

async function generarSqlConSemillas(esquema, credenciales) {
  const marcas = [...esquema.matchAll(marcador)].map((coincidencia) => coincidencia[1]);
  if (marcas.length !== campos.length || campos.some((campo) => !marcas.includes(campo))) {
    throw new Error('Los marcadores de la semilla SQL no corresponden a las identidades de demostración.');
  }

  for (const campo of campos) {
    const valor = credenciales[campo];
    const esPin = campo.startsWith('PIN_');
    const valido = typeof valor === 'string' && (esPin
      ? /^[0-9]{4}$/.test(valor)
      : valor.length >= 12 && Buffer.byteLength(valor, 'utf8') <= 72 && !valor.includes('\0'));
    if (!valido) {
      throw new Error(esPin
        ? `SEMILLA_${campo} debe contener cuatro dígitos.`
        : `SEMILLA_${campo} requiere al menos 12 caracteres y un máximo de 72 bytes UTF-8, sin caracteres nulos.`);
    }
  }

  const hashes = new Map(await Promise.all(campos.map(async (campo) => [
    campo, await bcrypt.hash(credenciales[campo], 12)
  ])));
  return esquema.replace(marcador, (coincidencia, campo) => `/* bcrypt:${campo} */ '${hashes.get(campo)}'`);
}

async function generarArchivo() {
  const credenciales = Object.fromEntries(campos.map((campo) => [campo, process.env[`SEMILLA_${campo}`]]));
  const esquema = await readFile(rutaEsquema, 'utf8');
  const archivo = ruta.resolve(__dirname, '../../database.local.sql');
  await writeFile(archivo, await generarSqlConSemillas(esquema, credenciales), { flag: 'wx' });
  console.log('Se creó database.local.sql con hashes de demostración.');
}

if (require.main === module) {
  generarArchivo().catch((error) => {
    console.error(error.code === 'EEXIST'
      ? 'database.local.sql ya existe. Renómbralo fuera del repositorio antes de volver a generar.'
      : error.message);
    process.exitCode = 1;
  });
}

module.exports = { generarSqlConSemillas };
