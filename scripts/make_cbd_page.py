#!/usr/bin/env python3
# Crea ia-tiendas-cbd.html (a partir de empresas.html) y añade el enlace en la navegación.
import io, glob, re, os

def rd(p): return io.open(p, encoding="utf-8").read()
def wr(p, s): io.open(p, "w", encoding="utf-8").write(s)
def rep(s, a, b, n=1):
    c = s.count(a); assert c == n, f"{c}x != {n}: {a[:80]!r}"; return s.replace(a, b)

DEMO = "https://demo.cannabicultor.com/demo/40be27583081c3ce"
ICON_CBD = '<svg viewBox="0 0 24 24"><path d="M12 21V11"/><path d="M12 11c-1-4-4-6-7-6 0 4 3 6 7 6zM12 11c1-4 4-6 7-6 0 4-3 6-7 6zM12 8c-1.5-2-1.5-4 0-6 1.5 2 1.5 4 0 6z"/></svg>'
NAV_GS = '<a class="cc-nav" href="/empresas.html" data-match="/empresas"><svg viewBox="0 0 24 24"><path d="M3 9l1-5h16l1 5"/><path d="M4 9v11h16V9"/><path d="M10 20v-6h4v6"/></svg>IA para growshops</a>'
NAV_CBD = f'<a class="cc-nav" href="/ia-tiendas-cbd.html" data-match="/ia-tiendas-cbd">{ICON_CBD}IA para tiendas CBD</a>'

s = rd("empresas.html")
s = rep(s, "<title>Asesor de ventas con IA para growshops · Cannabicultor IA</title>", "<title>Asesor de ventas con IA para tiendas CBD · Cannabicultor IA</title>")
s = rep(s, 'content="Un asesor con IA especializado en cannabis dentro de la web de tu growshop: recomienda productos de tu catálogo, resuelve dudas de cultivo y vende 24/7. Instalación gratis y gratis hasta 300 conversaciones al mes."',
           'content="Un asesor con IA experto en CBD dentro de la web de tu tienda: explica espectros y concentraciones, recomienda productos de tu catálogo dentro del marco legal y vende 24/7. Instalación gratis y gratis hasta 300 conversaciones al mes."')
s = rep(s, 'href="https://www.cannabicultor.com/empresas.html"', 'href="https://www.cannabicultor.com/ia-tiendas-cbd.html"')
s = rep(s, '<meta property="og:title" content="Asesor de ventas con IA para growshops · Cannabicultor IA">', '<meta property="og:title" content="Asesor de ventas con IA para tiendas CBD · Cannabicultor IA">')
s = rep(s, 'content="Recomienda productos de tu catálogo, resuelve dudas de cultivo y vende 24/7. Instalación gratis."', 'content="Explica el CBD a tus clientes, recomienda productos de tu catálogo y vende 24/7. Instalación gratis."')
s = rep(s, '"name":"Asesor de ventas IA para growshops"', '"name":"Asesor de ventas IA para tiendas CBD"')

# Hero
s = rep(s, '<div class="eyebrow">Para growshops y tiendas online</div>', '<div class="eyebrow">Para tiendas de CBD, físicas y online</div>')
s = rep(s, "<h1>Un experto en cultivo atendiendo tu tienda, las 24 horas</h1>", "<h1>Un experto en CBD atendiendo tu tienda, las 24 horas</h1>")
s = rep(s, "<p>Pon Cannabicultor IA dentro de tu web. Resuelve las dudas de cultivo de tus clientes y les recomienda <b>productos de tu propio catálogo</b>, con precio y enlace para comprar. Lo que antes se iba sin respuesta, ahora se convierte en venta.</p>",
           "<p>Pon Cannabicultor IA dentro de tu web. Explica a tus clientes la diferencia entre espectros, concentraciones y formatos, y les recomienda <b>productos de tu propio catálogo</b>, con precio y enlace para comprar. Siempre dentro del marco legal: sin promesas médicas. Lo que antes se iba sin respuesta, ahora se convierte en venta.</p>")
s = s.replace("https://growers-alliance-ai.nohumanclicks.workers.dev/demo/83893cf3a881d076", DEMO)
s = rep(s, 'data-track="empresas_demo"', 'data-track="cbd_demo"')
s = rep(s, "text=Hola%2C%20quiero%20el%20asesor%20IA%20en%20mi%20growshop", "text=Hola%2C%20quiero%20el%20asesor%20IA%20en%20mi%20tienda%20CBD")
s = rep(s, 'data-track="empresas_whatsapp"', 'data-track="cbd_whatsapp"')

# Ejemplo de conversación
s = rep(s, "Conversación real con la tienda de demostración (3.700 productos de un catálogo real).", "Conversación real con la tienda de CBD de demostración.")
s = rep(s, '<div class="u">Tengo un armario de 100×100 y quiero empezar con LED. ¿Qué necesito?</div>', '<div class="u">Es mi primera vez con el CBD. ¿Qué aceite me recomiendas?</div>')
old_a = s[s.index('<div class="a">Para 1 m²'):s.index('¿Cultivas en tierra o en coco? Así te digo el sustrato y el abono.</div>') + len('¿Cultivas en tierra o en coco? Así te digo el sustrato y el abono.</div>')]
s = s.replace(old_a, '''<div class="a">Para empezar, lo sensato es una concentración baja: un <b>aceite al 5 %</b> (500 mg en 10 ml) e ir ajustando. Si prefieres que no sepa a cáñamo, el <b>aislado</b>; si quieres todos los cannabinoides y terpenos, el <b>espectro completo</b>. De nuestro catálogo:
          <div class="prod">Aceite CBD 5 % espectro completo 10 ml<span>[precio de tu tienda]</span></div>
          <div class="prod">Aceite CBD 5 % aislado 10 ml<span>[precio de tu tienda]</span></div>
          ¿Lo buscas más para la piel o para tu rutina de noche? Así afino la recomendación.</div>''')
s = rep(s, "<div class=\"card\"><h3>Sabe de cultivo de verdad</h3><p>Base de conocimiento con más de 50 manuales y estudios, criterio de cultivadores con décadas de oficio y diagnóstico por foto. No es un chatbot genérico.</p></div>",
           "<div class=\"card\"><h3>Sabe de CBD de verdad</h3><p>Cannabinoides (CBD, CBG, CBN), espectros, concentraciones, terpenos y formatos, con la base de conocimiento de Cannabicultor y más de 30 años en el sector. No es un chatbot genérico.</p></div>")
s = rep(s, "<div class=\"card\"><h3>Vende lo que tú tienes</h3><p>Solo recomienda productos de tu catálogo, con tu precio y tu stock. Nunca manda al cliente a otra tienda.</p></div>",
           "<div class=\"card\"><h3>Cumple el marco legal</h3><p>Nunca hace promesas médicas, respeta cómo se vende cada formato (aromático, cosmético, complemento) y solo atiende a mayores de 18. Solo recomienda productos de tu catálogo.</p></div>")

# Qué gana
s = rep(s, "<p>Resuelve la duda en el momento en que el cliente está decidiendo, y le propone el equipo completo.</p>", "<p>Resuelve la duda en el momento en que el cliente está decidiendo y le propone lo que encaja: grinder con la flor, un formato de bolsillo con el aceite.</p>")
s = rep(s, "<p>Envíos, devoluciones, pagos, dosis de abono, qué luz comprar… lo responde solo, con tus políticas.</p>", "<p>Envíos, devoluciones, analíticas, qué % elegir, espectro completo o aislado… lo responde solo, con tus políticas.</p>")

# FAQ específicas
s = rep(s, "<details><summary>¿Se inventa productos o precios?</summary>",
           "<details><summary>¿Puede meter a mi tienda en problemas legales?</summary><p>Está entrenado para no hacer afirmaciones médicas ni orientar al consumo de flores o resinas, y para explicar cada formato según cómo se vende en España. Aun así, tú revisas su tono y tus textos antes de publicarlo. No es asesoramiento legal.</p></details>\n    <details><summary>¿Se inventa productos o precios?</summary>")
s = rep(s, "text=Hola%2C%20quiero%20una%20demo%20del%20asesor%20IA%20con%20mi%20cat%C3%A1logo", "text=Hola%2C%20quiero%20una%20demo%20del%20asesor%20IA%20con%20el%20cat%C3%A1logo%20de%20mi%20tienda%20CBD")
s = rep(s, 'data-track="empresas_whatsapp_cierre"', 'data-track="cbd_whatsapp_cierre"')
s = rep(s, "subject=Asesor%20IA%20para%20mi%20growshop", "subject=Asesor%20IA%20para%20mi%20tienda%20CBD")
s = rep(s, 'data-track="empresas_email"', 'data-track="cbd_email"')
s = rep(s, "¿Tienes un growshop?", "¿Tienes un growshop?", 0) if "¿Tienes un growshop?" not in s else s
# Enlace cruzado al final de la nota del hero
s = rep(s, '<div class="nota">Instalación gratis · Gratis hasta 300 conversaciones al mes · Sin permanencia</div>',
           '<div class="nota">Instalación gratis · Gratis hasta 300 conversaciones al mes · Sin permanencia · ¿Tienes un growshop? <a href="/empresas.html">IA para growshops</a></div>')
assert "cultivo de tus clientes" not in s
wr("ia-tiendas-cbd.html", s)

# Enlace cruzado en empresas.html
e = rd("empresas.html")
if "ia-tiendas-cbd.html\">IA para tiendas CBD" not in e:
    e = rep(e, '<div class="nota">Instalación gratis · Gratis hasta 300 conversaciones al mes · Sin permanencia</div>',
               '<div class="nota">Instalación gratis · Gratis hasta 300 conversaciones al mes · Sin permanencia · ¿Tienes una tienda de CBD? <a href="/ia-tiendas-cbd.html">IA para tiendas CBD</a></div>')
    wr("empresas.html", e)

# Nav lateral: añadir "IA para tiendas CBD" debajo de "IA para growshops" en todas las páginas
files = [f for f in glob.glob("**/*.html", recursive=True) if "node_modules" not in f and ".bak" not in f]
files.append("prerender/shell-nav.html")
changed = 0
for f in set(files):
    if not os.path.isfile(f): continue
    t = rd(f)
    if NAV_GS in t and NAV_CBD not in t:
        t = t.replace(NAV_GS, NAV_GS + "\n" + NAV_CBD)
        wr(f, t); changed += 1
print("nav actualizada en", changed, "archivos")

# deploy.sh: incluir la página nueva
d = rd("deploy.sh")
if "ia-tiendas-cbd.html" not in d:
    d = rep(d, "  empresas.html\n", "  empresas.html\n  ia-tiendas-cbd.html\n")
    wr("deploy.sh", d)
# sitemap estático
if os.path.isfile("sitemap-static.xml"):
    sm = rd("sitemap-static.xml")
    if "ia-tiendas-cbd.html" not in sm and "empresas.html</loc>" in sm:
        m = re.search(r"\s*<url>\s*<loc>https://www\.cannabicultor\.com/empresas\.html</loc>.*?</url>", sm, re.S)
        if m:
            blk = m.group(0)
            sm = sm.replace(blk, blk + blk.replace("empresas.html", "ia-tiendas-cbd.html"))
            wr("sitemap-static.xml", sm); print("sitemap OK")
print("OK")
