(function (global) {
  'use strict';

  var SESSION_KEYS = ['ga_jwt', 'ga_email', 'ga_nivel', 'ga_test_passed', 'ga_chat_date', 'ga_chat_count'];
  var VALID_PLANS = ['libre', 'semilla', 'cultivador', 'master', 'genetista'];

  function parseJwt(token) {
    try {
      var payload = token.split('.')[1];
      var json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(json);
    } catch (e) {
      return null;
    }
  }

  function isJwtValid(token) {
    if (!token) return false;
    var claims = parseJwt(token);
    if (!claims) return false;
    if (claims.exp && claims.exp * 1000 < Date.now()) return false;
    return true;
  }

  function normalizePlan(plan) {
    var p = String(plan || 'libre').toLowerCase().trim();
    return VALID_PLANS.indexOf(p) !== -1 ? p : 'libre';
  }

  function isTestPassed() {
    return localStorage.getItem('ga_test_passed') === 'true';
  }

  function testPassedFromApi(data) {
    if (!data) return false;
    if (data.test_passed || data.testPassed) return true;
    if (data.user && (data.user.test_passed || data.user.testPassed)) return true;
    return false;
  }

  function saveSession(token, email, data) {
    localStorage.setItem('ga_jwt', token);
    localStorage.setItem('ga_email', email);
    localStorage.setItem('ga_nivel', normalizePlan(
      data && (data.nivel || data.plan || (data.user && (data.user.nivel || data.user.plan)))
    ));
    if (testPassedFromApi(data)) {
      localStorage.setItem('ga_test_passed', 'true');
    }
  }

  function clearSession() {
    SESSION_KEYS.forEach(function (k) { localStorage.removeItem(k); });
  }

  // Detección de dispositivo para elegir la interfaz post-login.
  // Se combinan dos señales con OR (basta con que UNA indique "móvil"):
  //   1) userAgent — clase de dispositivo declarada por el navegador. Un
  //      teléfono real debe ir a app.html aunque reporte un ancho atípico.
  //   2) viewport < 768px — una ventana estrecha se ve mejor en la UI móvil,
  //      aunque el equipo sea de escritorio.
  // Caso especial: iPadOS 13+ se identifica como "Macintosh"; se distingue por
  //   el soporte táctil (maxTouchPoints > 1) para tratarlo como tablet.
  function isMobileDevice() {
    var ua = navigator.userAgent || '';
    var uaMobile = /Android|iPhone|iPad|iPod|Mobile|Opera Mini|IEMobile|BlackBerry/i.test(ua);
    var iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
    var narrow = (window.innerWidth || document.documentElement.clientWidth || 0) < 768;
    return uaMobile || iPadOS || narrow;
  }

  function postAuthDestination() {
    // Registro nuevo (test sin superar): siempre al Test de Acceso, con
    // independencia del dispositivo. Preserva el flujo register -> test.html.
    if (!isTestPassed()) return '/test.html';
    // Usuario verificado: interfaz según dispositivo.
    //   móvil / tablet -> app.html      (nav inferior, vista compacta)
    //   escritorio     -> dashboard.html (sidebar, vista amplia)
    return isMobileDevice() ? '/app.html' : '/dashboard.html';
  }

  function redirectIfAuthenticated() {
    var token = localStorage.getItem('ga_jwt');
    if (!isJwtValid(token)) {
      if (token) clearSession();
      return false;
    }
    window.location.replace(postAuthDestination());
    return true;
  }

  function requireAuth() {
    var token = localStorage.getItem('ga_jwt');
    if (!isJwtValid(token)) {
      clearSession();
      window.location.replace('/login.html');
      return null;
    }
    return token;
  }

  function requireTestPassed() {
    if (!isTestPassed()) {
      window.location.replace('/test.html');
      return false;
    }
    return true;
  }

  function finishTest(plan) {
    localStorage.setItem('ga_nivel', normalizePlan(plan));
    localStorage.setItem('ga_test_passed', 'true');
    // Persistencia server-side: test.html ya inserta el resultado en
    // test_resultados (fuente de verdad actual). La columna canónica
    // users.test_passed debería escribirla el worker (service_role) — ver
    // migración y nota de seguridad. Aquí NO escribimos con la anon key.
    // Routing device-aware: pasa SIEMPRE por postAuthDestination (regla:
    // ningún redirect del flujo de auth hardcodea dashboard). Conserva
    // ?new=true; el onboarding lo atienden ambas interfaces (app/dashboard).
    var dest = postAuthDestination();
    window.location.href = dest + (dest.indexOf('?') === -1 ? '?' : '&') + 'new=true';
  }

  function getDisplayName() {
    var email = localStorage.getItem('ga_email') || '';
    if (!email) return 'cultivador';
    var name = email.split('@')[0].replace(/[._]/g, ' ');
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  function loadDailyChatCount() {
    var today = new Date().toISOString().slice(0, 10);
    var savedDate = localStorage.getItem('ga_chat_date');
    if (savedDate !== today) {
      localStorage.setItem('ga_chat_date', today);
      localStorage.setItem('ga_chat_count', '0');
      return 0;
    }
    return parseInt(localStorage.getItem('ga_chat_count') || '0', 10);
  }

  function saveDailyChatCount(count) {
    localStorage.setItem('ga_chat_date', new Date().toISOString().slice(0, 10));
    localStorage.setItem('ga_chat_count', String(count));
  }

  function logout() {
    clearSession();
    window.location.replace('/login.html');
  }

  var SB_URL = 'https://gfyrsrdnvgnhtsuexjkb.supabase.co';
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdmeXJzcmRudmduaHRzdWV4amtiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MjIxNjUsImV4cCI6MjA5NDI5ODE2NX0.53peUmp28jF_b5tJFsHmP4STmGedRYUBV1WPItmdv50';

  // Sincroniza el estado del test desde el servidor y cachea en localStorage.
  // Fuente de verdad: users.test_passed (columna canónica); si no está poblada
  // todavía, cae al legacy test_resultados. Es la vía para que el test NO se
  // repita aunque Safari/ITP haya limpiado localStorage o el usuario cambie de
  // dispositivo. Async: se invoca en los puntos de entrada async (login.html,
  // index.html, test.html) ANTES de decidir el destino con postAuthDestination.
  function syncTestPassedFromServer(email) {
    if (!email || isTestPassed()) {
      return Promise.resolve(isTestPassed());
    }
    // Legacy fallback: la tabla test_resultados (escrita por test.html) sigue
    // sirviendo mientras users.test_passed no esté poblada por el worker.
    function checkLegacy() {
      return fetch(SB_URL + '/rest/v1/test_resultados?email=eq.' + encodeURIComponent(email) + '&select=id&limit=1', {
        headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY }
      })
        .then(function (res) { return res.ok ? res.json() : []; })
        .then(function (rows) {
          if (rows && rows.length > 0) { localStorage.setItem('ga_test_passed', 'true'); return true; }
          return false;
        });
    }
    // Fuente canónica vía RPC SECURITY DEFINER: expone SOLO el booleano, sin
    // abrir la tabla users a la anon key. Ver migración (get_test_passed).
    return fetch(SB_URL + '/rest/v1/rpc/get_test_passed', {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_email: email })
    })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (val) {
        if (val === true) { localStorage.setItem('ga_test_passed', 'true'); return true; }
        return checkLegacy();
      })
      .catch(function () { return checkLegacy().catch(function () { return false; }); });
  }

  global.GAAuth = {
    parseJwt: parseJwt,
    isJwtValid: isJwtValid,
    normalizePlan: normalizePlan,
    isTestPassed: isTestPassed,
    isMobileDevice: isMobileDevice,
    testPassedFromApi: testPassedFromApi,
    saveSession: saveSession,
    clearSession: clearSession,
    postAuthDestination: postAuthDestination,
    redirectIfAuthenticated: redirectIfAuthenticated,
    requireAuth: requireAuth,
    requireTestPassed: requireTestPassed,
    finishTest: finishTest,
    getDisplayName: getDisplayName,
    loadDailyChatCount: loadDailyChatCount,
    saveDailyChatCount: saveDailyChatCount,
    logout: logout,
    syncTestPassedFromServer: syncTestPassedFromServer
  };
})(window);