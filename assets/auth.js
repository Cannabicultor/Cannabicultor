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

  function postAuthDestination() {
    return isTestPassed() ? '/dashboard.html' : '/test.html';
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
    window.location.href = '/dashboard.html?new=true';
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

  function syncTestPassedFromServer(email) {
    if (!email || isTestPassed()) {
      return Promise.resolve(isTestPassed());
    }
    return fetch(SB_URL + '/rest/v1/test_resultados?email=eq.' + encodeURIComponent(email) + '&select=id&limit=1', {
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY }
    })
      .then(function (res) { return res.ok ? res.json() : []; })
      .then(function (rows) {
        if (rows && rows.length > 0) {
          localStorage.setItem('ga_test_passed', 'true');
          return true;
        }
        return false;
      })
      .catch(function () { return false; });
  }

  global.GAAuth = {
    parseJwt: parseJwt,
    isJwtValid: isJwtValid,
    normalizePlan: normalizePlan,
    isTestPassed: isTestPassed,
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