function crearServicioSalud(modeloSalud) {
  return async function consultarSalud() {
    return {
      servidor: 'disponible',
      baseDatos: await modeloSalud.comprobarBaseDatos() ? 'disponible' : 'no_disponible'
    };
  };
}

module.exports = { crearServicioSalud };
