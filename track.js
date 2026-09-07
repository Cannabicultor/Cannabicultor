/* Cannabicultor — tracking unificado v1
   Se incluye en TODAS las páginas: <script src="/track.js" defer></script>
   Escribe en Supabase: page_views (vistas) y eventos (embudo). */
(function () {
  'use strict';

  var SUPABASE_URL = window.SUPABASE_URL || 'https://gfyrsrdnvgnhtsuexjkb.supabase.co';
  var SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdmeXJzcmRudmduaHRzdWV4amtiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MjIxNjUsImV4cCI6MjA5NDI5ODE2NX0.53peUmp28jF_b5tJFsHmP4STmGedRYUBV1WPItmdv50';

  if (navigator.doNotTrack === '1') return;

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

  function post(table, row, beacon) {
    var url = SUPABASE_URL + '/rest/v1/' + table;
    var body = JSON.stringify(row);
    if (beacon && navigator.sendBeacon) {
      try {
        navigator.sendBeacon(url + '?apikey=' + encodeURIComponent(SUPABASE_ANON_KEY),
          new Blob([body], { type: 'application/json' }));
        return;
      } catch (e) { /* cae al fetch */ }
    }
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

  post('page_views', {
    page_path: path,
    page_title: document.title || '',
    referrer: base.referrer,
    session_id: sid,
    user_agent: navigator.userAgent || '',
    screen_width: base.screen_width,
    language: navigator.language || ''
  });

  function track(evento, valor, meta, beacon) {
    var row = {
      evento: evento,
      valor: valor ? String(valor).slice(0, 300) : null,
      page_path: base.page_path,
      referrer: base.referrer,
      session_id: sid,
      screen_width: base.screen_width,
      meta: meta || null
    };
    post('eventos', row, beacon);
  }
  window.cc = window.cc || {};
  window.cc.track = track;
  window.cc.sid = sid;

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

  var hitos = { 50: false, 90: false };
  window.addEventListener('scroll', function () {
    var h = document.documentElement;
    var pct = ((h.scrollTop + window.innerHeight) / h.scrollHeight) * 100;
    Object.keys(hitos).forEach(function (k) {
      if (!hitos[k] && pct >= Number(k)) { hitos[k] = true; track('scroll', k + '%'); }
    });
  }, { passive: true });

  document.addEventListener('submit', function (ev) {
    var f = ev.target;
    if (!f || f.tagName !== 'FORM') return;
    track('form_submit', f.getAttribute('id') || f.getAttribute('name') || 'sin_id', null, true);
  }, true);

  var t0 = Date.now();
  window.addEventListener('pagehide', function () {
    track('salida', String(Math.round((Date.now() - t0) / 1000)) + 's', null, true);
  });
})();
