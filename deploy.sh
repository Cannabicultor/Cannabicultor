#!/bin/bash
set -euo pipefail

DEPLOYPATH="${DEPLOYPATH:-/home3/c4nn4bicultor/public_html/}"

mkdir -p "$DEPLOYPATH/assets"

HTML_FILES=(
  index.html
  dashboard.html
  login.html
  register.html
  test.html
  forgot-password.html
  reset-password.html
  trafico.html
  breeders.html
  aviso-legal.html
  cookies.html
  contratacion.html
  privacidad.html
  terminos.html
)

for file in "${HTML_FILES[@]}"; do
  if [ -f "$file" ]; then
    /bin/cp -f "$file" "$DEPLOYPATH/"
  fi
done

if [ -f .htaccess ]; then
  /bin/cp -f .htaccess "$DEPLOYPATH/"
fi

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