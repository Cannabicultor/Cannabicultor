# KB ingest — PDF → `kb_documents` / `kb_chunks`

Ingesta local y manual del catálogo RAG. No es un servicio 24/7.

El chat de producción (`worker/worker-produccion.js`) **lee** los chunks vía Voyage + `match_chunks`. Este pipeline es lo que **escribe** el lote.

## Requisitos

1. SQL ya aplicado en prod: `pipeline/sql/create_kb_tables.sql`
2. `SUPABASE_URL` y `SUPABASE_SERVICE_KEY` en `pipeline/.env` (no commitear)
3. `pip install -r pipeline/kb/requirements.txt` (el runner crea `.venv`)
4. Catálogo xlsx y PDFs **fuera de git**

```bash
export KB_CATALOG="$HOME/KB_RAD_cannabicultor/Catalogo_Cannabicultor_RAG_v2.2_Multilingual.xlsx"
export KB_PDF_DIR="$HOME/KB_RAG_Cannabicultor/research/kb/pdfs"
export KB_TXT_DIR="$HOME/KB_RAG_Cannabicultor/research/kb/txt"
```

## Uso

Desde la raíz del repo:

```bash
./pipeline/run-kb-ingest.sh --dry-run
./pipeline/run-kb-ingest.sh --doc=1
./pipeline/run-kb-ingest.sh --mode=chunk --force --doc=1
```

`--force` en modo `chunk` **borra** los chunks del documento y los vuelve a insertar **sin embeddings**. No lo uses sobre un doc ya vectorizado salvo que vayas a re-embeber (Voyage / Colab).

Para marcar como `indexado` un doc que ya tiene chunks + embedding, actualiza `estado_ingesta` en SQL; no relances el chunker.
