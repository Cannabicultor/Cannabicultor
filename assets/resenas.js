/* Reseñas de variedad / breeder. GET público, POST con JWT. */
(function (global) {
  var WORKER = 'https://growers-alliance-ai.nohumanclicks.workers.dev';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function jwt() {
    try { return localStorage.getItem('ga_jwt') || sessionStorage.getItem('ga_jwt') || ''; }
    catch (e) { return ''; }
  }
  function stars(n, interactive) {
    var html = '<span class="rev-stars' + (interactive ? ' rev-stars-in' : '') + '">';
    for (var i = 1; i <= 5; i++) {
      html += '<button type="button" class="rev-star" data-n="' + i + '" aria-label="' + i + '">' + (i <= n ? '★' : '☆') + '</button>';
    }
    return html + '</span>';
  }
  function fmtDate(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' }); }
    catch (e) { return ''; }
  }

  function render(el, tipo, id, data) {
    var items = (data && data.resenas) || [];
    var media = data && data.media;
    var total = (data && data.total) || 0;
    var logged = !!jwt();
    var copy = tipo === 'growshop'
      ? {
          h3: 'Reseñas de cultivadores',
          empty: 'Aún no hay reseñas de esta tienda. Sé el primero: atención, stock, precios, asesoramiento.',
          ph: '¿Cómo es la atención, el stock y el asesoramiento? (opcional)'
        }
      : tipo === 'asociacion'
      ? {
          h3: 'Reseñas de socios',
          empty: 'Aún no hay reseñas de esta asociación. Ambiente, trato, variedades, cuota…',
          ph: '¿Cómo es el ambiente, el trato y el acceso? (opcional)'
        }
      : {
          h3: 'Reseñas de cultivadores',
          empty: 'Aún no hay reseñas. Sé el primero en contar tu experiencia.',
          ph: '¿Cómo se comportó en tu cultivo? (opcional)'
        };
    var head = total
      ? '<div class="rev-avg">' + stars(Math.round(media || 0), false) +
        ' <b>' + (media || '—') + '</b> · ' + total + ' reseña' + (total === 1 ? '' : 's') + '</div>'
      : '<p class="rev-empty">' + copy.empty + '</p>';
    var list = items.map(function (r) {
      return '<article class="rev-item"><div class="rev-meta">' + stars(r.puntuacion, false) +
        ' <span>' + esc(r.nombre_publico || 'Cultivador') + '</span> · <time>' + esc(fmtDate(r.created_at)) +
        '</time></div>' + (r.texto ? '<p>' + esc(r.texto) + '</p>' : '') + '</article>';
    }).join('');
    var form = logged
      ? '<form class="rev-form"><div class="rev-lab">Tu reseña</div>' + stars(0, true) +
        '<input type="hidden" name="puntuacion" value="">' +
        '<textarea name="texto" maxlength="800" rows="3" placeholder="' + copy.ph + '"></textarea>' +
        '<button type="submit" class="rev-send">Publicar reseña</button>' +
        '<p class="rev-msg" hidden></p></form>'
      : '<p class="rev-login">Para dejar una reseña, <a href="/login.html">inicia sesión</a>.</p>';
    el.innerHTML = '<section class="rev-box"><h3>' + copy.h3 + '</h3>' + head + list + form + '</section>';

    var hidden = el.querySelector('input[name="puntuacion"]');
    el.querySelectorAll('.rev-stars-in .rev-star').forEach(function (btn) {
      btn.onclick = function () {
        var n = +btn.getAttribute('data-n');
        if (hidden) hidden.value = String(n);
        el.querySelectorAll('.rev-stars-in .rev-star').forEach(function (b) {
          b.textContent = (+b.getAttribute('data-n') <= n) ? '★' : '☆';
        });
      };
    });
    var formEl = el.querySelector('.rev-form');
    if (!formEl) return;
    formEl.onsubmit = function (e) {
      e.preventDefault();
      var pts = parseInt(hidden && hidden.value, 10);
      var msg = el.querySelector('.rev-msg');
      if (!pts) {
        if (msg) { msg.hidden = false; msg.textContent = 'Elige una puntuación de 1 a 5.'; }
        return;
      }
      var btn = formEl.querySelector('.rev-send');
      btn.disabled = true;
      fetch(WORKER + '/resenas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jwt() },
        body: JSON.stringify({
          tipo: tipo,
          id: id,
          puntuacion: pts,
          texto: (formEl.texto && formEl.texto.value) || ''
        })
      }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (x) {
          if (!x.ok) throw new Error(x.d.error || 'No se pudo guardar');
          return load(el, tipo, id);
        })
        .catch(function (err) {
          btn.disabled = false;
          if (msg) { msg.hidden = false; msg.textContent = err.message || 'Error al publicar'; }
        });
    };
  }

  function load(el, tipo, id) {
    el.innerHTML = '<section class="rev-box"><h3>Reseñas de cultivadores</h3><p class="rev-empty">Cargando…</p></section>';
    return fetch(WORKER + '/resenas?tipo=' + encodeURIComponent(tipo) + '&id=' + encodeURIComponent(id))
      .then(function (r) { return r.json(); })
      .then(function (data) { render(el, tipo, id, data); })
      .catch(function () {
        el.innerHTML = '<section class="rev-box"><h3>Reseñas de cultivadores</h3><p class="rev-empty">No se pudieron cargar las reseñas.</p></section>';
      });
  }

  function mount(el, tipo, id) {
    if (!el || !tipo || !id) return;
    load(el, tipo, id);
  }

  function auto() {
    document.querySelectorAll('[data-resenas][data-tipo][data-id]').forEach(function (el) {
      mount(el, el.getAttribute('data-tipo'), el.getAttribute('data-id'));
    });
  }

  global.CCResenas = { mount: mount };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto);
  else auto();
})(window);
