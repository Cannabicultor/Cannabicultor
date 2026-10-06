/* Cannabicultor — selector de país (bandera en la esquina superior derecha).
   El país sale de la URL (/ar/ /cl/ /co/ /mx/, subdominio legado o ?pais=), igual que config.js y menu-pais.js.
   Al elegir otro país se navega a su portada (España: /). No guarda nada ni pregunta: la bandera ya dice dónde estás.
   En la home se monta dentro de .top; en el resto, fija arriba a la derecha. */
(function () {
  'use strict';
  if (window.__ccSelectorPais) return;
  window.__ccSelectorPais = true;

  var PAISES = [
    { c: 'ES', n: 'España', ruta: '/' },
    { c: 'AR', n: 'Argentina', ruta: '/ar/' },
    { c: 'CL', n: 'Chile', ruta: '/cl/' },
    { c: 'CO', n: 'Colombia', ruta: '/co/' },
    { c: 'MX', n: 'México', ruta: '/mx/', pronto: true } // sin web abierta aún
  ];

  var FLAGS = {
    ES: '<rect width="22" height="15" fill="#c60b1e"/><rect y="3.75" width="22" height="7.5" fill="#ffc400"/>',
    AR: '<rect width="22" height="15" fill="#74acdf"/><rect y="5" width="22" height="5" fill="#fff"/><circle cx="11" cy="7.5" r="1.4" fill="#f6b40e"/>',
    CL: '<rect width="22" height="15" fill="#d52b1e"/><rect width="22" height="7.5" fill="#fff"/><rect width="7.5" height="7.5" fill="#0039a6"/><circle cx="3.75" cy="3.75" r="1.5" fill="#fff"/>',
    CO: '<rect width="22" height="15" fill="#fcd116"/><rect y="7.5" width="22" height="3.75" fill="#003893"/><rect y="11.25" width="22" height="3.75" fill="#ce1126"/>',
    MX: '<rect width="22" height="15" fill="#fff"/><rect width="7.33" height="15" fill="#006847"/><rect x="14.67" width="7.33" height="15" fill="#ce1126"/><circle cx="11" cy="7.5" r="1.6" fill="#8a6d3b"/>'
  };

  function bandera(c, extra) {
    return '<svg class="ccps-f" viewBox="0 0 22 15" aria-hidden="true"' + (extra || '') + '>' + FLAGS[c] + '</svg>';
  }

  var actual = window.CC_CONFIG && window.CC_CONFIG.PAIS;
  if (!actual) {
    var m = /^([a-z]{2})\.cannabicultor\.com$/.exec(location.hostname)
      || /^\/(ar|cl|co|mx)(?:\/|$)/.exec(location.pathname)
      || /[?&]pais=([a-z]{2})(?:&|$)/i.exec(location.search);
    actual = m && FLAGS[m[1].toUpperCase()] ? m[1].toUpperCase() : 'ES';
  }
  var pa = PAISES.filter(function (p) { return p.c === actual; })[0] || PAISES[0];

  var CLAVE_ELEGIDO = 'cc_pais_elegido'; // el usuario eligió país en el selector
  var CLAVE_GEO = 'cc_geo_hecho';        // ya se aplicó (o descartó) la detección por IP
  function leer(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function guardar(k) { try { localStorage.setItem(k, '1'); } catch (_) {} }

  /* Detección por IP: SOLO en la portada de España, UNA vez por navegador y nunca para bots.
     Si la IP es de un país con web abierta (AR/CL/CO), pasa a su portada. Cualquier otro caso se queda donde está.
     No actúa si: ya eligió país a mano, ya se hizo una vez, llega desde otra página del sitio (volver a
     "Inicio" es deliberado), la URL lleva ?q= o ?pais= (chat contextual / buscadores) o es un bot.
     Prueba: /?geo=CL fuerza el país sin consultar al Worker. */
  function detectarPorIp() {
    if (actual !== 'ES') return;
    if (location.pathname !== '/' && location.pathname !== '/index.html') return;
    if (/[?&](q|pais)=/i.test(location.search)) return;
    if (leer(CLAVE_ELEGIDO) || leer(CLAVE_GEO)) return;
    if (navigator.webdriver || /bot|crawl|spider|slurp|bing|facebookexternalhit|preview|lighthouse|headless|pagespeed/i.test(navigator.userAgent || '')) return;
    try { if (document.referrer && new URL(document.referrer).hostname === location.hostname) return; } catch (_) {}

    function ir(cod) {
      guardar(CLAVE_GEO);
      var p = PAISES.filter(function (x) { return x.c === String(cod || '').toUpperCase() && x.c !== 'ES' && !x.pronto; })[0];
      if (p) location.replace(p.ruta + location.search.replace(/[?&]geo=[A-Za-z]{2}/, '').replace(/^&/, '?') + location.hash);
    }

    var forzado = /[?&]geo=([A-Za-z]{2})(?:&|$)/.exec(location.search);
    if (forzado) { ir(forzado[1]); return; }

    var worker = window.CC_CONFIG && window.CC_CONFIG.WORKER_URL;
    if (!worker || !window.fetch) return;
    var ctl = window.AbortController ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, 1500);
    fetch(worker + '/geo', { signal: ctl ? ctl.signal : undefined, cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (d) { clearTimeout(t); ir(d && d.pais); })
      .catch(function () { clearTimeout(t); /* sin red o Worker sin /geo: se queda en España y se reintenta otra vez */ });
  }

  var css = '.ccps{position:relative;z-index:45;font-family:inherit;flex:none}'
    + '.ccps-fijo{position:fixed;top:10px;right:14px;z-index:45}'
    + '.ccps-btn{display:flex;align-items:center;gap:7px;height:32px;padding:0 9px;background:#fff;border:1px solid #d9dfd6;border-radius:8px;font:13px/1 inherit;font-family:inherit;color:#13201a;cursor:pointer;-webkit-appearance:none}'
    + '.ccps-btn:hover{border-color:#1a5c32;background:#eef2ec}'
    + '.ccps-btn:focus-visible,.ccps-op:focus-visible{outline:2px solid #1a5c32;outline-offset:2px}'
    + '.ccps-btn svg.ccps-chev{width:12px;height:12px;fill:none;stroke:#5b6b61;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}'
    + '.ccps-f{width:22px;height:15px;border-radius:2px;box-shadow:0 0 0 .5px rgba(0,0,0,.2);flex:none;display:block}'
    + '.ccps-menu{position:absolute;right:0;top:38px;width:220px;background:#fff;border:1px solid #d9dfd6;border-radius:10px;padding:6px;box-shadow:0 8px 24px rgba(15,48,32,.12);display:none}'
    + '.ccps-menu.on{display:block}'
    + '.ccps-cab{font-size:11px;color:#6e7d73;padding:6px 10px 4px}'
    + '.ccps-op{display:flex;align-items:center;gap:10px;width:100%;box-sizing:border-box;min-height:38px;padding:8px 10px;background:none;border:0;border-radius:6px;font:13.5px/1.2 inherit;font-family:inherit;color:#13201a;text-align:left;text-decoration:none;cursor:pointer}'
    + '.ccps-op:hover{background:#eef2ec}'
    + '.ccps-op[aria-current="true"]{font-weight:500}'
    + '.ccps-op .ccps-ck{margin-left:auto;width:14px;height:14px;fill:none;stroke:#1a5c32;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}'
    + '.ccps-op.ccps-off{color:#6e7d73;cursor:default}'
    + '.ccps-op.ccps-off:hover{background:none}'
    + '.ccps-op small{margin-left:auto;font-size:11px}'
    + '.top .sobre{margin-left:auto}'
    + '.top .ccps{margin-left:16px}'
    + '@media(max-width:860px){.ccps-nm{display:none}.ccps-btn{padding:0 8px;gap:5px}.top .ccps{margin-left:auto}.ccps-fijo{top:8px;right:10px}}';

  function montar() {
    var st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);

    var chev = '<svg class="ccps-chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5"/></svg>';
    var ck = '<svg class="ccps-ck" viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 7.5 5.5 10.5 11.5 3.5"/></svg>';

    var wrap = document.createElement('div');
    wrap.className = 'ccps';
    wrap.innerHTML = '<button type="button" class="ccps-btn" aria-haspopup="true" aria-expanded="false" aria-label="Cambiar de país. País actual: ' + pa.n + '">'
      + bandera(pa.c) + '<span class="ccps-nm">' + pa.n + '</span>' + chev + '</button>'
      + '<div class="ccps-menu" role="menu"><div class="ccps-cab">Elige tu país</div>'
      + PAISES.map(function (p) {
        var esActual = p.c === pa.c;
        if (p.pronto && !esActual) {
          return '<span class="ccps-op ccps-off" role="menuitem" aria-disabled="true">' + bandera(p.c, ' style="opacity:.5"') + p.n + '<small>Próximamente</small></span>';
        }
        return '<a class="ccps-op" role="menuitem" href="' + p.ruta + '"' + (esActual ? ' aria-current="true"' : '') + '>' + bandera(p.c) + p.n + (esActual ? ck : '') + '</a>';
      }).join('') + '</div>';

    var top = document.querySelector('.top');
    if (top) top.appendChild(wrap);
    else { wrap.classList.add('ccps-fijo'); document.body.appendChild(wrap); }

    var btn = wrap.querySelector('.ccps-btn');
    var menu = wrap.querySelector('.ccps-menu');
    function abrir(v) {
      menu.classList.toggle('on', v);
      btn.setAttribute('aria-expanded', v ? 'true' : 'false');
    }
    // Elegir país a mano manda para siempre sobre la detección por IP.
    // La navegación es explícita (no depende de que el toque llegue al enlace en móvil).
    menu.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a.ccps-op');
      if (!a) return;
      guardar(CLAVE_ELEGIDO);
      e.preventDefault();
      location.assign(a.getAttribute('href'));
    });
    btn.addEventListener('click', function (e) { e.stopPropagation(); abrir(!menu.classList.contains('on')); });
    document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) abrir(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { abrir(false); btn.focus(); } });
  }

  detectarPorIp();
  if (document.body) montar();
  else document.addEventListener('DOMContentLoaded', montar);
})();
