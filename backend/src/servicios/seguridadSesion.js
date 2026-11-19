const { createHash, randomBytes } = require('node:crypto');

// Hash de un valor aleatorio para comparar credenciales aunque el identificador no exista.
const hashSimulado = '$2b$12$Oe/ob3J1Q/RvLh.NwEUTXeOinVmXXsVniw8UkILkVQpDj8q9qETQG';

function crearTokenSesion() {
  return randomBytes(32).toString('base64url');
}

function huellaDeSesion(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return createHash('sha256').update(token).digest();
}

module.exports = { crearTokenSesion, huellaDeSesion, hashSimulado };
