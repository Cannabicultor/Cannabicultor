#!/usr/bin/env bash
# Carga los documentos legales aprobados al RAG y pasa el test contra DeepSeek.
# Uso (desde cualquier carpeta del repo): bash worker/scripts/cargar-legal.sh
# Pide las claves ocultas (read -s): no quedan en el historial ni en pantalla.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1   # carpeta worker/
LOGS="$(mktemp -d)"

read -rsp "SUPABASE_SERVICE_KEY: " SUPABASE_SERVICE_KEY; echo
read -rsp "VOYAGE_API_KEY: " VOYAGE_API_KEY; echo
read -rsp "DEEPSEEK_API_KEY: " DEEPSEEK_API_KEY; echo
export SUPABASE_SERVICE_KEY VOYAGE_API_KEY DEEPSEEK_API_KEY
for v in SUPABASE_SERVICE_KEY VOYAGE_API_KEY DEEPSEEK_API_KEY; do
  [ -n "${!v}" ] || { echo "❌ Falta $v"; exit 1; }
done

P1="❌ no ejecutado"; P2="❌ no ejecutado"; P3="❌ no ejecutado"
resumen() {
  echo
  echo "================ RESUMEN ================"
  echo "1) Verificación modelo (dry-run): $P1"
  echo "2) Carga en Supabase:            $P2"
  echo "3) Test legal (DeepSeek):        $P3"
  echo "Logs completos: $LOGS"
}

echo; echo "── 1/3 Dry-run: verificación del modelo por coseno ──"
DRY_RUN=1 node scripts/ingest-legal-aprobado.mjs 2>&1 | tee "$LOGS/1-dryrun.log"
if [ "${PIPESTATUS[0]}" -ne 0 ] || ! grep -q "OK: voyage-multilingual-2, 1024 dims" "$LOGS/1-dryrun.log"; then
  P1="❌ el modelo no llega a coseno ≥ 0,99 (o error). No se ha escrito nada."
  resumen; exit 1
fi
P1="✅ $(grep -m1 'coseno vs guardados' "$LOGS/1-dryrun.log" | sed 's/^ *//')"

echo; echo "── 2/3 Carga real en kb_documents / kb_chunks ──"
node scripts/ingest-legal-aprobado.mjs 2>&1 | tee "$LOGS/2-carga.log"
if [ "${PIPESTATUS[0]}" -ne 0 ]; then
  P2="❌ error en la carga (ver $LOGS/2-carga.log)"
  resumen; exit 1
fi
P2="✅ $(grep -c '✅' "$LOGS/2-carga.log") países cargados: $(grep '✅' "$LOGS/2-carga.log" | sed -E 's/.*✅ ([A-Z]{2}):.*· ([0-9]+) chunks.*/\1(\2)/' | tr '\n' ' ')"

echo; echo "── 3/3 Test legal contra DeepSeek (documentos leídos de Supabase) ──"
LEGAL_FROM_DB=1 node scripts/test-legal-prompt.mjs 2>&1 | tee "$LOGS/3-test.log"
T=${PIPESTATUS[0]}
P3="$( [ "$T" -eq 0 ] && echo '✅' || echo '❌' ) $(tail -n 1 "$LOGS/3-test.log") (exit=$T)"

resumen
exit "$T"
