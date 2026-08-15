#!/bin/bash
set -euo pipefail

DEPLOYPATH="${DEPLOYPATH:-/home3/c4nn4bicultor/public_html/}"

mkdir -p "$DEPLOYPATH/assets"

HTML_FILES=(
  index.html
  dashboard.html
  login.html
  register.html
  forgot-password.html
  reset-password.html
  empezar.html
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
  fertilizantes.html
  disenador_sala_cultivo.html
  app.html
  atlas_landrace.html
  banco-genetica.html
  growers-alliance.html
)

for file in "${HTML_FILES[@]}"; do
  if [ -f "$file" ]; then
    /bin/cp -f "$file" "$DEPLOYPATH/"
  fi
done

if [ -f .htaccess ]; then
  /bin/cp -f .htaccess "$DEPLOYPATH/"
fi

# Favicon raíz (favicon.ico multi-size + apple-touch-icon.png)
for file in favicon.ico apple-touch-icon.png; do
  if [ -f "$file" ]; then
    /bin/cp -f "$file" "$DEPLOYPATH/"
  fi
done

for file in sitemap.xml sitemap-static.xml sitemap-breeders.xml sitemap-strains.xml robots.txt; do
  if [ -f "$file" ]; then
    /bin/cp -f "$file" "$DEPLOYPATH/"
  fi
done

# Páginas pre-renderizadas (generadas por prerender/build.mjs).
# Son directorios completos y exclusivos del generador: se sincronizan con
# --delete para que no queden fichas huérfanas de slugs que ya no existen.
# Si el host no tiene rsync, cae a cp -R (sin borrado de huérfanos).
for dir in breeders variedades cultivo-con-ia biblioteca informes ley-antitabaco; do
  if [ -d "$dir" ]; then
    if command -v rsync >/dev/null 2>&1; then
      rsync -a --delete "$dir/" "$DEPLOYPATH/$dir/"
    else
      mkdir -p "$DEPLOYPATH/$dir"
      /bin/cp -Rf "$dir/." "$DEPLOYPATH/$dir/"
    fi
  fi
done

ASSET_FILES=(
  assets/analytics.js
  assets/auth.js
  assets/chat-vision.js
  assets/resenas.js
  assets/ac-urgent-banner.js
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