(function (global) {
  'use strict';

  var SESSION_KEYS = ['ga_jwt', 'ga_email', 'ga_nivel', 'ga_chat_date', 'ga_chat_count', 'ga_perfil', 'cc_token'];
  var COOKIE_KEYS = ['ga_jwt', 'ga_email', 'ga_nivel'];
  var VALID_PLANS = ['libre', 'fundador', 'semilla', 'cultivador', 'master', 'genetista'];
  var COOKIE_DAYS = 30;

  function setCookie(name, value, days) {
    var max = Math.round((days || COOKIE_DAYS) * 86400);
    var parts = name + '=' + encodeURIComponent(value == null ? '' : String(value)) +
      '; Path=/; Max-Age=' + max + '; SameSite=Lax';
    if (location.protocol === 'https:') parts += '; Secure';
    document.cookie = parts;
  }

  function getCookie(name) {
    var esc = name.replace(/[.$?*|{}()[\]\\/+^]/g, '\\$&');
    var m = document.cookie.match(new RegExp('(?:^|; )' + esc + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  }

  function delCookie(name) {
    // Hay que repetir Path/Secure/Domain o el navegador no borra la cookie
    // que escribió setCookie (en HTTPS lleva Secure).
    var base = name + '=; Path=/; Max-Age=0; SameSite=Lax';
    var secure = location.protocol === 'https:' ? '; Secure' : '';
    var host = location.hostname || '';
    document.cookie = base + secure;
    document.cookie = base;
    if (host) {
      document.cookie = base + secure + '; Domain=' + host;
      if (host.indexOf('.') !== -1) {
        document.cookie = base + secure + '; Domain=.' + host.replace(/^www\./, '');
      }
    }
  }

  function writeSessionCookies(token, email, nivel) {
    if (token) setCookie('ga_jwt', token);
    if (email) setCookie('ga_email', email);
    if (nivel) setCookie('ga_nivel', nivel);
  }

  function clearSessionCookies() {
    COOKIE_KEYS.forEach(delCookie);
  }

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
    if (p === 'semilla_fundador') return 'fundador';
    return VALID_PLANS.indexOf(p) !== -1 ? p : 'libre';
  }

  function saveSession(token, email, data) {
    var nivel = normalizePlan(
      data && (data.nivel || data.plan || (data.user && (data.user.nivel || data.user.plan)))
    );
    localStorage.setItem('ga_jwt', token);
    localStorage.setItem('ga_email', email);
    localStorage.setItem('ga_nivel', nivel);
    // Cookie de primer partido: el icono de pantalla de inicio (iOS/Android)
    // a veces no comparte localStorage con Safari/Chrome. Así el acceso
    // directo entra sin volver a pedir login.
    writeSessionCookies(token, email, nivel);
  }

  function clearSession() {
    SESSION_KEYS.forEach(function (k) {
      localStorage.removeItem(k);
      try { sessionStorage.removeItem(k); } catch (e) {}
    });
    clearSessionCookies();
  }

  // Recupera el JWT de localStorage o, si falta (PWA / acceso directo), de cookie.
  function readSession() {
    var token = localStorage.getItem('ga_jwt') ||
      (function () { try { return sessionStorage.getItem('ga_jwt'); } catch (e) { return null; } })() ||
      localStorage.getItem('cc_token');
    if (!isJwtValid(token)) token = getCookie('ga_jwt');
    if (!isJwtValid(token)) return null;
    if (!localStorage.getItem('ga_jwt')) {
      localStorage.setItem('ga_jwt', token);
      var email = getCookie('ga_email');
      var nivel = getCookie('ga_nivel');
      if (email) localStorage.setItem('ga_email', email);
      if (nivel) localStorage.setItem('ga_nivel', nivel);
    }
    writeSessionCookies(
      token,
      localStorage.getItem('ga_email') || getCookie('ga_email'),
      localStorage.getItem('ga_nivel') || getCookie('ga_nivel')
    );
    return token;
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

  function safeNextPath() {
    try {
      var n = new URLSearchParams(location.search).get('next') || '';
      if (!n || n.charAt(0) !== '/' || n.indexOf('//') !== -1) return '';
      if (!/^\/[A-Za-z0-9_./?#=-]*$/.test(n)) return '';
      return n;
    } catch (e) { return ''; }
  }

  function postAuthDestination() {
    return safeNextPath() || '/mi-cultivo.html';
  }

  function redirectIfAuthenticated() {
    var token = readSession();
    if (!isJwtValid(token)) {
      if (localStorage.getItem('ga_jwt') || getCookie('ga_jwt')) clearSession();
      return false;
    }
    window.location.replace(postAuthDestination());
    return true;
  }

  function requireAuth() {
    var token = readSession();
    if (!isJwtValid(token)) {
      clearSession();
      window.location.replace('/login.html');
      return null;
    }
    return token;
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
    window.location.replace('/login.html?logout=1');
  }

  global.GAAuth = {
    parseJwt: parseJwt,
    isJwtValid: isJwtValid,
    normalizePlan: normalizePlan,
    isMobileDevice: isMobileDevice,
    saveSession: saveSession,
    clearSession: clearSession,
    readSession: readSession,
    postAuthDestination: postAuthDestination,
    redirectIfAuthenticated: redirectIfAuthenticated,
    requireAuth: requireAuth,
    getDisplayName: getDisplayName,
    loadDailyChatCount: loadDailyChatCount,
    saveDailyChatCount: saveDailyChatCount,
    logout: logout
  };
})(window);