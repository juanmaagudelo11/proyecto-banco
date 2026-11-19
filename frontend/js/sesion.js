const nombre = document.querySelector('#nombre-usuario');
const aviso = document.querySelector('#aviso-sesion');
const boton = document.querySelector('#cerrar-sesion');

function mostrarAviso(mensaje) {
  aviso.textContent = mensaje;
  aviso.hidden = false;
}

async function consultarSesion() {
  try {
    const respuesta = await fetch('/api/auth/sesion');
    if (respuesta.status === 401 || respuesta.status === 403) {
      window.location.replace('/inicio-sesion');
      return;
    }
    if (!respuesta.ok) throw new Error();
    const { datos } = await respuesta.json();
    nombre.textContent = datos.nombre;
    nombre.hidden = false;
  } catch {
    mostrarAviso('No se pudo comprobar la sesión.');
  }
}

boton.addEventListener('click', async () => {
  boton.disabled = true;
  aviso.hidden = true;
  try {
    const respuesta = await fetch('/api/auth/logout', { method: 'POST' });
    if (respuesta.ok || respuesta.status === 401) {
      window.location.replace('/inicio-sesion');
      return;
    }
    const resultado = await respuesta.json();
    mostrarAviso(resultado.mensaje);
  } catch {
    mostrarAviso('No se pudo cerrar la sesión. Vuelve a intentarlo.');
  } finally {
    boton.disabled = false;
  }
});

window.addEventListener('pageshow', consultarSesion);
