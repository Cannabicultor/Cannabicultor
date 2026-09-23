/* Cannabicultor IA — carcasa común: menú móvil + chat contextual.
   El chat de las fichas no responde aquí: envía la pregunta a la home (/?q=), que
   la contesta con el límite anónimo y el registro dentro del chat. */
(function () {
  'use strict';
  var b = document.body;
  var burger = document.getElementById('ccBurger');
  var velo = document.getElementById('ccVelo');
  if (burger) burger.addEventListener('click', function () { b.classList.add('cc-menu'); });
  if (velo) velo.addEventListener('click', function () { b.classList.remove('cc-menu'); });

  // Marca la sección activa del menú
  var path = location.pathname;
  document.querySelectorAll('.cc-nav[data-match]').forEach(function (a) {
    if (path.indexOf(a.getAttribute('data-match')) === 0) a.classList.add('on');
  });

  var form = document.getElementById('ccDock');
  if (!form) return;
  b.classList.add('cc-con-dock');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var inp = form.querySelector('input');
    var q = (inp.value || '').trim();
    if (!q) { inp.focus(); return; }
    var ctx = form.getAttribute('data-contexto') || '';
    var pregunta = ctx ? (ctx + ': ' + q) : q;
    try { if (window.cc && window.cc.track) window.cc.track('chat_contextual', form.getAttribute('data-tipo') || 'pagina'); } catch (_) {}
    location.href = '/?q=' + encodeURIComponent(pregunta.slice(0, 480));
  });
})();
