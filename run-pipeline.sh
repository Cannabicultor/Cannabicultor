#!/bin/zsh

# ============================================================
# run-pipeline.sh — Comando todo-en-uno (local on-demand)
#
# Ejecuta el flujo completo de descubrimiento + harvest en una sola llamada.
# Ideal para actualizaciones manuales desde tu Mac cuando quieras.
#
# ANTES DE USAR:
#   chmod +x run-*.sh pipeline/run-*.sh
#   Pon tus claves (SUPABASE_SERVICE_KEY + SERPAPI_KEY) en pipeline/.env
#   (una sola vez; todos los scripts del pipeline y legacy la leen automáticamente)
#
# Uso:
#   ./run-pipeline.sh
#   ./run-pipeline.sh --dry-run
#   ./run-pipeline.sh --discovery-mode=all --harvest-limit=40
# ============================================================

DISCOVERY_MODE="--mode=all"
HARVEST_ARGS=""
DRY_RUN=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)
      HARVEST_ARGS="$HARVEST_ARGS --dry-run"
      DRY_RUN="1"
      shift
      ;;
    --discovery-mode=*)
      DISCOVERY_MODE="--mode=${1#*=}"
      shift
      ;;
    --harvest-limit=*)
      HARVEST_ARGS="$HARVEST_ARGS --limit=${1#*=}"
      shift
      ;;
    *)
      HARVEST_ARGS="$HARVEST_ARGS $1"
      shift
      ;;
  esac
done

# Pasar dry-run vía env para que los sub-scripts y JS lo respeten de forma fiable
if [ -n "$DRY_RUN" ]; then
  export DRY_RUN=1
fi

echo "=== Cannabicultor Pipeline Completo (local) ==="
echo "1) Discovery: $DISCOVERY_MODE"
echo "2) Harvest: $HARVEST_ARGS"
echo ""

echo ">>> Paso 1: Descubrimiento amplio"
./run-discovery.sh $DISCOVERY_MODE

echo ""
echo ">>> Paso 2: Harvest / Procesamiento"
./run-harvest.sh $HARVEST_ARGS

echo ""
echo "✅ Pipeline completo terminado."
echo "Abre admin-breeders.html para ver los resultados."
echo "Para más extracciones ricas (terpenos etc.) usa tus run-*.sh legacy cuando quieras."
