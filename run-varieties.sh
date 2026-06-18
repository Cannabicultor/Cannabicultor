#!/bin/zsh

# ==============================================
# Script de ayuda para enriquecer VARIEDADES
#
# Orden recomendado después de breeders:
# 1. Primero corre seedfinder-enrich.mjs (datos básicos: días floración, tipo, genética)
# 2. Luego corre enrich-varieties-detailed.mjs (datos ricos: terpenos, aromas, efectos, imágenes)
#
# Cada ejecución procesa un batch de breeders/variedades pendientes.
# Usa BATCH alto para avanzar más rápido.
# ==============================================

# === CLAVES: preferentemente desde pipeline/.env (única fuente recomendada) ===
if [ -f "pipeline/.env" ]; then
  set -a
  source pipeline/.env
  set +a
fi

# Limpieza defensiva
SUPABASE_URL=$(echo "${SUPABASE_URL:-https://gfyrsrdnvgnhtsuexjkb.supabase.co}" | tr -d ' \t\n\r')
SUPABASE_SERVICE_KEY=$(echo "${SUPABASE_SERVICE_KEY:-}" | tr -d ' \t\n\r')

export SUPABASE_URL
export SUPABASE_SERVICE_KEY

# === CONFIG ===
# Para seedfinder-enrich (datos básicos)
BATCH_SEEDFINDER=${BATCH:-100}
DELAY_SEEDFINDER=${DELAY_MS:-2000}

# Para enrich-varieties-detailed (datos ricos: terpenos, aromas, efectos, imágenes)
BATCH_DETAILED=${BATCH:-30}
DELAY_DETAILED=${DELAY_MS:-2200}

# Opcional: procesar solo un breeder específico (útil para probar)
# TARGET_BREEDER_ID=123 ./run-varieties.sh detailed
TARGET_BREEDER_ID=${TARGET_BREEDER_ID:-}

# ==============================================

echo "=== Enriqueciendo VARIEDADES ==="
echo "Carpeta actual: $(pwd)"

if [ -z "$SUPABASE_SERVICE_KEY" ] || echo "$SUPABASE_SERVICE_KEY" | grep -qi 'PEGA\|AQUI\|TU_SERVICE\|placeholder\|\.\.\.' || [ ${#SUPABASE_SERVICE_KEY} -lt 100 ]; then
  echo "❌ ERROR: SUPABASE_SERVICE_KEY no está cargada o parece placeholder."
  echo "   Pon la service_role key real en pipeline/.env o aquí."
  echo "   Dashboard Supabase → Settings → API → copia la key service_role."
  exit 1
fi

MODE=${1:-both}   # both | seedfinder | detailed

if [ "$MODE" = "both" ] || [ "$MODE" = "seedfinder" ]; then
  echo ""
  echo ">>> Paso 1: Datos básicos desde Seedfinder (seedfinder-enrich.mjs)"
  echo "Procesando hasta $BATCH_SEEDFINDER breeders..."

  if [ -n "$TARGET_BREEDER_ID" ]; then
    echo "Filtrando solo breeder ID: $TARGET_BREEDER_ID"
  fi

  BATCH=$BATCH_SEEDFINDER DELAY_MS=$DELAY_SEEDFINDER TARGET_BREEDER_ID=$TARGET_BREEDER_ID \
    node seedfinder-enrich.mjs
fi

if [ "$MODE" = "both" ] || [ "$MODE" = "detailed" ]; then
  echo ""
  echo ">>> Paso 2: Datos ricos (terpenos, aromas, efectos, imágenes) - enrich-varieties-detailed.mjs"
  echo "Procesando hasta $BATCH_DETAILED breeders..."

  if [ -n "$TARGET_BREEDER_ID" ]; then
    echo "Filtrando solo breeder ID: $TARGET_BREEDER_ID"
  fi

  BATCH=$BATCH_DETAILED DELAY_MS=$DELAY_DETAILED TARGET_BREEDER_ID=$TARGET_BREEDER_ID \
    node enrich-varieties-detailed.mjs
fi

echo ""
echo "✅ Ejecución terminada."
echo ""
echo "Para continuar:"
echo "  ./run-varieties.sh                # ambos pasos"
echo "  ./run-varieties.sh seedfinder     # solo básicos"
echo "  ./run-varieties.sh detailed       # solo ricos"
echo ""
echo "Consejo: Empieza con BATCH más bajo (ej. 20-30) para detailed porque es más lento (visita páginas individuales)."
echo "Para un breeder concreto de prueba:"
echo "  TARGET_BREEDER_ID=123 ./run-varieties.sh detailed"
echo ""
echo "Revisa progreso con:"
echo "  SELECT COUNT(*) FROM variedades WHERE enriched_at IS NULL;"
echo "  SELECT COUNT(*) FROM breeders WHERE seedfinder_synced IS NULL;"