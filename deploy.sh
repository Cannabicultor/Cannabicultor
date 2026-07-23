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
  buscador-cannabicultor.html
  disenador_sala_cultivo.html
  app.html
  atlas_landrace.html
)

for file in "${HTML_FILES[@]}"; do
  if [ -f "$file" ]; then
    /bin/cp -f "$file" "$DEPLOYPATH/"
  fi
done

if [ -f .htaccess ]; then
  /bin/cp -f .htaccess "$DEPLOYPATH/"
fi

for file in sitemap.xml sitemap-static.xml sitemap-breeders.xml sitemap-strains.xml robots.txt; do
  if [ -f "$file" ]; then
    /bin/cp -f "$file" "$DEPLOYPATH/"
  fi
done

# Páginas pre-renderizadas (generadas por prerender/build.mjs).
# Son directorios completos y exclusivos del generador: se sincronizan con
# --delete para que no queden fichas huérfanas de slugs que ya no existen.
# Si el host no tiene rsync, cae a cp -R (sin borrado de huérfanos).
for dir in breeders variedades cultivo-con-ia biblioteca; do
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

# Iconos SVG personalizados de la UI (app.html / dashboard.html) viven en la
# subcarpeta assets/icons/, que el bucle de arriba (solo assets/*.ext) no cubre.
if [ -d assets/icons ]; then
  mkdir -p "$DEPLOYPATH/assets/icons"
  for file in assets/icons/*.svg; do
    [ -f "$file" ] || continue
    /bin/cp -f "$file" "$DEPLOYPATH/assets/icons/"
  done
fi