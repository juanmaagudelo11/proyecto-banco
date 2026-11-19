const maximoCentavos = 999999999999999n;

function aCentavos(valor) {
  if (typeof valor !== 'string') return null;
  const partes = /^(\d{1,13})(?:\.(\d{1,2}))?$/.exec(valor.trim());
  if (!partes) return null;
  return BigInt(partes[1]) * 100n + BigInt((partes[2] ?? '').padEnd(2, '0'));
}

function aDecimal(centavos) {
  const entero = centavos / 100n;
  const decimales = String(centavos % 100n).padStart(2, '0');
  return `${entero}.${decimales}`;
}

module.exports = { aCentavos, aDecimal, maximoCentavos };
