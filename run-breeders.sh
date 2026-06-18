#!/bin/zsh

# ==============================================
# Script de ayuda para continuar enriqueciendo breeders
# 
# Instrucciones:
# 1. Edita este archivo y pon tus claves reales (solo una vez)
# 2. Hazlo ejecutable:   chmod +x run-breeders.sh
# 3. Para correr el siguiente batch:   ./run-breeders.sh
#
# El script SOLO procesa breeders que todavía tienen campos vacíos
# (logo, instagram, descripción, etc.). 
# NO repite breeders que ya se actualizaron en corridas anteriores.
#
# Cada vez que lo ejecutes procesará hasta BATCH breeders pendientes.
# 
# Para forzar re-intentar TODOS los que tienen website (aunque ya tengan datos):
#   BATCH=3000 FORCE=1 ./run-breeders.sh
#
# Recomendado para continuar normalmente:
#   ./run-breeders.sh
# ==============================================

# === CLAVES: se cargan preferentemente desde pipeline/.env (recomendado) ===
# Si no existe .env o quieres override, ponlas aquí (pero mejor usa solo pipeline/.env)
if [ -f "pipeline/.env" ]; then
  set -a
  source pipeline/.env
  set +a
fi

# Limpieza
SUPABASE_URL=$(echo "${SUPABASE_URL:-https://gfyrsrdnvgnhtsuexjkb.supabase.co}" | tr -d ' \t\n\r')
SUPABASE_SERVICE_KEY=$(echo "${SUPABASE_SERVICE_KEY:-}" | tr -d ' \t\n\r')

# (Opcional) Si no vino del .env, aquí podrías exportar, pero se recomienda .env
export SUPABASE_URL
export SUPABASE_SERVICE_KEY

# Opcional: ajusta el tamaño del batch
# Recomendado: usa BATCH alto (2000-3000) para que en cada pasada incluya breeders con menos variedades
# y no se quede siempre en los mismos de arriba.
# Si pasas BATCH=xxxx desde fuera, lo respeta. Si no, usa 3000.
BATCH=${BATCH:-3000}

# Opcional: baja el delay para ir más rápido (en milisegundos)
# 1500 = seguro (recomendado), 500 = rápido, 0 = muy agresivo (puede bloquearte)
DELAY_MS=${DELAY_MS:-1500}

# Para forzar procesar TODOS los que tienen website (aunque ya tengan algunos datos o se haya intentado antes)
# FORCE=1 ./run-breeders.sh
FORCE=${FORCE:-0}

# ==============================================

echo "=== Enriqueciendo breeders (batch de $BATCH) ==="
echo "Carpeta actual: $(pwd)"

if [ -z "$SUPABASE_SERVICE_KEY" ] || echo "$SUPABASE_SERVICE_KEY" | grep -qi 'PEGA\|AQUI\|TU_SERVICE\|placeholder\|\.\.\.' || [ ${#SUPABASE_SERVICE_KEY} -lt 100 ]; then
  echo "❌ ERROR: SUPABASE_SERVICE_KEY no está cargada o parece placeholder."
  echo "   Pon tu service_role key real en pipeline/.env (línea SUPABASE_SERVICE_KEY=...)"
  echo "   o en la sección de este script. Obténla en Supabase Dashboard > Settings > API."
  exit 1
fi

# Ejecutar el script
DELAY_MS=$DELAY_MS BATCH=$BATCH FORCE=$FORCE node enrich-breeders.mjs

echo ""
echo "✅ Batch terminado."
echo "Para continuar con el siguiente lote, ejecuta de nuevo:"
echo "   ./run-breeders.sh"
echo ""
echo "Para ver cuántos breeders siguen sin logo:"
echo "   Abre admin-breeders.html o ejecuta esta consulta en Supabase SQL:"
echo "   SELECT COUNT(*) FROM breeders WHERE website IS NOT NULL AND logo_url IS NULL;"
