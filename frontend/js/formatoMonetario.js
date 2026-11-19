export function dinero(valor) {
  const [entero, decimal = '00'] = String(valor).split('.');
  return `$ ${entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${decimal.padEnd(2, '0')}`;
}
