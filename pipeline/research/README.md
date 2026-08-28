# Agente de investigación semanal → RAG

Alimenta el RAG (`kb_documents` / `kb_chunks`) con literatura de calidad,
con **revisión humana obligatoria** antes de tocar el contenido real.

Flujo:

```
investigar.mjs  →  kb_candidates (pendiente)  →  [TÚ revisas]  →  aprobado / rechazado
                                                       ↓
                                          preparar-ingesta.mjs
                                                       ↓
                                     kb_documents + kb_chunks (sin embedding)
                                                       ↓
                                        [paso Voyage que ya usas]  →  buscable
```

Regla de oro: **nunca se descarga el contenido de una fuente en `pendiente`**.
`investigar.mjs` solo guarda metadatos (título, url, resumen). La descarga real
ocurre en `preparar-ingesta.mjs`, y solo sobre filas que TÚ marcaste `aprobado`.

---

## 1. Buscar (semanal)

```bash
cd ~/cannabicultor
SUPABASE_URL=... SUPABASE_SERVICE_KEY=... ANTHROPIC_API_KEY=... \
  node pipeline/research/investigar.mjs
```

Prueba sin escribir nada: `DRY_RUN=1 LIMIT=3 ... node pipeline/research/investigar.mjs`

Corre las ~22 queries de `queries.mjs`, filtra spam/comercial, deduplica contra
lo ya visto y contra el catálogo, y guarda lo nuevo en `kb_candidates` como
`pendiente`. Edita `queries.mjs` para rotar/añadir búsquedas cada semana.

## 2. Revisar y aprobar (tú, en Supabase)

Abre el **SQL Editor** de Supabase (proyecto `gfyrsrdnvgnhtsuexjkb`) y mira la cola:

```sql
select id, calidad, categoria, tipo, titulo, fuente, anio, resumen, url
from kb_candidates
where estado = 'pendiente'
order by calidad desc, categoria;
```

Aprobar los que valgan:

```sql
update kb_candidates set estado='aprobado', revisado_en=now() where id in (12, 15, 18);
```

Rechazar el resto (opcional, para que no reaparezcan):

```sql
update kb_candidates set estado='rechazado', revisado_en=now()
where estado='pendiente' and id in (13, 14);
```

> Alternativa sin SQL: puedes construir una vista en el Table Editor de Supabase
> filtrada por `estado='pendiente'` y editar la columna `estado` a mano.

## 3. Ingerir los aprobados

```bash
cd ~/cannabicultor
SUPABASE_URL=... SUPABASE_SERVICE_KEY=... \
  node pipeline/research/preparar-ingesta.mjs
```

- **HTML** (blogs, papers con texto completo): descarga, extrae, chunkea (mismos
  parámetros que el pipeline Python) e inserta en `kb_documents` + `kb_chunks`.
  Marca el candidato `ingerido` / `usado_en_rag=true`.
- **PDF**: lo descarga a `research/kb/pdfs/` y te indica el comando del pipeline
  Python. Los PDFs siguen tu flujo de catálogo + `run-kb-ingest.sh` de siempre.

## 4. Embeddings (paso que ya tienes)

⚠ Los chunks se insertan **sin embedding**. Hasta que corras tu paso de
embeddings **Voyage**, `match_chunks` no los devuelve. Los nuevos docs quedan en
`estado_ingesta='chunked'` — ese es tu filtro para saber qué falta embeber:

```sql
select id, archivo, chunk_count from kb_documents where estado_ingesta='chunked';
```

---

## Estados de `kb_candidates`

| estado      | significado                                        |
|-------------|----------------------------------------------------|
| `pendiente` | encontrado por el agente, esperando tu revisión    |
| `aprobado`  | lo apruebas → entra en la próxima ingesta          |
| `rechazado` | descartado, no vuelve a proponerse                 |
| `ingerido`  | ya en `kb_documents`/`kb_chunks` (`usado_en_rag`)  |

## Automatización (cuando el flujo demuestre que se gana el mantenimiento)

De momento se corre **a mano**. Si dentro de unas semanas ves que aporta, se
añade un cron semanal para el paso 1. Los pasos 2 y 3 siguen siendo manuales por
diseño (la aprobación es humana).
