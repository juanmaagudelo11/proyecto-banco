const porId = (id) => document.getElementById(id);
const fechaCorta = new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short' });
const nombresTipo = {
  CONSIGNACION: 'Consignación', RETIRO: 'Retiro',
  TRANSFERENCIA_ENVIADA: 'Transferencia enviada', TRANSFERENCIA_RECIBIDA: 'Transferencia recibida'
};
const camposMetricas = ['clientesTotales', 'cuentasActivas', 'clientesBloqueados', 'cuentasBloqueadas', 'saldoGlobal'];
const dialogoRegistro = porId('registro-cliente');
const dialogoDetalle = porId('detalle-cliente');
const formularioEdicion = porId('formulario-edicion');
let detalle;
let peticionDetalle = 0;

function dinero(valor) {
  const [entero, decimal = '00'] = String(valor).split('.');
  return `$ ${entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${decimal.padEnd(2, '0')}`;
}

function mostrar(aviso, mensaje, error = false) {
  aviso.textContent = mensaje;
  aviso.classList.toggle('text-danger', error);
  aviso.hidden = !mensaje;
}

async function pedir(ruta, metodo = 'GET', datos) {
  const opciones = { method: metodo };
  if (datos !== undefined) {
    opciones.headers = { 'Content-Type': 'application/json' };
    opciones.body = JSON.stringify(datos);
  }
  const respuesta = await fetch('/api/admin' + ruta, opciones);
  const resultado = await respuesta.json();
  if (respuesta.status === 401) window.location.replace('/inicio-sesion');
  if (!respuesta.ok) throw new Error(resultado.mensaje);
  return resultado;
}

function datosFormulario(formulario) {
  return Object.fromEntries(new FormData(formulario));
}

function celda(fila, contenido) {
  const elemento = fila.insertCell();
  if (typeof contenido === 'string') elemento.textContent = contenido;
  else elemento.append(contenido);
}

function filaCliente(cliente) {
  const fila = document.createElement('tr');
  celda(fila, cliente.nombreCompleto);
  celda(fila, cliente.documento);
  celda(fila, cliente.estadoUsuario);
  const cuentas = cliente.cuentas.map((cuenta) => `${cuenta.numeroCuenta} · ${dinero(cuenta.saldo)}`).join(' / ');
  celda(fila, cuentas || 'Sin cuentas');

  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'btn btn-outline-primary btn-sm';
  boton.textContent = 'Ver cliente';
  boton.setAttribute('aria-label', `Ver cliente ${cliente.nombreCompleto}`);
  boton.addEventListener('click', () => verCliente(cliente.idUsuario));
  celda(fila, boton);
  return fila;
}

function filaMovimiento(movimiento) {
  const fila = document.createElement('tr');
  for (const contenido of [
    fechaCorta.format(new Date(movimiento.fecha)), movimiento.numeroCuenta, nombresTipo[movimiento.tipoMovimiento],
    movimiento.descripcion || '—', dinero(movimiento.monto), dinero(movimiento.saldoResultante)
  ]) celda(fila, contenido);
  return fila;
}

function prepararListado({ ruta, busqueda, filas, paginacion, aviso, renderizar, vacio }) {
  let pagina = 1;
  let peticionActual = 0;
  let hayMas = false;
  let filtros = {};
  const controles = [...paginacion.querySelectorAll('button')];

  async function cargar() {
    const peticion = ++peticionActual;
    const parametros = new URLSearchParams({ ...filtros, pagina: String(pagina) });
    controles.forEach((boton) => { boton.disabled = true; });
    mostrar(aviso, 'Cargando…');
    try {
      const { datos } = await pedir(`${ruta}?${parametros}`);
      if (peticion !== peticionActual) return;
      filas.replaceChildren(...datos.elementos.map(renderizar));
      hayMas = datos.hayMas;
      mostrar(aviso, datos.elementos.length ? '' : vacio);
    } catch (error) {
      if (peticion !== peticionActual) return;
      filas.replaceChildren();
      hayMas = false;
      mostrar(aviso, error.message, true);
    } finally {
      if (peticion === peticionActual) {
        controles[0].disabled = pagina <= 1;
        controles[1].disabled = !hayMas;
        paginacion.querySelector('[data-pagina]').textContent = `Página ${pagina}`;
      }
    }
  }

  busqueda.addEventListener('submit', (evento) => {
    evento.preventDefault();
    pagina = 1;
    filtros = datosFormulario(busqueda);
    cargar();
  });
  for (const boton of controles) {
    boton.addEventListener('click', () => {
      pagina += Number(boton.dataset.direccion);
      cargar();
    });
  }
  return cargar;
}

const cargarClientes = prepararListado({
  ruta: '/clientes', busqueda: porId('buscar-clientes'), filas: porId('filas-clientes'),
  aviso: porId('aviso-clientes'), paginacion: porId('paginar-clientes'), renderizar: filaCliente,
  vacio: 'No se encontraron clientes con esa búsqueda.'
});
const cargarHistorial = prepararListado({
  ruta: '/movimientos', busqueda: porId('filtrar-historial'), filas: porId('filas-historial'),
  aviso: porId('aviso-historial'), paginacion: porId('paginar-historial'), renderizar: filaMovimiento,
  vacio: 'No se encontraron movimientos con esos filtros.'
});

async function cargarMetricas() {
  const aviso = porId('aviso-metricas');
  try {
    const { datos } = await pedir('/metricas');
    for (const campo of camposMetricas) {
      porId(campo).textContent = campo === 'saldoGlobal' ? dinero(datos[campo]) : datos[campo];
    }
    mostrar(aviso, '');
  } catch (error) {
    mostrar(aviso, error.message, true);
  }
}

function actualizarPanel() {
  return Promise.all([cargarMetricas(), cargarClientes(), cargarHistorial()]);
}

function gestionarEnvio(formulario, accion) {
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const boton = formulario.querySelector('button[type="submit"]');
    const aviso = formulario.querySelector('[data-aviso]');
    mostrar(aviso, '');
    boton.disabled = true;
    try {
      await accion(datosFormulario(formulario), aviso);
    } catch (error) {
      mostrar(aviso, error.message, true);
    } finally {
      boton.disabled = false;
    }
  });
}

async function verCliente(idUsuario) {
  const peticion = ++peticionDetalle;
  detalle = null;
  const aviso = porId('aviso-detalle');
  porId('detalle-documento').textContent = '';
  porId('detalle-cuentas').replaceChildren();
  formularioEdicion.hidden = true;
  mostrar(formularioEdicion.querySelector('[data-aviso]'), '');
  mostrar(aviso, 'Cargando…');
  dialogoDetalle.showModal();
  try {
    const { datos } = await pedir(`/clientes/${idUsuario}`);
    if (!dialogoDetalle.open || peticion !== peticionDetalle) return;
    detalle = datos;
    porId('detalle-documento').textContent = `Documento ${datos.documento}`;
    for (const campo of ['nombreCompleto', 'correo', 'telefono', 'estadoUsuario']) {
      formularioEdicion.elements[campo].value = datos[campo];
    }
    llenarCuentas(datos);
    formularioEdicion.hidden = false;
    mostrar(aviso, '');
  } catch (error) {
    if (peticion === peticionDetalle) mostrar(aviso, error.message, true);
  }
}

function confirmarEstado(antes, despues, entidad) {
  return antes === despues || window.confirm(`¿Cambiar el estado de ${entidad} a ${despues}?`);
}

function llenarCuentas(cliente) {
  const contenedor = porId('detalle-cuentas');
  const titulo = document.createElement('h3');
  titulo.className = 'h5';
  titulo.textContent = 'Cuentas del cliente';
  const formularios = cliente.cuentas.map((cuenta) => {
    const formulario = porId('estado-cuenta').content.firstElementChild.cloneNode(true);
    formulario.querySelector('[data-cuenta]').textContent = `${cuenta.numeroCuenta} · ${cuenta.tipoCuenta} · ${dinero(cuenta.saldo)}`;
    formulario.elements.estadoCuenta.value = cuenta.estadoCuenta;
    gestionarEnvio(formulario, async ({ estadoCuenta }, aviso) => {
      if (!confirmarEstado(cuenta.estadoCuenta, estadoCuenta, 'la cuenta')) {
        formulario.elements.estadoCuenta.value = cuenta.estadoCuenta;
        return;
      }
      await pedir(`/clientes/${cliente.idUsuario}`, 'PUT', { idCuenta: cuenta.idCuenta, estadoCuenta });
      cuenta.estadoCuenta = estadoCuenta;
      mostrar(aviso, 'Estado guardado.');
      await actualizarPanel();
    });
    return formulario;
  });
  contenedor.replaceChildren(titulo, ...formularios);
}

porId('abrir-registro').addEventListener('click', () => {
  const formulario = porId('formulario-registro');
  formulario.reset();
  mostrar(formulario.querySelector('[data-aviso]'), '');
  dialogoRegistro.showModal();
});
for (const dialogo of [dialogoRegistro, dialogoDetalle]) {
  dialogo.querySelector('[data-cerrar]').addEventListener('click', () => dialogo.close());
}

gestionarEnvio(porId('formulario-registro'), async (datos) => {
  datos.saldoInicial = datos.saldoInicial.replace(',', '.');
  try {
    const resultado = await pedir('/clientes', 'POST', datos);
    dialogoRegistro.close();
    porId('formulario-registro').reset();
    await actualizarPanel();
    mostrar(porId('aviso-clientes'), `Cliente creado. Número de cuenta ${resultado.datos.numeroCuenta}.`);
  } finally {
    porId('formulario-registro').elements.contrasena.value = '';
    porId('formulario-registro').elements.pinAtm.value = '';
  }
});

gestionarEnvio(formularioEdicion, async (datos, aviso) => {
  if (!detalle) return;
  const cliente = detalle;
  if (!confirmarEstado(cliente.estadoUsuario, datos.estadoUsuario, 'este cliente')) {
    formularioEdicion.elements.estadoUsuario.value = cliente.estadoUsuario;
    return;
  }
  const resultado = await pedir(`/clientes/${cliente.idUsuario}`, 'PUT', datos);
  if (detalle === cliente) {
    detalle.estadoUsuario = resultado.datos.estadoUsuario;
    mostrar(aviso, resultado.mensaje);
  }
  await actualizarPanel();
});

gestionarEnvio(porId('formulario-consignacion'), async (datos, aviso) => {
  datos.monto = datos.monto.replace(',', '.');
  const resultado = await pedir('/consignar', 'POST', datos);
  porId('formulario-consignacion').reset();
  mostrar(aviso, `Consignación registrada. Saldo resultante ${dinero(resultado.datos.saldoResultante)}.`);
  await actualizarPanel();
});

actualizarPanel();
