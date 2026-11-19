import { dinero } from './formatoMonetario.js';

const porId = (id) => document.getElementById(id);
const fechaCorta = new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short' });
const nombresTipo = {
  CONSIGNACION: 'Consignación', RETIRO: 'Retiro',
  TRANSFERENCIA_ENVIADA: 'Transferencia enviada', TRANSFERENCIA_RECIBIDA: 'Transferencia recibida'
};
const seleccionar = porId('cuenta-activa');
const formularioTransferencia = porId('formulario-transferencia');
const formularioPerfil = porId('formulario-perfil');
const formularioContrasena = porId('formulario-contrasena');
const paginaAnterior = porId('movimientos-anterior');
const paginaSiguiente = porId('movimientos-siguiente');
let cuenta;
let pagina = 1;
let peticionCuenta = 0;
let peticionMovimientos = 0;

function aviso(elemento, mensaje, error = false) {
  elemento.textContent = mensaje;
  elemento.hidden = !mensaje;
  elemento.classList.toggle('text-danger', error && elemento.id !== 'aviso-cuenta');
}

async function pedir(ruta, metodo = 'GET', datos) {
  const opciones = { method: metodo };
  if (datos !== undefined) {
    opciones.headers = { 'Content-Type': 'application/json' };
    opciones.body = JSON.stringify(datos);
  }
  const respuesta = await fetch('/api/banca' + ruta, opciones);
  if (respuesta.status === 401) window.location.replace('/inicio-sesion');
  const resultado = await respuesta.json();
  if (!respuesta.ok) throw new Error(resultado.mensaje);
  return resultado;
}

function boton(formulario) {
  return formulario.querySelector('button[type="submit"]');
}

function mostrarCuenta(datos) {
  for (const [id, valor] of [
    ['saldo-cuenta', dinero(datos.saldo)], ['titular-cuenta', datos.titular], ['numero-cuenta', datos.numeroCuenta],
    ['tipo-cuenta', datos.tipoCuenta], ['estado-cuenta', datos.estado], ['origen-visible', datos.numeroCuenta]
  ]) porId(id).textContent = valor;
  seleccionar.replaceChildren(...datos.cuentas.map((actual) =>
    new Option(`${actual.numeroCuenta} · ${actual.tipoCuenta}`, String(actual.idCuenta))
  ));
  seleccionar.value = String(datos.idCuenta);
  porId('seleccion-cuenta').hidden = datos.cuentas.length < 2;
}

function limpiarCuenta() {
  for (const id of ['saldo-cuenta','titular-cuenta','numero-cuenta','tipo-cuenta','estado-cuenta','origen-visible']) {
    porId(id).textContent = '—';
  }
  porId('seleccion-cuenta').hidden = true;
  porId('filas-movimientos').replaceChildren();
  porId('movimientos-pagina').textContent = '';
  paginaAnterior.disabled = true;
  paginaSiguiente.disabled = true;
}

async function consultarCuenta(idCuenta) {
  const peticion = ++peticionCuenta;
  ++peticionMovimientos;
  cuenta = undefined;
  seleccionar.disabled = true;
  boton(formularioTransferencia).disabled = true;
  limpiarCuenta();
  aviso(porId('aviso-cuenta'), 'Cargando cuenta…');
  aviso(porId('aviso-movimientos'), '');
  const consulta = idCuenta === undefined ? '' : '?idCuenta=' + encodeURIComponent(idCuenta);
  try {
    const { datos } = await pedir('/cuenta' + consulta);
    if (peticion !== peticionCuenta) return;
    cuenta = datos;
    pagina = 1;
    mostrarCuenta(datos);
    aviso(porId('aviso-cuenta'), '');
    await consultarMovimientos();
  } catch (error) {
    if (peticion === peticionCuenta) aviso(porId('aviso-cuenta'), error.message, true);
  } finally {
    if (peticion === peticionCuenta) {
      seleccionar.disabled = false;
      boton(formularioTransferencia).disabled = !cuenta;
    }
  }
}

function filaMovimiento(movimiento) {
  const fila = document.createElement('tr');
  for (const texto of [
    fechaCorta.format(new Date(movimiento.fecha)), nombresTipo[movimiento.tipoMovimiento] ?? movimiento.tipoMovimiento,
    movimiento.descripcion ?? '—', dinero(movimiento.monto), dinero(movimiento.saldoResultante)
  ]) fila.insertCell().textContent = texto;
  return fila;
}

async function consultarMovimientos() {
  const peticion = ++peticionMovimientos;
  if (!cuenta) return;
  const estado = porId('aviso-movimientos');
  const filas = porId('filas-movimientos');
  paginaAnterior.disabled = true;
  paginaSiguiente.disabled = true;
  aviso(estado, 'Cargando movimientos…');
  try {
    const { datos } = await pedir(`/movimientos?idCuenta=${cuenta.idCuenta}&pagina=${pagina}`);
    if (peticion !== peticionMovimientos) return;
    filas.replaceChildren(...datos.elementos.map(filaMovimiento));
    paginaAnterior.disabled = pagina <= 1;
    paginaSiguiente.disabled = !datos.hayMas;
    porId('movimientos-pagina').textContent = `Página ${pagina}`;
    aviso(estado, datos.elementos.length ? '' : 'Esta cuenta todavía no tiene movimientos.');
  } catch (error) {
    if (peticion !== peticionMovimientos) return;
    filas.replaceChildren();
    paginaAnterior.disabled = pagina <= 1;
    aviso(estado, error.message, true);
  }
}

function mostrarPerfil(datos) {
  porId('perfil-nombre').textContent = datos.nombreCompleto;
  porId('perfil-documento').textContent = datos.documento;
  formularioPerfil.elements.correo.value = datos.correo;
  formularioPerfil.elements.telefono.value = datos.telefono;
}

async function consultarPerfil() {
  try {
    const { datos } = await pedir('/perfil');
    mostrarPerfil(datos);
    boton(formularioPerfil).disabled = false;
  } catch (error) {
    aviso(formularioPerfil.querySelector('[data-aviso]'), error.message, true);
  }
}

function recibirFormulario(formulario, accion, bloquear = () => false) {
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const estado = formulario.querySelector('[data-aviso]');
    aviso(estado, '');
    boton(formulario).disabled = true;
    try {
      await accion(Object.fromEntries(new FormData(formulario)), estado);
    } catch (error) {
      aviso(estado, error.message, true);
    } finally {
      boton(formulario).disabled = bloquear();
    }
  });
}

recibirFormulario(formularioTransferencia, async (datos, estado) => {
  if (!cuenta) return;
  seleccionar.disabled = true;
  try {
    const resultado = await pedir('/transferir', 'POST', {
      ...datos, idCuentaOrigen: cuenta.idCuenta, monto: datos.monto.replace(',', '.')
    });
    formularioTransferencia.reset();
    aviso(estado, `Transferiste ${dinero(resultado.datos.montoTransferido)}. Saldo resultante ${dinero(resultado.datos.nuevoSaldo)}.`);
    await consultarCuenta(cuenta.idCuenta);
  } finally {
    seleccionar.disabled = false;
  }
}, () => !cuenta);

recibirFormulario(formularioPerfil, async (datos, estado) => {
  const resultado = await pedir('/perfil', 'PUT', datos);
  mostrarPerfil(resultado.datos);
  aviso(estado, resultado.mensaje);
});
recibirFormulario(formularioContrasena, async (datos) => {
  try {
    await pedir('/contrasena', 'PUT', datos);
    window.location.replace('/inicio-sesion');
  } finally {
    formularioContrasena.reset();
  }
});

seleccionar.addEventListener('change', () => consultarCuenta(seleccionar.value));
paginaAnterior.addEventListener('click', () => { pagina--; consultarMovimientos(); });
paginaSiguiente.addEventListener('click', () => { pagina++; consultarMovimientos(); });

consultarCuenta();
consultarPerfil();
