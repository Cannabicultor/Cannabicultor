/*! Cannabicultor — configuración compartida del frontend.
 * Fuente única de la URL del worker y del PAÍS del visitante. Cargar antes de cualquier script que la use:
 *   <script src="/assets/config.js"></script>
 * Preparado para multi-país: WORKERS_POR_PAIS permitirá un worker distinto por país.
 * Hoy todos apuntan al mismo worker.
 *
 * País (window.CC_CONFIG.PAIS), por orden de prioridad:
 *   1. ?pais=AR         parámetro explícito
 *   2. /ar/, /cl/, /co/, /mx/   prefijo de ruta (rutas de país futuras)
 *   3. ar. / cl. / co. / mx.cannabicultor.com   host (mientras los subdominios sirvan contenido)
 *   4. cookie cc_pais   la deja el 301 de ar./cl./co./mx. → www (.htaccess): tras el redirect el host ya es www
 *   5. el país que ya se detectó antes en esta pestaña (sessionStorage "cc_pais")
 *   6. ES (por defecto; España no cambia nunca)
 * Un país válido de 1-4 se guarda en sessionStorage para las páginas siguientes de la sesión (los enlaces
 * internos no llevan país). La cookie del 301 se borra al leerla y ?pais= se quita de la barra de direcciones.
 *
 * El worker deduce el país del Origin; tras el 301 el Origin es www (=ES). Por eso, si el país no es ES,
 * las peticiones al worker llevan la cabecera X-CC-Pais (el worker la lee; si es un worker antiguo, sin soporte
 * en CORS, se reintenta sin cabecera y se deja de enviar en la sesión).
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
  var STORE_KEY = "cc_pais";

  function valido(c) {
    c = String(c || "").toUpperCase();
    return Object.prototype.hasOwnProperty.call(WORKERS_POR_PAIS, c) ? c : null;
  }
  function dePais(fn) { try { return fn(); } catch (e) { return null; } }

  var deParam = dePais(function () { return valido(new URLSearchParams(location.search).get("pais")); });
  var deRuta = dePais(function () {
    var m = /^\/(ar|cl|co|mx)(\/|$)/i.exec(location.pathname);
    return m ? valido(m[1]) : null;
  });
  var deHost = dePais(function () {
    var m = /^([a-z]{2})\.cannabicultor\.com$/.exec(location.hostname);
    return m ? valido(m[1]) : null;
  });
  var deCookie = dePais(function () {
    var m = /(?:^|;\s*)cc_pais=([^;]*)/.exec(document.cookie || "");
    return m ? valido(decodeURIComponent(m[1])) : null;
  });
  var guardado = dePais(function () { return valido(sessionStorage.getItem(STORE_KEY)); });

  var pais, fuente;
  if (deParam) { pais = deParam; fuente = "param"; }
  else if (deRuta) { pais = deRuta; fuente = "ruta"; }
  else if (deHost) { pais = deHost; fuente = "host"; }
  else if (deCookie) { pais = deCookie; fuente = "cookie"; }
  else if (guardado) { pais = guardado; fuente = "sesion"; }
  else { pais = "ES"; fuente = "defecto"; }

  if (fuente !== "sesion" && fuente !== "defecto") dePais(function () { sessionStorage.setItem(STORE_KEY, pais); });

  // La cookie del 301 ya cumplió (queda en sessionStorage): se borra para que no fije el país en visitas futuras.
  if (deCookie) {
    dePais(function () {
      document.cookie = "cc_pais=; Max-Age=0; Path=/; Domain=.cannabicultor.com";
      document.cookie = "cc_pais=; Max-Age=0; Path=/";
    });
  }

  // Quita ?pais= de la URL visible (ya está guardado en la sesión): enlaces compartidos y analítica limpios.
  if (deParam) {
    dePais(function () {
      var u = new URL(location.href);
      u.searchParams.delete("pais");
      history.replaceState(history.state, "", u.pathname + u.search + u.hash);
    });
  }

  var workerUrl = WORKERS_POR_PAIS[pais] || WORKER_DEFAULT;

  // País distinto de ES: informar al worker (cabecera X-CC-Pais) porque su Origin ya no lo dice tras el 301.
  // España no pasa por aquí: nada se modifica.
  if (pais !== "ES" && typeof window.fetch === "function") {
    var origFetch = window.fetch.bind(window);
    var sinCabecera = false;
    window.fetch = function (input, init) {
      var url = typeof input === "string" ? input : (input && typeof input.href === "string" ? input.href : "");
      if (sinCabecera || !url || url.indexOf(workerUrl) !== 0) return origFetch(input, init);
      var init2 = {};
      var k;
      for (k in (init || {})) init2[k] = init[k];
      var h = new Headers((init && init.headers) || undefined);
      h.set("X-CC-Pais", pais);
      init2.headers = h;
      return origFetch(input, init2).catch(function (err) {
        // Worker sin soporte de la cabecera: el preflight CORS falla (TypeError) antes de enviar nada.
        if (err && err.name === "TypeError" && !(init && init.signal && init.signal.aborted)) {
          sinCabecera = true;
          return origFetch(input, init);
        }
        throw err;
      });
    };
  }

  window.CC_CONFIG = Object.freeze({
    PAIS: pais,
    PAIS_FUENTE: fuente,
    WORKER_URL: workerUrl,
  });
})();
