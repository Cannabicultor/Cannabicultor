#!/bin/zsh

# ============================================================
# run-discovery.sh — Motor de Descubrimiento (toda la red)
#
# Ejecución LOCAL y ON-DEMAND desde tu máquina.
# Tú decides cuándo correrlo. No es un servicio vivo.
#
# Instrucciones:
# 1. Asegúrate de tener las claves en pipeline/.env (una sola vez)
# 2. chmod +x run-*.sh pipeline/run-*.sh
# 3. Ejecuta (desde la raíz del proyecto):
#      ./run-discovery.sh --mode=all
#      ./run-pipeline.sh
#
# Modos principales:
#   --mode=sitemaps   → rastrea sitemaps de múltiples fuentes
#   --mode=seeds      → usa términos de búsqueda + puntos de partida
#   --mode=all        → hace ambos
#
# El foco es DESCUBRIR breeders y variedades en TODA LA RED,
# no solo Seedfinder.
#
# Las claves se cargan automáticamente desde pipeline/.env
# (NO las pongas hardcodeadas aquí).
# ============================================================

# === CARGA ÚNICA Y TEMPRANA DESDE pipeline/.env (FUENTE DE VERDAD) ===
# Compatible con zsh y bash. Esto hace que NO tengas que tocar keys dentro de los .sh
if [ -n "$ZSH_VERSION" ]; then
  SCRIPT_DIR=$(cd -- "$(dirname -- "${(%):-%N}")" && pwd)
else
  SCRIPT_DIR=$(cd -- "$(dirname -- "$0")" && pwd)
fi

if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a
  source "$SCRIPT_DIR/.env"
  set +a
fi

# Limpieza defensiva: quita espacios, tabs, saltos de línea que rompen los JWTs de Supabase
SUPABASE_URL=$(echo "${SUPABASE_URL:-}" | tr -d ' \t\n\r')
SUPABASE_SERVICE_KEY=$(echo "${SUPABASE_SERVICE_KEY:-}" | tr -d ' \t\n\r')
SERPAPI_KEY=$(echo "${SERPAPI_KEY:-}" | tr -d ' \t\n\r')

# Debug (nunca imprimimos la clave completa por seguridad)
if [ -n "$SERPAPI_KEY" ]; then
  echo "DEBUG: SERPAPI_KEY cargada (primeros 8): ${SERPAPI_KEY:0:8}... (longitud: ${#SERPAPI_KEY})"
else
  echo "DEBUG: SERPAPI_KEY no encontrada en .env (el discovery usará sólo seeds manuales + crawl)"
fi

if [ -n "$SUPABASE_SERVICE_KEY" ]; then
  len=${#SUPABASE_SERVICE_KEY}
  last4=${SUPABASE_SERVICE_KEY: -4}
  echo "DEBUG: SUPABASE_SERVICE_KEY cargada (longitud: $len, termina en ...$last4)"
else
  echo "DEBUG: SUPABASE_SERVICE_KEY no encontrada"
fi

# === VALIDACIÓN TEMPRANA Y CLARA ===
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_KEY" ]; then
  echo "❌ ERROR: Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY"
  echo "   Edita SOLO el archivo: pipeline/.env"
  echo "   1. Abre pipeline/.env"
  echo "   2. Reemplaza la línea SUPABASE_SERVICE_KEY=... con tu service_role key real."
  echo "   3. Consíguela en: Supabase Dashboard → tu proyecto → Settings (⚙️) → API"
  echo "      (copia la que dice 'service_role' y tiene rol: service_role, NO la anon/public)"
  exit 1
fi

# Detectar placeholders o keys obviamente malas
case "$SUPABASE_SERVICE_KEY" in
  *PEGA*|*AQUI*|*TU_SERVICE*|*placeholder*|*...*)
    echo "❌ ERROR: SUPABASE_SERVICE_KEY parece un placeholder o está incompleta."
    echo "   Ve a pipeline/.env y pega la clave service_role COMPLETA (sin comillas, sin espacios extra)."
    exit 1
    ;;
esac

if [ ${#SUPABASE_SERVICE_KEY} -lt 100 ]; then
  echo "❌ ERROR: SUPABASE_SERVICE_KEY parece demasiado corta (${#SUPABASE_SERVICE_KEY} chars). Pega la key completa del dashboard."
  exit 1
fi

BATCH_LIMIT=${BATCH_LIMIT:-150}
MODE=${1:-"--mode=sitemaps"}

# Si pasas argumentos extra, se los pasamos al script de node
EXTRA_ARGS="$@"

echo "=== Cannabicultor Discovery (local, toda la red) ==="
echo "Modo: $MODE"
echo "Límite: $BATCH_LIMIT"

# Ejecutar el discovery
node pipeline/discovery/discover.js $EXTRA_ARGS --limit=$BATCH_LIMIT

echo ""
echo "✅ Discovery terminado."
echo ""
echo "Próximos pasos recomendados:"
echo "  1. Mira lo nuevo en Supabase:"
echo "     SELECT source, type, status, count(*) FROM discovered_sources GROUP BY source, type, status;"
echo ""
echo "  2. Extrae/enriquece los nuevos usando tus scripts existentes o nuevos extractors:"
echo "     ./run-breeders.sh"
echo "     BATCH=30 node enrich-varieties-detailed.mjs"
echo ""
echo "  3. Para descubrir más amplio la próxima vez:"
echo "     ./run-discovery.sh --mode=all --terms=\"banco de semillas california, new strain release 2026\""
echo ""
echo "NOTA: Todas las claves (Supabase + SERPAPI) se leen SOLO de pipeline/.env ."
echo "      No hace falta tocar nada dentro de este .sh."
