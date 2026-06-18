# Extractors (Tentáculos de extracción)

Cada archivo aquí es un "tentáculo" independiente que puede ejecutarse solo o orquestado.

Convenciones:
- Usar `../lib/supabase-client.js`
- Respetar BATCH y DELAY_MS del entorno
- Marcar siempre `enriched_at` / `seedfinder_synced` / `data_source`
- Upsert defensivo (no pisar datos buenos del usuario)
- Loggear con la función `log` de la lib

Ejemplos actuales:
- `seedfinder-scraper.mjs` — lista inicial de variedades de un breeder (refactor del scraper original)

Futuros extractors recomendados:
- `breeder-website.mjs` (visita el sitio oficial del breeder para logos, descripciones, lab reports)
- `leafly-variety.mjs` (mejor fuente de terpenos cuantitativos %)
- `reddit-new-strain.mjs` (detección de lanzamientos nuevos)
- `pdf-lab-report.mjs` (parsers para PDFs de laboratorios)

Todos deben ser capaces de correr dentro del contenedor `scraper` del compose.
