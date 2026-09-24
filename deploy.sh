#!/bin/bash
set -euo pipefail

DEPLOYPATH="${DEPLOYPATH:-/home3/c4nn4bicultor/public_html/}"

mkdir -p "$DEPLOYPATH/assets"

HTML_FILES=(
  index.html
  index-nuevo.html
  index-anterior.html
  mi-cultivo.html
  empresas.html
  ia-tiendas-cbd.html
  ia-clubes.html
  instalar-asesor.html
  prueba-asesor.html
  admin-growshops.html
  admin-campana.html
  dashboard.html
  login.html
  register.html
  forgot-password.html
  reset-password.html
  empezar.html
  empezar-diario.html
  google6cb08dd01808031a.html
  test.html
  trafico.html
  breeders.html
  aviso-legal.html
  cookies.html
  contratacion.html
  privacidad.html
  terminos.html
  contacto.html
  buscador-cannabicultor.html
  growshops.html
  asociaciones.html
  tiendas-cbd.html
  fertilizantes.html
  disenador_sala_cultivo.html
  app.html
  atlas_landrace.html
  banco-genetica.html
  growers-alliance.html
  partners.html
)

for file in "${HTML_FILES[@]}"; do
  if [ -f "$file" ]; then
    /bin/cp -f "$file" "$DEPLOYPATH/"
  fi
done

if [ -f .htaccess ]; then
  /bin/cp -f .htaccess "$DEPLOYPATH/"
fi

# Script de tracking unificado (track.js en la raíz, incrustado en todas las páginas)
if [ -f track.js ]; then
  /bin/cp -f track.js "$DEPLOYPATH/"
fi

# Favicon raíz (favicon.ico multi-size + apple-touch-icon.png)
for file in favicon.ico apple-touch-icon.png; do
  if [ -f "$file" ]; then
    /bin/cp -f "$file" "$DEPLOYPATH/"
  fi
done

# Paginas generadas (breeders, variedades, tiendas-cbd, sitemaps): si el cron las regenero en
# $SEO_OUT (fuera del repo), esa version es la mas reciente; si no, se usa la del repo.
SEO_OUT="${SEO_OUT:-$HOME/seo-build}"
gen_src() { if [ -e "$SEO_OUT/$1" ]; then echo "$SEO_OUT/$1"; else echo "$1"; fi; }

for file in sitemap.xml sitemap-static.xml sitemap-breeders.xml sitemap-strains.xml sitemap-cbd.xml robots.txt; do
  src="$(gen_src "$file")"
  if [ -f "$src" ]; then
    /bin/cp -f "$src" "$DEPLOYPATH/"
  fi
done

# Directorios EXCLUSIVOS del generador (prerender/build.mjs): REEMPLAZO LIMPIO.
# Copia la version nueva a un temporal y hace swap, borrando asi las fichas
# huerfanas de slugs que ya no existen. No depende de rsync (este host no lo tiene).
for dir in breeders variedades tiendas-cbd; do
  src="$(gen_src "$dir")"
  if [ -d "$src" ]; then
    tmp="$DEPLOYPATH/.$dir.new"
    rm -rf "$tmp"
    /bin/cp -Rf "$src" "$tmp"
    rm -rf "$DEPLOYPATH/$dir"
    mv "$tmp" "$DEPLOYPATH/$dir"
  fi
done

# Contenido hecho a mano (no exclusivo del generador): copia normal.
for dir in cultivo-con-ia biblioteca informes ley-antitabaco; do
  if [ -d "$dir" ]; then
    if command -v rsync >/dev/null 2>&1; then
      rsync -a --delete "$dir/" "$DEPLOYPATH/$dir/"
    else
      mkdir -p "$DEPLOYPATH/$dir"
      /bin/cp -Rf "$dir/." "$DEPLOYPATH/$dir/"
    fi
  fi
done

# Herramienta pública con ruta limpia: /calculadora-vpd/
if [ -d calculadora-vpd ]; then
  mkdir -p "$DEPLOYPATH/calculadora-vpd"
  /bin/cp -Rf calculadora-vpd/. "$DEPLOYPATH/calculadora-vpd/"
fi

ASSET_FILES=(
  assets/analytics.js
  assets/auth.js
  assets/chat-vision.js
  assets/resenas.js
  assets/ac-urgent-banner.js
  assets/shell.css
  assets/shell.js
  assets/asesor.js
)

for file in "${ASSET_FILES[@]}"; do
  if [ -f "$file" ]; then
    /bin/cp -f "$file" "$DEPLOYPATH/assets/"
  fi
done

for ext in png jpg jpeg gif webp svg ico; do
  for file in assets/*."$ext"; do
    [ -f "$file" ] || continue
    /bin/cp -f "$file" "$DEPLOYPATH/assets/"
  done
done

# Logos de marcas de fertilizantes (con permiso de cada fabricante): assets/marcas/<marca>.svg|png|webp
if [ -d assets/marcas ]; then
  mkdir -p "$DEPLOYPATH/assets/marcas"
  for file in assets/marcas/*; do
    [ -f "$file" ] || continue
    /bin/cp -f "$file" "$DEPLOYPATH/assets/marcas/"
  done
fi

# Icono PWA / Add to Home Screen (app.html → /icons/icon-180.png)
if [ -d icons ]; then
  mkdir -p "$DEPLOYPATH/icons"
  for file in icons/*.png; do
    [ -f "$file" ] || continue
    /bin/cp -f "$file" "$DEPLOYPATH/icons/"
  done
fi

# Iconos SVG personalizados de la UI (app.html / dashboard.html) viven en la
# subcarpeta assets/icons/, que el bucle de arriba (solo assets/*.ext) no cubre.
if [ -d assets/icons ]; then
  mkdir -p "$DEPLOYPATH/assets/icons"
  for file in assets/icons/*.svg; do
    [ -f "$file" ] || continue
    /bin/cp -f "$file" "$DEPLOYPATH/assets/icons/"
  done
fi

# Press kit / prensa (HTML estático a mano): /prensa/index.html
if [ -d prensa ]; then
  mkdir -p "$DEPLOYPATH/prensa"
  for file in prensa/*.html; do
    [ -f "$file" ] || continue
    /bin/cp -f "$file" "$DEPLOYPATH/prensa/"
  done
fi

# Fichas del Banco Genético: HTML estático hecho a mano en la subcarpeta
# genetica/ (no es un directorio de generador, así que se copia sin --delete).
if [ -d genetica ]; then
  mkdir -p "$DEPLOYPATH/genetica"
  for file in genetica/*.html; do
    [ -f "$file" ] || continue
    /bin/cp -f "$file" "$DEPLOYPATH/genetica/"
  done
fi

# Fichas del Atlas de landraces (HTML estático): /atlas-landraces/*.html
# Enlazadas desde atlas_landrace.html (chips de nombre de variedad).
if [ -d atlas-landraces ]; then
  mkdir -p "$DEPLOYPATH/atlas-landraces"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete --include='*/' --include='*.html' --exclude='*' atlas-landraces/ "$DEPLOYPATH/atlas-landraces/"
  else
    for file in atlas-landraces/*.html; do
      [ -f "$file" ] || continue
      /bin/cp -f "$file" "$DEPLOYPATH/atlas-landraces/"
    done
  fi
fi

# Fotos del Banco Genético en la subcarpeta assets/genetica/, que el bucle
# assets/*.ext de arriba no cubre.
if [ -d assets/genetica ]; then
  mkdir -p "$DEPLOYPATH/assets/genetica"
  for file in assets/genetica/*; do
    [ -f "$file" ] || continue
    /bin/cp -f "$file" "$DEPLOYPATH/assets/genetica/"
  done
fi
