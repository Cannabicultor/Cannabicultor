(function () {
  'use strict';

  var CONFIG = {
    GA_MEASUREMENT_ID: '',
    SB_URL: 'https://gfyrsrdnvgnhtsuexjkb.supabase.co',
    SB_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdmeXJzcmRudmduaHRzdWV4amtiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MjIxNjUsImV4cCI6MjA5NDI5ODE2NX0.53peUmp28jF_b5tJFsHmP4STmGedRYUBV1WPItmdv50',
    SESSION_KEY: 'ga_sid',
    DEDUPE_KEY: 'ga_pv',
    DEDUPE_MS: 30000
  };

  function getSessionId() {
    var sid = localStorage.getItem(CONFIG.SESSION_KEY);
    if (!sid) {
      sid = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : 's-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      localStorage.setItem(CONFIG.SESSION_KEY, sid);
    }
    return sid;
  }

  function shouldTrack() {
    var key = CONFIG.DEDUPE_KEY + ':' + (location.pathname || '/');
    var last = parseInt(sessionStorage.getItem(key) || '0', 10);
    var now = Date.now();
    if (now - last < CONFIG.DEDUPE_MS) return false;
    sessionStorage.setItem(key, String(now));
    return true;
  }

  function sbHeaders() {
    return {
      'Content-Type': 'application/json',
      apikey: CONFIG.SB_KEY,
      Authorization: 'Bearer ' + CONFIG.SB_KEY
    };
  }

  function loadGA4() {
    var id = CONFIG.GA_MEASUREMENT_ID;
    if (!id || id.indexOf('XXXX') !== -1) return;

    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
    document.head.appendChild(script);

    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', id, { anonymize_ip: true, send_page_view: true });
  }

  function trackPageView() {
    if (!shouldTrack()) return;

    var payload = {
      page_path: location.pathname || '/',
      page_title: document.title || null,
      referrer: document.referrer || null,
      session_id: getSessionId(),
      user_agent: navigator.userAgent || null,
      screen_width: window.screen && window.screen.width ? window.screen.width : null,
      language: navigator.language || null
    };

    fetch(CONFIG.SB_URL + '/rest/v1/page_views', {
      method: 'POST',
      headers: Object.assign({}, sbHeaders(), { Prefer: 'return=minimal' }),
      body: JSON.stringify(payload),
      keepalive: true
    }).catch(function () {});
  }

  function formatCounter(data) {
    var total = data.total_views || 0;
    var today = data.today_views || 0;
    var text = total.toLocaleString('es-ES') + ' visitas';
    if (today > 0) text += ' · ' + today.toLocaleString('es-ES') + ' hoy';
    return text;
  }

  function updateCounter() {
    var el = document.getElementById('ga-visit-counter');
    if (!el) return;

    fetch(CONFIG.SB_URL + '/rest/v1/rpc/get_visit_stats', {
      method: 'POST',
      headers: sbHeaders(),
      body: '{}'
    })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (data) el.textContent = formatCounter(data);
      })
      .catch(function () {});
  }

  function fetchDashboard() {
    return fetch(CONFIG.SB_URL + '/rest/v1/rpc/get_analytics_dashboard', {
      method: 'POST',
      headers: sbHeaders(),
      body: '{}'
    }).then(function (res) {
      if (!res.ok) throw new Error('No se pudieron cargar las estadísticas');
      return res.json();
    });
  }

  window.CannabicultorAnalytics = {
    getSessionId: getSessionId,
    getStats: function () {
      return fetch(CONFIG.SB_URL + '/rest/v1/rpc/get_visit_stats', {
        method: 'POST',
        headers: sbHeaders(),
        body: '{}'
      }).then(function (res) {
        if (!res.ok) throw new Error('Stats unavailable');
        return res.json();
      });
    },
    getDashboard: fetchDashboard,
    refreshCounter: updateCounter
  };

  loadGA4();
  trackPageView();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateCounter);
  } else {
    updateCounter();
  }
})();