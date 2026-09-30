/*! Cannabicultor — configuración compartida del frontend.
 * Fuente única de la URL del worker. Cargar antes de cualquier script que la use:
 *   <script src="/assets/config.js"></script>
 * Preparado para multi-país: WORKERS_POR_PAIS permitirá un worker distinto por subdominio
 * (/ar/ → AR). Hoy todos apuntan al mismo worker.
 */
(function () {
  "use strict";
  var WORKER_DEFAULT = "https://growers-alliance-ai.nohumanclicks.workers.dev";
  var WORKERS_POR_PAIS = {
    ES: WORKER_DEFAULT,
    AR: WORKER_DEFAULT,
    CL: WORKER_DEFAULT,
    MX: WORKER_DEFAULT,
    CO: WORKER_DEFAULT,
  };
  // País: subdominio (legado, en migración) > prefijo de ruta (/ar/...) > ?pais=AR (buscadores) > ES.
  var m = /^([a-z]{2})\.cannabicultor\.com$/.exec(location.hostname)
    || /^\/(ar|cl|co|mx)(?:\/|$)/.exec(location.pathname)
    || /[?&]pais=([a-z]{2})(?:&|$)/i.exec(location.search);
  var pais = m && WORKERS_POR_PAIS[m[1].toUpperCase()] ? m[1].toUpperCase() : "ES";
  window.CC_CONFIG = Object.freeze({
    PAIS: pais,
    WORKER_URL: WORKERS_POR_PAIS[pais] || WORKER_DEFAULT,
  });
})();
