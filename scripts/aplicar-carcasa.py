#!/usr/bin/env python3
"""Aplica la carcasa Cannabis IA (menú lateral + tipografía + chat) a páginas estáticas.
Idempotente: si la página ya lleva 'cc-shell' no la toca. Uso: python3 scripts/aplicar-carcasa.py
El menú sale de prerender/shell-nav.html (mismo que usan las fichas generadas)."""
import re, pathlib, html
ROOT = pathlib.Path(__file__).resolve().parent.parent
NAV = (ROOT / 'prerender' / 'shell-nav.html').read_text()

# página -> (tipo, contexto, placeholder) ; None = sin chat abajo
PAGINAS = {
  'growshops.html': ('growshops', 'Sobre growshops', '¿Buscas growshop o material? Pregúntame…'),
  'asociaciones.html': ('clubes', 'Sobre clubes y asociaciones cannábicas', '¿Buscas club o asociación? Pregúntame…'),
  'tiendas-cbd.html': ('cbd', 'Sobre tiendas y productos CBD', 'Pregúntame sobre CBD…'),
  'buscador-cannabicultor.html': ('buscador', 'Sobre variedades de cannabis', '¿Qué variedad te conviene? Pregúntame…'),
  'banco-genetica.html': ('genetics', 'Sobre las genéticas de Cannabicultor Genetics', 'Pregúntame sobre nuestras genéticas…'),
  'disenador_sala_cultivo.html': None,
  'fertilizantes.html': None,
  'growers-alliance.html': None,
  'partners.html': None,
  'contacto.html': None,
  'aviso-legal.html': None, 'cookies.html': None, 'privacidad.html': None,
  'terminos.html': None, 'contratacion.html': None,
}

# cabeceras de marca antiguas a ocultar (patrones exactos por página)
OCULTAR = [
  ('<a class="brand" href="/"><span aria-hidden="true"', '<a class="brand cc-ocultar" href="/"><span aria-hidden="true"'),
  ('<nav>\n  <div class="ni">', '<nav class="cc-ocultar">\n  <div class="ni">'),
  ('<header class="top"><a class="brand" href="/">', '<header class="top cc-ocultar"><a class="brand" href="/">'),
  ('<header class="site-head">', '<header class="site-head cc-ocultar">'),
  ('<nav class="top">', '<nav class="top cc-ocultar">'),
  ('<div class="topbar">\n    <a class="brand" href="/">', '<div class="topbar cc-ocultar">\n    <a class="brand" href="/">'),
  ('<a href="/" style="text-decoration:none;color:inherit;display:inline-flex;align-items:center;gap:8px">', '<a class="cc-ocultar" href="/" style="text-decoration:none;color:inherit;display:inline-flex;align-items:center;gap:8px">'),
]

HEAD = ('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
        '<link href="https://fonts.googleapis.com/css2?family=Sora:wght@500;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">\n'
        '<link rel="stylesheet" href="/assets/shell.css">\n</head>')

def dock(tipo, ctx, ph):
    e = html.escape
    return (f'<div class="cc-dock"><form id="ccDock" data-tipo="{e(tipo)}" data-contexto="{e(ctx)}" role="search">'
            '<img src="/assets/icono_cannabicultor_small.webp" alt="" width="28" height="28">'
            '<label class="cc-sr" for="ccDockQ">Pregunta a Cannabicultor IA</label>'
            f'<input id="ccDockQ" type="text" maxlength="400" autocomplete="off" placeholder="{e(ph)}">'
            '<button type="submit" aria-label="Preguntar"><svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button>'
            '</form></div>\n')

for carpeta in ['biblioteca', 'informes', 'ley-antitabaco', 'cultivo-con-ia', 'calculadora-vpd', 'prensa']:
    for f in sorted((ROOT / carpeta).rglob('*.html')):
        PAGINAS.setdefault(str(f.relative_to(ROOT)), ('guia', '', 'Pregúntale a la IA del cannabis…') if carpeta in ('biblioteca', 'cultivo-con-ia') else None)

for nombre, cfg in PAGINAS.items():
    p = ROOT / nombre
    if not p.exists(): print('falta', nombre); continue
    s = p.read_text()
    if 'cc-shell' in s: print('ya tiene carcasa', nombre); continue
    s = s.replace('</head>', HEAD, 1)
    s = re.sub(r'<body([^>]*)>', lambda m: ('<body' + (m.group(1).replace('class="', 'class="cc-shell ') if 'class="' in m.group(1) else m.group(1) + ' class="cc-shell"') + '>\n' + NAV), s, count=1)
    for a, b in OCULTAR:
        s = s.replace(a, b, 1)
    s = re.sub(r'<script src="/?assets/ac-urgent-banner\.js" defer></script>\n?', '', s)
    fin = (dock(*cfg) if cfg else '') + '<script src="/assets/shell.js" defer></script>\n</body>'
    s = s[::-1].replace('</body>'[::-1], fin[::-1], 1)[::-1]
    p.write_text(s)
    print('ok', nombre)
