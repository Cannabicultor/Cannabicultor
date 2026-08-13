#!/bin/zsh
# ============================================================
# run-kb-ingest.sh — Ingesta del catálogo RAG → Supabase
#
# Uso (desde la raíz del proyecto):
#   ./pipeline/run-kb-ingest.sh
#   ./pipeline/run-kb-ingest.sh --mode=download --limit=3
#   ./pipeline/run-kb-ingest.sh --doc=24 --force
#   ./pipeline/run-kb-ingest.sh --dry-run
#
# Requisitos:
#   1. Ejecutar pipeline/sql/create_kb_tables.sql en Supabase
#   2. pipeline/.env con SUPABASE_URL y SUPABASE_SERVICE_KEY
#   3. pip install -r pipeline/kb/requirements.txt
#   4. Catálogo v2.2 (KB_CATALOG o ~/KB_RAD_cannabicultor/Catalogo_…xlsx)
#   5. PDFs locales: KB_PDF_DIR o research/kb/pdfs/ (no van a git)
# ============================================================

if [ -n "$ZSH_VERSION" ]; then
  SCRIPT_DIR=$(cd -- "$(dirname -- "${(%):-%N}")" && pwd)
else
  SCRIPT_DIR=$(cd -- "$(dirname -- "$0")" && pwd)
fi
REPO_ROOT=$(cd -- "$SCRIPT_DIR/.." && pwd)

if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a
  source "$SCRIPT_DIR/.env"
  set +a
fi

if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_KEY" ]; then
  echo "❌ Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY en pipeline/.env"
  exit 1
fi

VENV="$SCRIPT_DIR/kb/.venv"
if [ ! -d "$VENV" ]; then
  echo "Creando entorno virtual en pipeline/kb/.venv …"
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install -q -r "$SCRIPT_DIR/kb/requirements.txt"
fi

export KB_CATALOG="${KB_CATALOG:-$HOME/KB_RAD_cannabicultor/Catalogo_Cannabicultor_RAG_v2.2_Multilingual.xlsx}"

echo "=== Cannabicultor KB Ingest ==="
echo "Catálogo: $KB_CATALOG"

EXTRA=("$@")
HAS_CATALOG=0
for arg in "$@"; do
  if [[ "$arg" == --catalog=* ]]; then HAS_CATALOG=1; break; fi
done
if [ "$HAS_CATALOG" -eq 0 ]; then
  EXTRA+=("--catalog=$KB_CATALOG")
fi

# Actualizar Estado_ingesta en xlsx por defecto en corridas reales
HAS_UPDATE=0
HAS_DRY=0
for arg in "$@"; do
  [[ "$arg" == --update-catalog ]] && HAS_UPDATE=1
  [[ "$arg" == --dry-run ]] && HAS_DRY=1
done
if [ "$HAS_UPDATE" -eq 0 ] && [ "$HAS_DRY" -eq 0 ]; then
  EXTRA+=("--update-catalog")
fi

"$VENV/bin/python" "$SCRIPT_DIR/kb/ingest.py" "${EXTRA[@]}"