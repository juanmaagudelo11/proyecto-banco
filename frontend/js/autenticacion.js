const formulario = document.querySelector('#formulario-acceso');
const aviso = document.querySelector('#error-acceso');
const areas = new Map([
  ['ADMIN', '/panel-administrador'],
  ['CLIENTE', '/banca-virtual']
]);

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const boton = formulario.querySelector('button[type="submit"]');
  const datos = new FormData(formulario);
  aviso.hidden = true;
  boton.disabled = true;

  try {
    const respuesta = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identificador: datos.get('identificador'),
        contrasena: datos.get('contrasena')
      })
    });
    const resultado = await respuesta.json();
    const destino = areas.get(resultado.datos?.rol);
    if (!respuesta.ok || !destino) {
      aviso.textContent = resultado.mensaje;
      aviso.hidden = false;
      return;
    }
    window.location.assign(destino);
  } catch {
    aviso.textContent = 'No se pudo conectar con el simulador. Vuelve a intentarlo.';
    aviso.hidden = false;
  } finally {
    formulario.elements.contrasena.value = '';
    boton.disabled = false;
  }
});
