/* Cannabicultor — tracking unificado v2 (17/10/2026: envío por fetch keepalive + impresiones de CTA)
   Sustituye a cualquier snippet de page_views suelto.
   Se incluye en TODAS las páginas: <script src="/track.js?v=YYYYMMDD-slug" defer></script>
   Escribe en Supabase: page_views (vistas) y eventos (embudo).

   CACHE-BUSTING: el navegador y (si lo hay) el CDN delante del sitio cachean
   este archivo por su URL. Cualquier cambio futuro aquí NO llegará a quien
   ya visitó el sitio a menos que también subas el "?v=" del <script> en:
     - todas las páginas HTML mantenidas a mano que lo incluyen
     - prerender/build.mjs (plantilla de las páginas generadas: variedades/,
       breeders/, tiendas-cbd/)
   Sin ese cambio de versión, la URL "/track.js" no cambia y el navegador
   sigue sirviendo la copia cacheada de antes. */
(function () {
  'use strict';

  // ── Rellenar una sola vez (los mismos valores del snippet actual de la home) ──
  var SUPABASE_URL = window.SUPABASE_URL || 'https://gfyrsrdnvgnhtsuexjkb.supabase.co';
  var SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdmeXJzcmRudmduaHRzdWV4amtiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MjIxNjUsImV4cCI6MjA5NDI5ODE2NX0.53peUmp28jF_b5tJFsHmP4STmGedRYUBV1WPItmdv50';
  // ─────────────────────────────────────────────────────────────────────────────

  if (SUPABASE_ANON_KEY.indexOf('PEGAR') === 0) { console.warn('[track] falta anon key'); return; }
  if (navigator.doNotTrack === '1') return;

  // ── Marca de visita interna (Ernie / pruebas) ──
  // Activar:   cualquier página + ?interno=1   → se recuerda en este navegador
  // Desactivar: ?interno=0
  // Los datos siguen guardándose, pero con interno=true, y las vistas
  // v_trafico_real / v_eventos_real los excluyen.
  var interno = false;
  try {
    var q = location.search;
    if (q.indexOf('interno=1') > -1) localStorage.setItem('cc_interno', '1');
    if (q.indexOf('interno=0') > -1) localStorage.removeItem('cc_interno');
    interno = localStorage.getItem('cc_interno') === '1';
  } catch (e) {}

  // session_id estable: reutiliza el existente si ya hay uno
  var sid = null;
  try {
    var keys = ['cc_sid', 'session_id', 'sid'];
    for (var i = 0; i < keys.length; i++) {
      var v = sessionStorage.getItem(keys[i]) || localStorage.getItem(keys[i]);
      if (v) { sid = v; break; }
    }
    if (!sid) {
      sid = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
    }
    sessionStorage.setItem('cc_sid', sid);
  } catch (e) { sid = String(Date.now()); }

  var path = location.pathname + (location.search || '');
  var base = {
    session_id: sid,
    page_path: path,
    referrer: document.referrer || '',
    screen_width: window.innerWidth || 0
  };

  // OJO: NO usar navigator.sendBeacon aquí. Con Blob 'application/json' el navegador
  // lanza una petición con credenciales + preflight que Supabase rechaza (CORS), y
  // sendBeacon devuelve true aunque el evento se pierda. Medido el 17/10/2026: ningún
  // clic de CTA, form_submit ni nav_interna llegó nunca a la tabla eventos en Chrome.
  // fetch con keepalive sí sobrevive a la navegación y envía las cabeceras correctas.
  // El 3.er parámetro (beacon) se conserva por compatibilidad y se ignora.
  function post(table, row, beacon) {
    var url = SUPABASE_URL + '/rest/v1/' + table;
    var body = JSON.stringify(row);
    fetch(url, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        'Prefer': 'return=minimal'
      },
      body: body
    }).catch(function () {});
  }

  // ── 1. Vista de página (mismo esquema que hoy) ──
  post('page_views', {
    page_path: path,
    page_title: document.title || '',
    referrer: base.referrer,
    session_id: sid,
    user_agent: navigator.userAgent || '',
    screen_width: base.screen_width,
    language: navigator.language || '',
    interno: interno,
    host: location.hostname
  });

  // ── 2. API pública para eventos manuales: cc.track('registro_ok', email) ──
  function track(evento, valor, meta, beacon) {
    var row = {
      evento: evento,
      valor: valor ? String(valor).slice(0, 300) : null,
      page_path: base.page_path,
      referrer: base.referrer,
      session_id: sid,
      screen_width: base.screen_width,
      meta: meta || null,
      interno: interno,
      host: location.hostname
    };
    post('eventos', row, beacon);
  }
  window.cc = window.cc || {};
  window.cc.track = track;
  window.cc.sid = sid;
  window.cc.interno = interno;
  // Eventos disparados antes de que cargara este script (p. ej. /?q= al abrir la home)
  try { (window.__ccq || []).forEach(function (e) { track(e[0], e[1], e[2]); }); window.__ccq = []; } catch (e) {}

  // ── 3. Clics de CTA (automático) ──
  // Marca manual preferente: <a data-track="cta_registro_hero">
  // Si no hay marca, clasifica por destino.
  function clasificar(el) {
    var href = (el.getAttribute('href') || '').toLowerCase();
    if (!href) return null;
    if (href.indexOf('register') > -1) return 'cta_registro';
    if (href.indexOf('login') > -1) return 'cta_login';
    if (href.indexOf('#planes') > -1 || href.indexOf('precio') > -1) return 'cta_planes';
    if (href.indexOf('stripe') > -1 || href.indexOf('buy.stripe') > -1) return 'cta_pago';
    if (href.charAt(0) === '#') return 'ancla';
    if (href.indexOf('http') === 0 && href.indexOf(location.host) === -1) return 'salida_externa';
    return 'nav_interna';
  }

  document.addEventListener('click', function (ev) {
    var el = ev.target && ev.target.closest ? ev.target.closest('a,button,[data-track]') : null;
    if (!el) return;
    var manual = el.getAttribute('data-track');
    var tipo = manual || clasificar(el);
    if (!tipo) return;
    var texto = (el.innerText || el.textContent || '').trim().slice(0, 80);
    track(tipo, texto, { href: el.getAttribute('href') || null }, true);
  }, true);

  // ── 4. Profundidad de scroll (una vez por umbral) ──
  var hitos = { 50: false, 90: false };
  window.addEventListener('scroll', function () {
    var h = document.documentElement;
    var pct = ((h.scrollTop + window.innerHeight) / h.scrollHeight) * 100;
    Object.keys(hitos).forEach(function (k) {
      if (!hitos[k] && pct >= Number(k)) { hitos[k] = true; track('scroll', k + '%'); }
    });
  }, { passive: true });

  // ── 5. Envío de formularios ──
  document.addEventListener('submit', function (ev) {
    var f = ev.target;
    if (!f || f.tagName !== 'FORM') return;
    track('form_submit', f.getAttribute('id') || f.getAttribute('name') || 'sin_id', null, true);
  }, true);

  // ── 5b. Impresiones y foco de los CTA de las fichas SEO ──
  // Sin tocar las páginas ya generadas: se detectan por selector.
  //   cta_visto  -> el CTA entra en pantalla (una vez por página y nombre)
  //   dock_foco  -> el visitante pulsa en el cuadro "Pregúntale a la IA" (una vez por página)
  // El clic en el CTA lo recoge el listener de clics (data-track), y el envío del dock
  // lo recoge form_submit (id=ccDock). Así se calcula impresión -> foco -> envío -> registro.
  var CTA_VISTOS = [
    { sel: '.cc-dock', nombre: 'dock_pregunta' },
    { sel: '.cta-stick', nombre: 'cta_diario_sticky' },
    { sel: '[data-track-view]', nombre: null }
  ];
  function observarCtas() {
    if (!('IntersectionObserver' in window)) return;
    var vistos = {};
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        var nombre = el.getAttribute('data-track-view') || el.getAttribute('data-cta-nombre');
        if (!nombre || vistos[nombre]) return;
        vistos[nombre] = true;
        var tipo = (el.querySelector && el.querySelector('form[data-tipo]'))
          ? el.querySelector('form[data-tipo]').getAttribute('data-tipo') : null;
        track('cta_visto', nombre, tipo ? { tipo: tipo } : null);
        io.unobserve(el);
      });
    }, { threshold: 0.5 });
    CTA_VISTOS.forEach(function (c) {
      var nodos = document.querySelectorAll(c.sel);
      for (var i = 0; i < nodos.length; i++) {
        if (c.nombre && !nodos[i].getAttribute('data-cta-nombre')) nodos[i].setAttribute('data-cta-nombre', c.nombre);
        io.observe(nodos[i]);
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observarCtas);
  else observarCtas();

  var dockFoco = false;
  document.addEventListener('focusin', function (ev) {
    if (dockFoco || !ev.target || ev.target.id !== 'ccDockQ') return;
    dockFoco = true;
    var f = ev.target.form;
    track('dock_foco', f ? f.getAttribute('data-tipo') : null);
  });

  // ── 6. Tiempo en página al salir ──
  var t0 = Date.now();
  window.addEventListener('pagehide', function () {
    track('salida', String(Math.round((Date.now() - t0) / 1000)) + 's', null, true);
  });
})();
