#!/bin/zsh

# ============================================================
# run-harvest.sh — Harvester / Procesador (local on-demand)
#
# Convierte los descubrimientos de "toda la red" en datos reales
# en tus tablas de breeders y variedades.
#
# Uso (desde la raíz del proyecto):
#   ./pipeline/run-harvest.sh
#   ./pipeline/run-harvest.sh --dry-run
#   ./pipeline/run-harvest.sh --limit=50
#   ./pipeline/run-harvest.sh --source="sitemap:seedfinder.eu" --type=breeder_home
#
# Este script es el que cierra el bucle:
#   Discovery (run-discovery.sh) → Harvest (este) → Ves resultados en admin-breeders.html
#
# Claves: se cargan automáticamente desde pipeline/.env (NO edites las keys aquí).
# ============================================================

# === CARGA TEMPRANA DESDE pipeline/.env (única fuente de claves) ===
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

# Limpieza defensiva de whitespace (rompe JWTs)
SUPABASE_URL=$(echo "${SUPABASE_URL:-}" | tr -d ' \t\n\r')
SUPABASE_SERVICE_KEY=$(echo "${SUPABASE_SERVICE_KEY:-}" | tr -d ' \t\n\r')

# Debug (mascarado)
if [ -n "$SUPABASE_SERVICE_KEY" ]; then
  len=${#SUPABASE_SERVICE_KEY}
  last4=${SUPABASE_SERVICE_KEY: -4}
  echo "DEBUG: SUPABASE_SERVICE_KEY cargada para harvest (longitud: $len, ...$last4)"
else
  echo "DEBUG: SUPABASE_SERVICE_KEY no encontrada"
fi

# === VALIDACIÓN ===
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_KEY" ]; then
  echo "❌ ERROR: Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY"
  echo "   Edita SOLO pipeline/.env y pon tu SUPABASE_SERVICE_KEY (la service_role completa)."
  echo "   Consíguela en Supabase Dashboard > Settings > API (copia la de 'service_role')."
  exit 1
fi

if echo "$SUPABASE_SERVICE_KEY" | grep -qi 'PEGA\|AQUI\|placeholder\|\.\.\.' || [ ${#SUPABASE_SERVICE_KEY} -lt 100 ]; then
  echo "❌ ERROR: SUPABASE_SERVICE_KEY en .env parece placeholder o incompleta."
  echo "   Reemplázala por la clave service_role real (sin espacios ni comillas)."
  exit 1
fi

LIMIT=${LIMIT:-30}

# Pasar todos los argumentos extra, incluyendo --dry-run
EXTRA_ARGS="$@"

# Si el flag viene como arg o por env (desde run-pipeline), lo respetamos
if [[ " $@ " == *" --dry-run "* ]] || [ "$DRY_RUN" = "1" ]; then
  EXTRA_ARGS="$EXTRA_ARGS --dry-run"
  export DRY_RUN=1
fi

echo "=== Cannabicultor Harvester (local) ==="
echo "Procesando hasta $LIMIT registros nuevos..."
echo ""

node pipeline/harvest.js --limit=$LIMIT $EXTRA_ARGS

echo ""
echo "✅ Harvest terminado."
echo ""
echo "Consejos:"
echo "  - Para simular sin escribir:   ./pipeline/run-harvest.sh --dry-run"
echo "  - Para ver lo nuevo:           Abre admin-breeders.html"
echo "  - Para continuar:              Vuelve a correr discovery + harvest cuando quieras"
echo ""
