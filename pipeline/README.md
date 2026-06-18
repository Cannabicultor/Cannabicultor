# Cannabicultor Data Pipeline — Versión Local On-Demand

**Filosofía actual (junio 2026):**

- **Ejecución local y manual** desde tu máquina (Mac).  
  Tú decides cuándo lanzarlo (`./pipeline/run-discovery.sh`). No es un servicio "vivo" 24/7.

- **Descubrimiento amplio en toda la red**, no centrado en Seedfinder.  
  El objetivo es encontrar breeders y variedades en cualquier parte: sitemaps de muchos sitios, búsquedas, páginas oficiales, foros, noticias, etc.

- Docker y orquestación "viva" (n8n + VPS) quedan como **opción futura** cuando quieras automatizar más o escalar. Por ahora todo está pensado para que lo corras cómodamente desde tu ordenador cuando te apetezca actualizar la base de datos.

## Estructura actual

```
pipeline/
├── run-discovery.sh                 ← El comando principal que vas a usar
├── discovery/
│   └── discover.js                  ← Motor de descubrimiento general (sitemaps + seeds + crawl básico)
├── sql/
│   └── create_discovered_sources.sql ← Tabla para guardar todo lo que encuentres
├── lib/
│   └── supabase-client.js           ← Cliente compartido
├── extractors/                      ← Aquí irán los "tentáculos" de extracción (por ahora uno de ejemplo)
├── docker-compose.yml + Dockerfile  ← Opcional (si algún día quieres aislar en contenedores)
└── README.md
```

## Primeros pasos (local, sin Docker)

1. Asegúrate de tener las variables de Supabase (las mismas que usas en `run-breeders.sh`).

2. Crea la tabla de seguimiento (importante para no duplicar):

   ```bash
   # Copia el SQL y ejecútalo en el SQL Editor de Supabase
   cat pipeline/sql/create_discovered_sources.sql
   ```

3. Haz ejecutable el runner:

   ```bash
   chmod +x pipeline/run-discovery.sh
   ```

4. Ejecuta tu primer descubrimiento amplio:

   ```bash
   ./pipeline/run-discovery.sh                    # sitemaps por defecto
   ./pipeline/run-discovery.sh --mode=seeds --terms="new strain 2026","banco de semillas"
   ./pipeline/run-discovery.sh --mode=all --limit=80
   ```

5. Revisa lo descubierto en Supabase (admin-breeders.html también te ayudará a ver gaps).

## Cómo funciona el descubrimiento actual

- **Sitemaps**: rastrea sitemaps.xml (y sitemap indexes) de varias fuentes. Fácil añadir más.
- **Seeds**: parte de términos de búsqueda + páginas conocidas y hace un crawl ligero de links relevantes.
- Todo se guarda en `discovered_sources` con `source`, `type`, `status`, `metadata`.
- Clasificación básica automática (breeder_home, strain_detail, news...).

Esto es el **Motor de Descubrimiento** real de "toda la red".

## Siguientes piezas que podemos construir ya

- Extractor general que, dada una URL de `discovered_sources`, intente extraer breeder + variedades (usando patrones + cheerio, extensible a Playwright).
- Script que marque como "queued" los nuevos y luego dispare los enriquecedores existentes.
- Soporte más fuerte de búsquedas (SerpApi, o incluso un modo donde pases tú los resultados).
- Detección de nuevos breeders desde Reddit/foros (con seeds).
- CLI más potente (`node pipeline/discovery/discover.js --help` ya funciona).

## Relación con lo anterior

- Tus scripts `enrich-breeders.mjs`, `enrich-varieties-detailed.mjs` y `scraper-seedfinder.mjs` **siguen siendo válidos**.
- El nuevo discovery los alimenta con candidatos mucho más amplios que solo Seedfinder.
- Cuando quieras, podemos refactorizar los extractores dentro de `pipeline/extractors/` para que también usen la tabla `discovered_sources`.

## Docker (secundario)

Si algún día quieres correrlo en contenedor (por limpieza o para probar en Linux):

```bash
cd pipeline
cp .env.example .env   # pon tus claves
docker compose run --rm scraper node discovery/discover.js --mode=all
```

Pero la forma recomendada por ahora es **directamente con node** desde tu Mac.

---

## Flujo recomendado actual (local + toda la red)

1. Descubrimiento amplio
   ```bash
   ./run-discovery.sh --mode=all
   # o
   ./run-discovery.sh --mode=seeds --terms="new cannabis strain 2026,banco de semillas"
   ```

2. Procesamiento / Harvest
   ```bash
   ./run-harvest.sh
   ./run-harvest.sh --dry-run                 # simula sin escribir
   ./run-harvest.sh --limit=50 --dry-run
   ```

3. Ver resultados
   - Abre `admin-breeders.html`
   - O consulta directamente:
     ```sql
     SELECT * FROM breeders ORDER BY updated_at DESC LIMIT 20;
     SELECT source, count(*) FROM discovered_sources GROUP BY source;
     ```

Este flujo es 100% local, on-demand y centrado en descubrir en toda la red.

---

## Próximos pasos posibles (dime cuál quieres)

- Mejorar el extractor general dentro del harvester (manejo de más sitios, variedades, deduplicación más inteligente).
- Añadir soporte SerpApi para búsquedas reales de "new strain release".
- Mejorar discovery (más sitemaps por defecto, crawling más profundo).
- Hacer que el harvester también dispare el enriquecimiento rico (terpenos, efectos) de tus scripts existentes.
- Un comando todo-en-uno: `./run-pipeline.sh` que haga discovery + harvest.

¿Quieres que sigamos con alguna de estas?
