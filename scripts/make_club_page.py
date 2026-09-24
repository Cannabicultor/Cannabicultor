#!/usr/bin/env python3
# Crea ia-clubes.html (a partir de empresas.html) y añade el enlace en la navegación.
import io, glob, re, os

def rd(p): return io.open(p, encoding="utf-8").read()
def wr(p, s): io.open(p, "w", encoding="utf-8").write(s)
def rep(s, a, b, n=1):
    c = s.count(a); assert c == n, f"{c}x != {n}: {a[:80]!r}"; return s.replace(a, b)
def cut(s, start, end_marker):
    i = s.index(start); j = s.index(end_marker, i) + len(end_marker); return s[:i], s[i:j], s[j:]

DEMO = "https://demo.cannabicultor.com/demo/a8b27f5a96397803"
ICON = '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.5 2.5-6 6-6s6 2.5 6 6"/><path d="M16 11a2.5 2.5 0 1 0 0-5M17 14c2.5.3 4 2.5 4 6"/></svg>'
NAV_PREV = '<a class="cc-nav" href="/ia-tiendas-cbd.html" data-match="/ia-tiendas-cbd">'
NAV_CLUB = f'<a class="cc-nav" href="/ia-clubes.html" data-match="/ia-clubes">{ICON}IA para clubes</a>'
WA = "https://wa.me/34686802670?text=Hola%2C%20quiero%20el%20asistente%20IA%20para%20mi%20club"

s = rd("empresas.html")
s = rep(s, "<title>Asesor de ventas con IA para growshops · Cannabicultor IA</title>", "<title>Asistente con IA para clubes y asociaciones cannábicas · Cannabicultor IA</title>")
s = re.sub(r'<meta name="description" content="[^"]*">', '<meta name="description" content="Un asistente con IA que responde los mensajes de Instagram de tu club en el idioma de cada persona: horarios, requisitos, normas y actividades. Solo informa, nunca vende ni capta socios.">', s, count=1)
s = rep(s, 'href="https://www.cannabicultor.com/empresas.html"', 'href="https://www.cannabicultor.com/ia-clubes.html"')
s = re.sub(r'<meta property="og:title" content="[^"]*">', '<meta property="og:title" content="Asistente con IA para clubes cannábicos · Cannabicultor IA">', s, count=1)
s = re.sub(r'<meta property="og:description" content="[^"]*">', '<meta property="og:description" content="Responde el Instagram de tu club 24/7, en cualquier idioma, dentro del marco legal.">', s, count=1)
s = rep(s, '"name":"Asesor de ventas IA para growshops"', '"name":"Asistente IA para clubes y asociaciones cannábicas"')

# Contenido: sustituimos todo el bloque <div class="w">…</div> por uno propio con las mismas clases
before, _, after = cut(s, '<div class="w">', '</section>\n</div>')
body = f'''<div class="w">
  <div class="hero">
    <div class="eyebrow">Para clubes y asociaciones cannábicas</div>
    <h1>Tu club responde por Instagram, las 24 horas, en cualquier idioma</h1>
    <p>Un asistente con IA que contesta los mensajes directos del Instagram de tu club: <b>horarios, requisitos para ser socio, cuota, normas y actividades</b>. Responde en el idioma de cada persona y siempre dentro del marco legal: solo informa, nunca vende ni capta socios.</p>
    <div class="btns">
      <a class="btn pri" href="{DEMO}" target="_blank" rel="noopener" data-track="club_demo"><svg viewBox="0 0 24 24"><path d="M5 3l14 9-14 9z"/></svg>Probar la demo en vivo</a>
      <a class="btn" href="{WA}" target="_blank" rel="noopener" data-track="club_whatsapp">Hablar por WhatsApp</a>
    </div>
    <div class="nota">Instalación gratis · Gratis hasta 300 conversaciones al mes · Sin permanencia</div>
  </div>

  <section>
    <h2>Así responde a quien escribe al club</h2>
    <p class="sub">Conversación real con el club de demostración.</p>
    <div class="g2">
      <div class="chat">
        <div class="u">Hi! How can I become a member?</div>
        <div class="a">Hi! You need to be over 21, be introduced by a current member and have an interview with the board at the club. Admission is always <b>in person</b>, never by message. Anything else about opening hours or activities?</div>
        <div class="u">¿Qué tenéis hoy y a cuánto?</div>
        <div class="a">Eso solo se trata dentro del club, en persona, entre socios. Si quieres te cuento horarios o actividades.</div>
      </div>
      <div class="g2" style="grid-template-columns:1fr">
        <div class="card"><h3>Habla el idioma de cada persona</h3><p>Español, inglés, francés, italiano, alemán, árabe, ruso, catalán… Responde en el idioma en que le escriben, sin configurar nada.</p></div>
        <div class="card"><h3>Dentro del marco legal</h3><p>No ofrece cannabis, no habla de precios ni de lo que hay, no capta socios y no da la ubicación a quien no es socio. Solo informa a quien pregunta.</p></div>
      </div>
    </div>
  </section>

  <section>
    <h2>Qué gana tu club</h2>
    <div class="g3">
      <div class="card"><h3>Ningún mensaje sin contestar</h3><p>Las mismas preguntas de siempre, respondidas al momento, también de noche y en fin de semana.</p></div>
      <div class="card"><h3>Menos trabajo para la junta</h3><p>Nadie tiene que estar pegado al móvil del club. El asistente resuelve lo repetitivo y la junta se centra en lo importante.</p></div>
      <div class="card"><h3>Siempre con tus normas</h3><p>Responde con la información que nos das: horarios, cuota, requisitos, normas y actividades. Si algo no lo sabe, lo dice y remite a la junta.</p></div>
    </div>
  </section>

  <section>
    <h2>Lo instalamos nosotros, gratis</h2>
    <p class="sub">En unos 20 minutos, en persona o por videollamada. No necesitas saber nada de tecnología.</p>
    <div class="g3">
      <div class="card"><div class="num">1</div><h3>Nos pasas la ficha del club</h3><p>Horarios, cuota, requisitos para ser socio, normas y actividades. Con eso preparamos el asistente y lo revisas antes de activarlo.</p></div>
      <div class="card"><div class="num">2</div><h3>Conectamos el Instagram</h3><p>La cuenta del club pasa a profesional (1 minuto en ajustes), aceptas nuestra invitación y activas el acceso a mensajes. Desde ese momento responde solo.</p></div>
      <div class="card"><div class="num">3</div><h3>También en tu web o con QR</h3><p>Si tenéis web, se pega una línea de código. Si no, os damos una página propia con QR para el local o el enlace de la bio.</p></div>
    </div>
  </section>

  <section>
    <h2>Precio</h2>
    <p class="sub">Pagas solo por uso. Una conversación es una persona atendida (hasta 10 mensajes).</p>
    <div class="precio">
      <div class="plan dest"><div class="n">Empezar</div><div class="p">0 € <small>/mes</small></div><ul><li>Hasta 300 conversaciones al mes</li><li>Instalación y configuración gratis</li><li>Todos los idiomas</li></ul></div>
      <div class="plan"><div class="n">Pack 1.000</div><div class="p">59 € <small>+ IVA</small></div><ul><li>1.000 conversaciones extra</li><li>No caducan</li><li>≈ 0,06 € por persona atendida</li></ul></div>
      <div class="plan"><div class="n">Pack 5.000</div><div class="p">249 € <small>+ IVA</small></div><ul><li>5.000 conversaciones extra</li><li>No caducan</li><li>≈ 0,05 € por persona atendida</li></ul></div>
    </div>
    <div class="nota">Sin permanencia. Si pasas de las 300 gratis y no tienes pack, te avisamos antes; el asistente no se corta de golpe.</div>
  </section>

  <section class="faq">
    <h2>Preguntas frecuentes</h2>
    <details><summary>¿Puede meter al club en problemas?</summary><p>Está hecho para lo contrario: solo informa a quien pregunta, no ofrece ni promociona cannabis, no habla de precios ni de lo que hay, no capta socios y no da la ubicación. Tú revisas sus respuestas antes de activarlo. No es asesoramiento legal.</p></details>
    <details><summary>¿Y si Instagram nos cierra la cuenta?</summary><p>El asistente no publica nada ni promociona producto, solo responde mensajes. Aun así, Instagram tiene normas estrictas con el cannabis. Por eso también puede funcionar en tu web o en una página propia con QR.</p></details>
    <details><summary>¿En qué idiomas responde?</summary><p>En el idioma en que le escriban: español, inglés, francés, italiano, alemán, neerlandés, portugués, árabe, ruso, catalán, euskera, gallego y muchos más.</p></details>
    <details><summary>¿Quién ve las conversaciones?</summary><p>Solo el club. Se tratan conforme al RGPD y no se comparten con nadie.</p></details>
    <details><summary>¿Hace falta tener web?</summary><p>No. Funciona directamente en el Instagram del club. La web o el QR son opcionales.</p></details>
  </section>

  <section class="cierre">
    <h2>Pruébalo con tu club</h2>
    <p>Escríbenos por WhatsApp y te preparamos el asistente con la información de tu club, gratis y sin compromiso.</p>
    <div class="btns" style="justify-content:center">
      <a class="btn pri" href="{WA}" target="_blank" rel="noopener" data-track="club_whatsapp_cierre"><svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-11.8 7L4 20l1.1-4.9A8 8 0 1 1 21 12z"/></svg>Pedir mi demo por WhatsApp</a>
      <a class="btn" href="mailto:Cannabicultor@icloud.com?subject=Asistente%20IA%20para%20mi%20club" data-track="club_email">Escribir un email</a>
    </div>
  </section>
</div>'''
s = before + body + after
wr("ia-clubes.html", s)

# Nav lateral: debajo de "IA para tiendas CBD"
files = [f for f in glob.glob("**/*.html", recursive=True) if "node_modules" not in f and ".bak" not in f] + ["prerender/shell-nav.html"]
changed = 0
for f in set(files):
    if not os.path.isfile(f): continue
    t = rd(f)
    if 'href="/ia-clubes.html"' in t: continue
    i = t.find(NAV_PREV)
    if i == -1: continue
    j = t.index("</a>", i) + 4
    t = t[:j] + "\n" + NAV_CLUB + t[j:]
    wr(f, t); changed += 1
# landing (index.html usa class="nav")
t = rd("index.html")
if 'href="/ia-clubes.html"' not in t:
    i = t.index('<a class="nav" href="/ia-tiendas-cbd.html">'); j = t.index("</a>", i) + 4
    t = t[:j] + '\n      <a class="nav" href="/ia-clubes.html">' + ICON + 'IA para clubes</a>' + t[j:]
    wr("index.html", t); changed += 1
print("nav actualizada en", changed, "archivos")

d = rd("deploy.sh")
if "ia-clubes.html" not in d:
    d = rep(d, "  ia-tiendas-cbd.html\n", "  ia-tiendas-cbd.html\n  ia-clubes.html\n"); wr("deploy.sh", d)
sm = rd("sitemap-static.xml")
if "ia-clubes.html" not in sm:
    m = re.search(r"\s*<url>\s*<loc>https://www\.cannabicultor\.com/ia-tiendas-cbd\.html</loc>.*?</url>", sm, re.S)
    if m:
        sm = sm.replace(m.group(0), m.group(0) + m.group(0).replace("ia-tiendas-cbd.html", "ia-clubes.html")); wr("sitemap-static.xml", sm)
print("OK")
