/**
 * Banner fijo de urgencia — Alianza Cannabicultores.
 * Se inyecta en todas las páginas. Autocontenido (CSS + markup).
 * Ajusta el nav fijo del tema para que no quede tapado.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'ac-banner-dismissed';

  try {
    if (sessionStorage.getItem(STORAGE_KEY) === '1') return;
  } catch (e) { /* sessionStorage bloqueado */ }

  if (document.getElementById('ac-urgent-banner')) return;

  function mount() {
    if (document.getElementById('ac-urgent-banner')) return;

    var style = document.createElement('style');
    style.id = 'ac-urgent-banner-css';
    style.textContent = [
      '#ac-urgent-banner{',
      'position:fixed;top:0;left:0;right:0;z-index:9999;',
      'background:linear-gradient(90deg,#c0392b,#a5281a);color:#fff;',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;',
      'font-size:.9rem;padding:10px 16px;display:flex;align-items:center;',
      'justify-content:center;gap:14px;flex-wrap:wrap;',
      'box-shadow:0 2px 10px rgba(0,0,0,.25);',
      '}',
      '#ac-urgent-banner .ac-dot{width:8px;height:8px;border-radius:50%;background:#ffd166;animation:ac-pulse 1.4s infinite;flex-shrink:0;}',
      '@keyframes ac-pulse{0%{box-shadow:0 0 0 0 rgba(255,209,102,.6);}70%{box-shadow:0 0 0 8px rgba(255,209,102,0);}100%{box-shadow:0 0 0 0 rgba(255,209,102,0);}}',
      '#ac-urgent-banner strong{font-weight:800;}',
      '#ac-urgent-banner .ac-links{display:flex;gap:10px;flex-wrap:wrap;}',
      '#ac-urgent-banner a.ac-btn{background:#fff;color:#a5281a;font-weight:700;text-decoration:none;padding:6px 14px;border-radius:999px;font-size:.82rem;white-space:nowrap;transition:transform .15s ease;}',
      '#ac-urgent-banner a.ac-btn:hover{transform:translateY(-1px);}',
      '#ac-urgent-banner .ac-close{background:transparent;border:none;color:#fff;font-size:1.1rem;cursor:pointer;opacity:.75;line-height:1;padding:2px 6px;}',
      '#ac-urgent-banner .ac-close:hover{opacity:1;}',
      'body.ac-banner-active{padding-top:var(--ac-banner-h,52px);}',
      'body.ac-banner-active nav{top:var(--ac-banner-h,52px) !important;}',
      'html{scroll-padding-top:var(--ac-banner-h,0px);}'
    ].join('');
    document.head.appendChild(style);

    var banner = document.createElement('div');
    banner.id = 'ac-urgent-banner';
    banner.innerHTML =
      '<span class="ac-dot"></span>' +
      '<span><strong>Urgente:</strong> el proyecto de ley antitabaco puede acabar con los clubes sociales de cannabis. Firma antes de que termine el trámite parlamentario.</span>' +
      '<span class="ac-links">' +
        '<a class="ac-btn" href="https://c.org/ptW5TXJS28" target="_blank" rel="noopener">Firmar petición: clubes</a>' +
        '<a class="ac-btn" href="https://c.org/GnbVPnQM4v" target="_blank" rel="noopener">Firmar petición: multas</a>' +
      '</span>' +
      '<button type="button" class="ac-close" aria-label="Cerrar aviso">✕</button>';

    document.body.insertBefore(banner, document.body.firstChild);
    document.body.classList.add('ac-banner-active');

    function syncOffset() {
      if (!banner.isConnected || banner.style.display === 'none') return;
      var h = banner.offsetHeight || 52;
      document.documentElement.style.setProperty('--ac-banner-h', h + 'px');
    }

    function dismiss() {
      banner.remove();
      if (style.parentNode) style.remove();
      document.body.classList.remove('ac-banner-active');
      document.documentElement.style.removeProperty('--ac-banner-h');
      window.removeEventListener('resize', syncOffset);
      try { sessionStorage.setItem(STORAGE_KEY, '1'); } catch (e) { /* ignore */ }
    }

    banner.querySelector('.ac-close').addEventListener('click', dismiss);
    window.addEventListener('resize', syncOffset);
    syncOffset();
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(syncOffset);
    }
  }

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
