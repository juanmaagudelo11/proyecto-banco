import { dinero } from './formatoMonetario.js';

const porId = (id) => document.getElementById(id);
const ingreso = porId('atm-formulario-ingreso');
const retiro = porId('atm-formulario-retiro');
const salir = porId('atm-salir');
const fechaCorta = new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short' });
const nombres = {
  CONSIGNACION: 'Consignación', RETIRO: 'Retiro',
  TRANSFERENCIA_ENVIADA: 'Transferencia enviada', TRANSFERENCIA_RECIBIDA: 'Transferencia recibida'
};
let cuenta;
let reloj;
let version = 0;
let peticionPendiente;

function aviso(id, mensaje, error = false) {
  const elemento = porId(id);
  elemento.textContent = mensaje;
  elemento.hidden = !mensaje;
  elemento.classList.toggle('error', error);
}

async function pedir(ruta, metodo = 'GET', cuerpo, clave) {
  const opciones = { method: metodo, headers: {} };
  if (cuerpo !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(cuerpo);
  }
  if (clave) opciones.headers['Idempotency-Key'] = clave;
  const respuesta = await fetch('/api/atm' + ruta, opciones);
  const resultado = await respuesta.json();
  if (!respuesta.ok) {
    const error = new Error(resultado.mensaje);
    error.estado = respuesta.status;
    throw error;
  }
  return resultado;
}

function mostrarIngreso(mensaje = '') {
  version++;
  clearTimeout(reloj);
  cuenta = undefined;
  peticionPendiente = undefined;
  ingreso.reset();
  retiro.reset();
  porId('atm-saldo').textContent = '—';
  porId('atm-cuenta-identificada').textContent = '';
  porId('atm-filas-movimientos').replaceChildren();
  porId('atm-comprobante').hidden = true;
  porId('atm-comprobante-importe').textContent = '';
  porId('atm-comprobante-saldo').textContent = '';
  aviso('atm-aviso-retiro', '');
  aviso('atm-aviso-movimientos', '');
  aviso('atm-aviso-ingreso', '');
  aviso('atm-aviso-general', mensaje);
  porId('atm-operaciones').hidden = true;
  porId('atm-ingreso').hidden = false;
}

function mostrarSaldo(datos) {
  cuenta = datos.numeroCuenta;
  porId('atm-saldo').textContent = dinero(datos.saldo);
  porId('atm-cuenta-identificada').textContent = cuenta;
  porId('atm-ingreso').hidden = true;
  porId('atm-operaciones').hidden = false;
  aviso('atm-aviso-general', '');
  clearTimeout(reloj);
  reloj = setTimeout(() => mostrarIngreso('La sesión del cajero terminó. Identifícate de nuevo.'),
    Math.max(0, datos.segundosRestantes) * 1000);
}

function tratarError(error, id) {
  if (cuenta && [401, 403].includes(error.estado)) {
    mostrarIngreso(error.message);
    return;
  }
  aviso(id, error.estado ? error.message : 'No se pudo conectar con el cajero. Inténtalo de nuevo.', true);
}

async function cargarMovimientos() {
  const operacion = version;
  try {
    const { datos } = await pedir('/movimientos');
    if (operacion !== version) return;
    const filas = datos.elementos.map((movimiento) => {
      const fila = document.createElement('tr');
      for (const texto of [
        fechaCorta.format(new Date(movimiento.fecha)), nombres[movimiento.tipoMovimiento] ?? movimiento.tipoMovimiento,
        dinero(movimiento.monto), dinero(movimiento.saldoResultante)
      ]) fila.insertCell().textContent = texto;
      return fila;
    });
    porId('atm-filas-movimientos').replaceChildren(...filas);
    aviso('atm-aviso-movimientos', filas.length ? '' : 'Esta cuenta todavía no tiene movimientos.');
  } catch (error) {
    if (operacion === version) tratarError(error, 'atm-aviso-movimientos');
  }
}

async function cargarSaldo() {
  const operacion = version;
  const { datos } = await pedir('/saldo');
  if (operacion === version) mostrarSaldo(datos);
}

ingreso.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const boton = ingreso.querySelector('button[type="submit"]');
  boton.disabled = true;
  aviso('atm-aviso-ingreso', '');
  try {
    const credenciales = Object.fromEntries(new FormData(ingreso));
    const resultado = await pedir('/login', 'POST', credenciales);
    ingreso.reset();
    version++;
    mostrarSaldo(resultado.datos);
    await cargarMovimientos();
  } catch (error) {
    tratarError(error, 'atm-aviso-ingreso');
  } finally {
    porId('atm-pin').value = '';
    boton.disabled = false;
  }
});

for (const boton of retiro.querySelectorAll('[data-monto]')) {
  boton.addEventListener('click', () => {
    porId('atm-monto-retiro').value = boton.dataset.monto.replace('.', ',');
    porId('atm-monto-retiro').focus();
  });
}

retiro.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  if (!cuenta) return;
  const operacion = version;
  const boton = retiro.querySelector('button[type="submit"]');
  const monto = porId('atm-monto-retiro').value.trim().replace(',', '.');
  if (peticionPendiente?.monto !== monto) peticionPendiente = { monto, clave: crypto.randomUUID() };

  boton.disabled = true;
  salir.disabled = true;
  aviso('atm-aviso-retiro', '');
  porId('atm-comprobante').hidden = true;
  try {
    const { datos } = await pedir('/retirar', 'POST', { monto }, peticionPendiente.clave);
    if (operacion !== version) return;
    peticionPendiente = undefined;
    porId('atm-saldo').textContent = dinero(datos.saldoResultante);
    porId('atm-comprobante-importe').textContent = `Retiro ${datos.idMovimiento} · ${dinero(datos.monto)}`;
    porId('atm-comprobante-saldo').textContent = `Saldo resultante ${dinero(datos.saldoResultante)}`;
    porId('atm-comprobante').hidden = false;
    retiro.reset();
    const actualizarSaldo = cargarSaldo().catch((error) => {
      if (operacion !== version) return;
      if ([401, 403].includes(error.estado)) tratarError(error, 'atm-aviso-general');
      else aviso('atm-aviso-general', 'El retiro se registr\u00f3. No se pudo actualizar el saldo.', true);
    });
    await Promise.all([actualizarSaldo, cargarMovimientos()]);
  } catch (error) {
    if (operacion === version) tratarError(error, 'atm-aviso-retiro');
  } finally {
    boton.disabled = false;
    salir.disabled = false;
  }
});

salir.addEventListener('click', async () => {
  salir.disabled = true;
  const botonRetiro = retiro.querySelector('button[type="submit"]');
  botonRetiro.disabled = true;
  try {
    await pedir('/logout', 'POST');
    mostrarIngreso('Sesión finalizada.');
  } catch (error) {
    tratarError(error, 'atm-aviso-general');
  } finally {
    salir.disabled = false;
    botonRetiro.disabled = false;
  }
});

try {
  await cargarSaldo();
  await cargarMovimientos();
} catch (error) {
  mostrarIngreso(error.estado === 401 ? '' : error.message);
}
