/* Cannabicultor — menú lateral según el país del subdominio (ar./cl./mx./co.cannabicultor.com).
   España (cannabicultor.com): no toca nada.
   Otros países:
   - EMPRESAS (productos B2B solo España) se oculta entero.
   - DIRECTORIO: cada entrada solo se muestra si su tabla tiene fichas activas de ese país
     (consulta a Supabase con la clave pública, cacheada 12 h en localStorage).
   - Un encabezado se oculta si no le queda ninguna entrada visible. */
(function () {
  'use strict';
  if (window.__ccMenuPais) return;
  window.__ccMenuPais = true;

  // Mismo criterio que assets/config.js (si está cargado, manda CC_CONFIG.PAIS).
  var PAISES = { ES: 1, AR: 1, CL: 1, MX: 1, CO: 1 };
  var pais = window.CC_CONFIG && window.CC_CONFIG.PAIS;
  if (!pais) {
    var m = /^([a-z]{2})\.cannabicultor\.com$/.exec(location.hostname);
    pais = m && PAISES[m[1].toUpperCase()] ? m[1].toUpperCase() : 'ES';
  }
  if (pais === 'ES') return;

  var SUPABASE_URL = 'https://gfyrsrdnvgnhtsuexjkb.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_FdRmfirvOTAIfZFOcj2ZZg_Vic__TDw';
  var CACHE_KEY = 'cc_menu_directorio_v1_' + pais;
  var CACHE_TTL = 12 * 60 * 60 * 1000;
  var DIRECTORIO = { '/growshops.html': 'growshops', '/asociaciones.html': 'asociaciones', '/tiendas-cbd.html': 'cbd_shops' };

  function grupos() {
    // Encabezados de sección: .grp (home) o .cc-grp (carcasa), dentro del menú lateral.
    return Array.prototype.slice.call(document.querySelectorAll('.side .grp, .cc-side .cc-grp'));
  }
  function nombre(g) { return (g.textContent || '').trim().toLowerCase(); }
  function entradas(g) {
    var out = [];
    for (var el = g.nextElementSibling; el && !/(^|\s)(cc-)?grp(\s|$)/.test(el.className || ''); el = el.nextElementSibling) out.push(el);
    return out;
  }
  function ocultar(el) { el.hidden = true; el.style.display = 'none'; }
  function mostrar(el) { el.hidden = false; el.style.display = ''; }
  function rutaDe(el) {
    var h = el.getAttribute && el.getAttribute('href');
    if (!h) return '';
    try { return new URL(h, location.href).pathname; } catch (_) { return h; }
  }
  function ajustarEncabezado(g) {
    var visibles = entradas(g).filter(function (el) { return !el.hidden; });
    if (visibles.length) mostrar(g); else ocultar(g);
  }

  function aplicar(conteos) {
    grupos().forEach(function (g) {
      var n = nombre(g);
      if (n === 'empresas') {
        entradas(g).forEach(ocultar);
        ocultar(g);
      } else if (n === 'directorio') {
        entradas(g).forEach(function (el) {
          var tabla = DIRECTORIO[rutaDe(el)];
          if (!tabla) return;
          if (conteos && conteos[tabla]) mostrar(el); else ocultar(el);
        });
        ajustarEncabezado(g);
      }
    });
  }

  function leerCache() {
    try {
      var c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      return c && c.conteos ? c : null;
    } catch (_) { return null; }
  }
  function guardarCache(conteos) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), conteos: conteos })); } catch (_) {}
  }

  // ¿Hay al menos una ficha activa de este país? (RLS: la clave pública solo ve activas)
  function hayFichas(tabla) {
    var url = SUPABASE_URL + '/rest/v1/' + tabla + '?select=id&pais=eq.' + encodeURIComponent(pais) + '&limit=1';
    return fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY } })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (rows) { return Array.isArray(rows) && rows.length > 0; });
  }

  function refrescar() {
    var tablas = Object.keys(DIRECTORIO).map(function (k) { return DIRECTORIO[k]; });
    Promise.all(tablas.map(function (t) { return hayFichas(t).then(function (v) { return [t, v]; }); }))
      .then(function (pares) {
        var conteos = {};
        pares.forEach(function (p) { conteos[p[0]] = p[1] ? 1 : 0; });
        guardarCache(conteos);
        aplicar(conteos);
      })
      .catch(function () { /* sin red: se queda como está (oculto o según caché) */ });
  }

  function iniciar() {
    var cache = leerCache();
    aplicar(cache ? cache.conteos : null); // sin caché: directorio oculto hasta saber que hay fichas
    if (!cache || Date.now() - (cache.t || 0) > CACHE_TTL) refrescar();
  }

  // Si el menú ya está en el DOM (script tras el <aside>), se aplica ya para evitar parpadeo.
  if (document.readyState !== 'loading' || grupos().length) iniciar();
  else document.addEventListener('DOMContentLoaded', iniciar);
})();
