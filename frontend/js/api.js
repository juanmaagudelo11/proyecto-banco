const botonVerificar = document.querySelector('#verificar');
const estadoServidor = document.querySelector('#estado-servidor');
const estadoBaseDatos = document.querySelector('#estado-base-datos');

async function verificarEstado() {
  botonVerificar.disabled = true;
  estadoServidor.textContent = 'Comprobando…';
  estadoBaseDatos.textContent = 'Comprobando…';

  try {
    const respuesta = await fetch('/api/salud', { cache: 'no-store' });
    const resultado = await respuesta.json();

    if (resultado.datos?.servidor !== 'disponible') {
      throw new Error('Respuesta inesperada');
    }

    estadoServidor.textContent = 'Disponible';
    estadoBaseDatos.textContent = resultado.datos.baseDatos === 'disponible'
      ? 'Disponible'
      : 'No disponible';
  } catch {
    estadoServidor.textContent = 'No se pudo verificar';
    estadoBaseDatos.textContent = 'Sin verificar';
  } finally {
    botonVerificar.disabled = false;
  }
}

botonVerificar.addEventListener('click', verificarEstado);
verificarEstado();
