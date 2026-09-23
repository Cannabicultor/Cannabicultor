/*! Asesor de cultivo · Cannabicultor IA — widget para tiendas
 * Instalación (una línea, antes de </body>):
 *   <script src="https://cannabicultor.com/assets/asesor.js?k=TU_CLAVE" async></script>
 * Todo lo demás (color, nombre, saludo, catálogo) se configura en nuestro lado.
 * API opcional: window.Asesor.open() · window.Asesor.ask("texto")
 */
(function () {
  "use strict";
  if (window.__asesorCannabicultor) return;
  window.__asesorCannabicultor = true;

  var API = "https://growers-alliance-ai.nohumanclicks.workers.dev";
  var me = document.currentScript || (function () {
    var s = document.querySelectorAll("script[src*='asesor.js']");
    return s[s.length - 1];
  })();
  var KEY = "";
  try { KEY = new URL(me.src).searchParams.get("k") || me.getAttribute("data-k") || ""; } catch (e) {}
  if (!/^[a-f0-9]{16}$/.test(KEY)) { console.warn("[Asesor] Falta la clave (?k=) en el script."); return; }

  var SKEY = "asesor_cc_" + KEY;
  var history = [], conversationId = null;
  try {
    var saved = JSON.parse(sessionStorage.getItem(SKEY) || "null");
    if (saved && Array.isArray(saved.h)) { history = saved.h.slice(-20); conversationId = saved.c || null; }
  } catch (e) {}
  function persist() {
    try { sessionStorage.setItem(SKEY, JSON.stringify({ h: history.slice(-20), c: conversationId })); } catch (e) {}
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function eur(n) {
    if (n == null || isNaN(n)) return "";
    return Number(n).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
  }
  function safeUrl(u) { return /^https?:\/\//i.test(String(u || "")) ? String(u) : ""; }

  function start(CFG) {
    var ACCENT = CFG.color || "#1f7a4d";
    var LADO = CFG.posicion === "izquierda" ? "left" : "right";
    function imgUrl(p) {
      var path = p.imagen_principal || p.imagen || "";
      if (!path) return "";
      if (/^(https?|data):/.test(path)) return path;
      return CFG.imgBase ? CFG.imgBase + String(path).replace(/^\//, "") : "";
    }
    function productHref(p) {
      if (safeUrl(p.url)) return p.url;
      if (!CFG.productHref) return null;
      return CFG.productHref.replace("{sku}", encodeURIComponent(p.sku || "")).replace("{slug}", encodeURIComponent(p.slug || ""));
    }

    var CSS =
      ":host{all:initial}" +
      "*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,sans-serif}" +
      ".launcher{position:fixed;bottom:20px;" + LADO + ":20px;z-index:2147483000;height:56px;padding:0 20px 0 16px;border-radius:28px;border:none;cursor:pointer;background:" + ACCENT + ";color:#fff;box-shadow:0 6px 20px rgba(0,0,0,.25);display:flex;align-items:center;gap:8px;font-size:15px;font-weight:600;transition:transform .15s}" +
      ".launcher:hover{transform:scale(1.04)}.launcher svg{width:24px;height:24px;flex:none}" +
      ".panel{position:fixed;bottom:20px;" + LADO + ":20px;z-index:2147483001;width:380px;max-width:calc(100vw - 32px);height:600px;max-height:calc(100vh - 40px);background:#fff;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.28);display:none;flex-direction:column;overflow:hidden}" +
      ".panel.open{display:flex}" +
      ".hd{background:" + ACCENT + ";color:#fff;padding:14px 16px;display:flex;align-items:center;gap:10px}" +
      ".hd img{height:28px;width:auto;border-radius:4px;background:#fff;padding:2px}" +
      ".hd .t{font-weight:600;font-size:15px;line-height:1.15}.hd .s{font-size:11.5px;opacity:.85}" +
      ".hd .x{margin-left:auto;background:none;border:none;color:#fff;font-size:24px;cursor:pointer;line-height:1;opacity:.9;width:36px;height:36px}" +
      ".body{flex:1;overflow-y:auto;padding:14px;background:#f7f7f5}" +
      ".msg{margin:0 0 12px;display:flex}.msg.u{justify-content:flex-end}" +
      ".bub{max-width:85%;padding:10px 13px;border-radius:14px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word}" +
      ".msg.a .bub{background:#fff;color:#222;border:1px solid #ececec;border-bottom-left-radius:4px}" +
      ".msg.u .bub{background:" + ACCENT + ";color:#fff;border-bottom-right-radius:4px}" +
      ".cards{display:flex;flex-direction:column;gap:8px;margin:2px 0 12px}" +
      ".card{display:flex;gap:10px;background:#fff;border:1px solid #ececec;border-radius:12px;padding:8px;text-decoration:none;color:inherit}" +
      "a.card:hover{border-color:" + ACCENT + "}" +
      ".card img,.card .ph{width:56px;height:56px;object-fit:contain;border-radius:8px;background:#f2f0ea;flex:none}" +
      ".card .ci{min-width:0;display:flex;flex-direction:column;justify-content:center}" +
      ".card .n{font-size:13px;font-weight:600;color:#222;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}" +
      ".card .m{font-size:11px;color:#888}.card .p{font-size:13px;font-weight:700;color:" + ACCENT + ";margin-top:2px}" +
      ".card .ver{font-size:11.5px;color:" + ACCENT + ";margin-top:2px}" +
      ".sugs{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}" +
      ".sug{border:1px solid #d8d8d2;background:#fff;color:#444;border-radius:14px;padding:7px 11px;font-size:12.5px;cursor:pointer}" +
      ".sug:hover{border-color:" + ACCENT + ";color:" + ACCENT + "}" +
      ".foot{border-top:1px solid #ececec;background:#fff;padding:10px}" +
      ".row{display:flex;gap:8px;align-items:flex-end}" +
      ".row textarea{flex:1;resize:none;border:1px solid #ddd;border-radius:12px;padding:10px 12px;font-size:16px;max-height:96px;outline:none;color:#222;background:#fff}" +
      ".row textarea:focus{border-color:" + ACCENT + "}" +
      ".send{border:none;background:" + ACCENT + ";color:#fff;width:44px;height:44px;border-radius:12px;cursor:pointer;flex:none;display:flex;align-items:center;justify-content:center}" +
      ".send:disabled{opacity:.5;cursor:default}.send svg{width:20px;height:20px}" +
      ".badge{text-align:center;font-size:11px;color:#9a9a9a;padding:6px 0 2px}.badge a{color:#9a9a9a}" +
      ".typing{display:inline-flex;gap:4px;padding:4px 2px}.typing i{width:6px;height:6px;border-radius:50%;background:#bbb;animation:bl 1s infinite}" +
      ".typing i:nth-child(2){animation-delay:.2s}.typing i:nth-child(3){animation-delay:.4s}" +
      "@keyframes bl{0%,80%,100%{opacity:.3}40%{opacity:1}}" +
      "@media(max-width:480px){.panel{width:100vw;max-width:100vw;height:100%;max-height:100%;bottom:0;" + LADO + ":0;border-radius:0}.launcher{bottom:14px;" + LADO + ":14px}}" +
      "@media(prefers-reduced-motion:reduce){.typing i{animation:none}.launcher{transition:none}}";

    var host = document.createElement("div");
    host.id = "asesor-cannabicultor";
    document.body.appendChild(host);
    var root = host.attachShadow({ mode: "open" });
    var style = document.createElement("style");
    style.textContent = CSS;
    root.appendChild(style);

    var chatIcon = "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M21 11.5a8.4 8.4 0 0 1-9 8.5 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7A8.4 8.4 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5z'/></svg>";
    var sendIcon = "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M12 19V5M5 12l7-7 7 7'/></svg>";

    var launcher = document.createElement("button");
    launcher.className = "launcher";
    launcher.setAttribute("aria-label", "Abrir " + CFG.nombre);
    launcher.innerHTML = chatIcon + "<span>" + esc(CFG.boton || "¿Te ayudo a elegir?") + "</span>";

    var panel = document.createElement("div");
    panel.className = "panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", CFG.nombre);
    panel.innerHTML =
      "<div class='hd'>" + (safeUrl(CFG.logo) ? "<img src='" + esc(CFG.logo) + "' alt=''>" : "") +
      "<div><div class='t'>" + esc(CFG.nombre) + "</div><div class='s'>" + esc(CFG.subtitulo) + "</div></div>" +
      "<button class='x' aria-label='Cerrar'>×</button></div>" +
      "<div class='body' aria-live='polite'></div>" +
      "<div class='foot'><div class='row'><textarea rows='1' aria-label='Tu pregunta' placeholder='" + esc(CFG.placeholder) + "'></textarea>" +
      "<button class='send' aria-label='Enviar'>" + sendIcon + "</button></div>" +
      "<div class='badge'>Asesor con IA de <a href='https://cannabicultor.com/empresas.html?utm_source=widget' target='_blank' rel='noopener'>Cannabicultor</a> · solo +18</div></div>";

    root.appendChild(launcher);
    root.appendChild(panel);

    var body = panel.querySelector(".body");
    var ta = panel.querySelector("textarea");
    var sendBtn = panel.querySelector(".send");

    function open() {
      panel.classList.add("open");
      launcher.style.display = "none";
      if (!body.childElementCount) restore();
      setTimeout(function () { ta.focus(); }, 50);
    }
    function close() {
      panel.classList.remove("open");
      launcher.style.display = "flex";
    }
    launcher.addEventListener("click", open);
    panel.querySelector(".x").addEventListener("click", close);
    panel.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });

    function scrollDown() { body.scrollTop = body.scrollHeight; }
    function addMsg(role, text) {
      var m = document.createElement("div");
      m.className = "msg " + (role === "user" ? "u" : "a");
      var b = document.createElement("div");
      b.className = "bub";
      b.textContent = text;
      m.appendChild(b);
      body.appendChild(m);
      scrollDown();
    }
    function productsFromToolCalls(tc) {
      var out = [];
      (Array.isArray(tc) ? tc : []).forEach(function (t) {
        if (t && t.tool === "buscar_productos" && t.result && Array.isArray(t.result.resultados)) out = out.concat(t.result.resultados);
      });
      return out.slice(0, 4);
    }
    function addCards(products) {
      if (!products.length) return;
      var wrap = document.createElement("div");
      wrap.className = "cards";
      products.forEach(function (p) {
        var href = productHref(p);
        var el = document.createElement(href ? "a" : "div");
        el.className = "card";
        if (href) { el.href = href; el.target = "_top"; }
        var img = imgUrl(p);
        el.innerHTML = (img ? "<img src='" + esc(img) + "' alt='' loading='lazy'>" : "<div class='ph'></div>") +
          "<div class='ci'><div class='n'>" + esc(p.nombre) + "</div>" +
          (p.categoria ? "<div class='m'>" + esc(p.categoria) + "</div>" : "") +
          (p.precio_eur != null ? "<div class='p'>" + esc(eur(p.precio_eur)) + "</div>" : "") +
          (href ? "<div class='ver'>Ver producto →</div>" : "") + "</div>";
        wrap.appendChild(el);
      });
      body.appendChild(wrap);
      scrollDown();
    }
    function addSuggestions() {
      var wrap = document.createElement("div");
      wrap.className = "sugs";
      (CFG.sugerencias || []).forEach(function (s) {
        var b = document.createElement("button");
        b.className = "sug";
        b.textContent = s;
        b.addEventListener("click", function () { wrap.remove(); send(s); });
        wrap.appendChild(b);
      });
      body.appendChild(wrap);
      scrollDown();
    }
    function restore() {
      addMsg("assistant", CFG.saludo);
      if (!history.length) { addSuggestions(); return; }
      history.forEach(function (m) { addMsg(m.role, m.content); });
    }
    function showTyping() {
      var m = document.createElement("div");
      m.className = "msg a";
      m.innerHTML = "<div class='bub'><span class='typing' aria-label='Escribiendo'><i></i><i></i><i></i></span></div>";
      body.appendChild(m);
      scrollDown();
      return m;
    }

    var busy = false;
    function send(text) {
      text = (text || ta.value || "").trim().slice(0, 1500);
      if (!text || busy) return;
      busy = true;
      sendBtn.disabled = true;
      ta.value = "";
      ta.style.height = "auto";
      addMsg("user", text);
      history.push({ role: "user", content: text });
      var typing = showTyping();
      fetch(API + "/widget/chat", {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: JSON.stringify({ k: KEY, messages: history.slice(-20), conversation_id: conversationId }),
      })
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(function (data) {
          typing.remove();
          if (data && data.conversation_id) conversationId = data.conversation_id;
          var reply = (data && data.assistant_message) || "No he podido generar respuesta.";
          addMsg("assistant", reply);
          history.push({ role: "assistant", content: reply });
          addCards(productsFromToolCalls(data && data.tool_calls));
          persist();
        })
        .catch(function () {
          typing.remove();
          history.pop();
          addMsg("assistant", "Ha habido un problema al consultar el asesor. Inténtalo de nuevo en un momento.");
        })
        .then(function () { busy = false; sendBtn.disabled = false; ta.focus(); });
    }

    ta.addEventListener("input", function () {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 96) + "px";
    });
    ta.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
    });
    sendBtn.addEventListener("click", function () { send(); });

    window.Asesor = { open: open, close: close, ask: function (t) { open(); send(t); } };
  }

  function boot() {
    fetch(API + "/widget/config?k=" + KEY)
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(start)
      .catch(function (e) { console.warn("[Asesor] No se pudo cargar la configuración:", e.message); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
