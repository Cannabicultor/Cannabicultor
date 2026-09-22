#!/bin/bash
# Regenera y publica las paginas SEO (breeders, variedades, tiendas CBD) SOLO si
# hubo cambios en Supabase desde la ultima vez. Pensado para un cron de cPanel.
#
#   Requisitos: node en el PATH (Setup Node.js App), curl.
#   Cron sugerido (cada 2 dias a las 04:15):
#     15 4 */2 * * /bin/bash /ruta/al/repo/scripts/regenerate-seo.sh >> ~/seo-regen.log 2>&1
#
# No usa ninguna clave secreta: build.mjs y esta comprobacion usan la key publica
# (RLS activo). No llama a ninguna IA ni a SerpAPI: solo lee Supabase y escribe HTML.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SUPABASE_URL="${SUPABASE_URL:-https://gfyrsrdnvgnhtsuexjkb.supabase.co}"
SUPABASE_KEY="${SUPABASE_KEY:-sb_publishable_FdRmfirvOTAIfZFOcj2ZZg_Vic__TDw}"
STATE_FILE="$ROOT/.seo-last-sync"

# Ultima fecha de actualizacion entre las 3 tablas publicables (max updated_at).
latest() {
  local tabla="$1"
  curl -s "$SUPABASE_URL/rest/v1/$tabla?select=updated_at&order=updated_at.desc.nullslast&limit=1" \
    -H "apikey: $SUPABASE_KEY" -H "Authorization: Bearer $SUPABASE_KEY" \
    | sed -n 's/.*"updated_at":"\([^"]*\)".*/\1/p'
}

CURRENT="$(printf '%s\n%s\n%s\n' "$(latest cbd_shops)" "$(latest breeders)" "$(latest variedades)" | sort | tail -1)"
PREVIOUS="$(cat "$STATE_FILE" 2>/dev/null || echo '')"

if [ -n "$CURRENT" ] && [ "$CURRENT" = "$PREVIOUS" ]; then
  echo "$(date -u +%FT%TZ) · sin cambios ($CURRENT) · nada que regenerar"
  exit 0
fi

echo "$(date -u +%FT%TZ) · cambios detectados (nuevo=$CURRENT, anterior=${PREVIOUS:-ninguno}) · regenerando…"
node prerender/build.mjs --breeders --variedades --cbd
bash deploy.sh
echo "$CURRENT" > "$STATE_FILE"
echo "$(date -u +%FT%TZ) · publicado."
