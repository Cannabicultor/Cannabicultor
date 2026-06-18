# Instrucciones de Uso - Pipeline Local de Cannabicultor (Toda la Red)

**Fecha:** 2026-06-13  
**Versión:** On-demand local (sin VPS, sin servicios vivos)  
**Objetivo:** Descubrir breeders y variedades en **toda la red** (no solo Seedfinder) y convertirlos en datos estructurados de forma manual y controlada desde tu Mac.

---

## Antes de ejecutar nada (IMPORTANTE - una sola vez)

1. Da permisos de ejecución a todos los scripts:
   ```bash
   chmod +x run-*.sh pipeline/run-*.sh
   ```

2. Configura las claves **una sola vez** en el archivo de entorno (recomendado):
   - Copia `pipeline/.env.example` → `pipeline/.env` (si aún no lo hiciste)
   - Edita `pipeline/.env`:
     - La SUPABASE_URL ya viene puesta.
     - Reemplaza la línea `SUPABASE_SERVICE_KEY=...` pegando tu **service_role key** completa (de Supabase Dashboard → Settings → API).
     - Reemplaza `SERPAPI_KEY=...` con tu clave de https://serpapi.com (plan gratis es suficiente).
   - Todos los scripts (run-pipeline.sh, run-discovery.sh, run-harvest.sh, run-breeders.sh, run-varieties.sh, etc.) cargan automáticamente desde `pipeline/.env`.
   - NUNCA más edites las claves dentro de los archivos .sh (están limpiados).

3. (Opcional) Si usas un archivo `.env`, los scripts también heredan variables de entorno del shell.

---

## Archivos Ejecutables Principales (en la raíz del proyecto)

Todos los scripts están diseñados para ejecutarse **localmente** cuando tú quieras. No requieren estar siempre encendidos.

| Archivo                  | Propósito                                      | Uso típico                              | Notas importantes |
|--------------------------|------------------------------------------------|-----------------------------------------|-------------------|
| `run-discovery.sh`      | Motor de Descubrimiento amplio (toda la red)  | `./run-discovery.sh --mode=all`        | Encuentra nuevas fuentes vía sitemaps + búsquedas |
| `run-harvest.sh`        | Harvester / Procesador (convierte descubrimientos en datos reales) | `./run-harvest.sh` o con `--dry-run` | Inserta/actualiza en `breeders` y `variedades` |
| `run-pipeline.sh`       | Todo-en-uno (recomendado para la mayoría de casos) | `./run-pipeline.sh` o `--dry-run`     | Ejecuta discovery + harvest secuencialmente |
| `run-breeders.sh`       | Enriquecimiento legacy de breeders (logos, descripciones...) | `./run-breeders.sh`                    | Script original, sigue siendo útil |
| `run-varieties.sh`      | Enriquecimiento rico de variedades (terpenos, efectos, THC...) | `BATCH=20 ./run-varieties.sh`          | Para datos avanzados después del harvest |

**Consejo:** Empieza siempre con `run-pipeline.sh`. Los scripts legacy (`run-breeders.sh` y `run-varieties.sh`) se usan después para enriquecer datos que el harvester no cubre (especialmente terpenos y perfiles).

---

## Flujo Recomendado Paso a Paso

### 1. Preparación inicial (una sola vez)

1. Asegúrate de tener las variables de entorno de Supabase (las mismas que usas en los scripts antiguos).

2. Crea la tabla de seguimiento de descubrimientos (si no lo has hecho):

   ```bash
   # Copia y pega el contenido en el SQL Editor de Supabase
   cat pipeline/sql/create_discovered_sources.sql
   ```

3. Da permisos de ejecución (si no los tienes):

   ```bash
   chmod +x run-*.sh
   ```

4. (Opcional pero muy recomendado) Añade tu clave de SerpApi para búsquedas reales:

   - Consigue una gratis en https://serpapi.com (tienes créditos mensuales suficientes para uso manual).
   - Pon `SERPAPI_KEY=tu_clave_real` en `pipeline/.env` (después de copiar desde .env.example si hace falta).
   - O exporta la variable antes de correr: `export SERPAPI_KEY=tu_clave`

### 2. Ejecutar el Pipeline

**Forma más fácil (recomendada):**

```bash
./run-pipeline.sh
```

**Con opciones útiles:**

```bash
# Simular todo sin escribir nada en la base (ideal la primera vez)
./run-pipeline.sh --dry-run

# Más descubrimiento + más procesamiento
./run-pipeline.sh --discovery-mode=all --harvest-limit=60

# Solo harvest sobre lo que ya descubriste antes
./run-harvest.sh --dry-run
```

**Pasos separados (si quieres más control):**

```bash
# 1. Descubrir en toda la red
./run-discovery.sh --mode=all

# 2. Procesar lo descubierto
./run-harvest.sh
```

Después de cada ejecución revisa el dashboard:

- Abre `admin-breeders.html`
- O consulta en Supabase:
  ```sql
  SELECT * FROM discovered_sources WHERE status = 'new' ORDER BY discovered_at DESC LIMIT 20;
  SELECT breeder_name, website, logo_url FROM breeders ORDER BY updated_at DESC LIMIT 15;
  ```

### 3. Enriquecimiento Rico Posterior (Terpenos, Efectos, THC detallado)

El harvester mete datos básicos (nombre, web, logo, descripción, país, año, variedades básicas).

Para datos avanzados (terpenos, aromas, efectos, perfiles de cannabinoides, imágenes de cepas):

Usa los scripts legacy sobre los nuevos breeders:

```bash
# Enriquecer breeders (logos/descripciones que el harvester no pilló)
./run-breeders.sh

# Enriquecer variedades con datos ricos (terpenos etc.)
BATCH=15 ./run-varieties.sh
# o directamente:
BATCH=15 DELAY_MS=2200 node enrich-varieties-detailed.mjs
```

**Truco:** Después de un harvest grande, puedes filtrar solo los breeders nuevos en los scripts legacy modificando temporalmente el query (o corriendo con FORCE=1 si quieres reintentar).

---

## Opciones de los Comandos

### run-discovery.sh

- `--mode=sitemaps` → Solo rastrea sitemaps (rápido y seguro)
- `--mode=seeds` → Usa términos de búsqueda + crawl de páginas conocidas
- `--mode=all` → Ambos (recomendado)
- `--terms="término1,término2"` → Términos de búsqueda personalizados
- `--limit=150` → Cantidad aproximada de resultados

**Con SerpApi activado** las búsquedas son mucho más potentes (resultados reales de Google).

### run-harvest.sh

- `--dry-run` → Simula todo sin escribir (imprescindible al principio)
- `--limit=30` → Máximo de registros a procesar
- `--source="sitemap:xxx"` → Solo procesa de una fuente concreta
- `--type=breeder_home` → Solo breeders (o `strain_detail` para variedades)

### run-pipeline.sh

Combina los dos anteriores. Acepta `--dry-run`, `--discovery-mode=...` y `--harvest-limit=...`.

---

## Buenas Prácticas y Consejos

1. **Siempre usa --dry-run la primera vez** después de un discovery grande.
2. **No abuses de los límites** los primeros días. Empieza con `--limit=20-30`.
3. **Respeta los sitios**: Los scripts ya tienen delays y user-agents educados. No los bajes demasiado.
4. **Deduplicación**: El sistema intenta no crear duplicados por website y nombre. Aun así revisa manualmente los primeros días.
5. **Estado de los descubrimientos**:
   - `new` → Pendiente de procesar
   - `processed` → Ya convertido en breeder/variedad
   - `reviewed` → Visto pero no procesado (por ejemplo noticias)
   - `failed` → Error (puedes reintentar después)
6. **Después del harvest** usa los scripts legacy para enriquecer datos ricos.
7. **Visualización**: `admin-breeders.html` es tu mejor amigo para ver qué falta (logo, IG, país, variedades, etc.).
8. **Exportar**: Desde el admin-breeders.html puedes exportar CSV de la vista filtrada para analizar fuera.

---

## Estructura de Carpetas Relevante

```
cannabicultor/
├── run-pipeline.sh          ← Todo en uno
├── run-discovery.sh
├── run-harvest.sh
├── run-breeders.sh
├── run-varieties.sh
├── pipeline/
│   ├── discovery/
│   │   └── discover.js
│   ├── harvest.js
│   ├── lib/
│   │   ├── supabase-client.js
│   │   └── extract.js           ← Lógica de extracción reutilizable
│   ├── sql/
│   │   └── create_discovered_sources.sql
│   ├── .env.example
│   └── README.md
└── docs/
    ├── INSTRUCCIONES_PIPELINE_LOCAL.md   ← Este documento
    └── cannabis-database-pipeline-idea.md
```

---

## Solución de Problemas Frecuentes

- **"No hay registros nuevos"**: Ya procesaste todo o no corriste discovery antes. Corre discovery primero.
- **Errores de fetch**: Algunos sitios bloquean o requieren JS. El harvester es best-effort. Usa --dry-run y revisa manualmente las URLs problemáticas.
- **Duplicados**: Revisa por website en Supabase. El sistema es conservador.
- **Sin SerpApi**: Funciona pero con menos potencia. Añade la clave cuando puedas.
- **Quiero volver a procesar algo**: Cambia manualmente el `status` a 'new' en la tabla `discovered_sources`.

---

## Próximos Pasos Sugeridos (cuando quieras)

- Añadir más sitemaps en `pipeline/discovery/discover.js` (DEFAULT_SITEMAPS).
- Mejorar la extracción de variedades en `lib/extract.js`.
- Integrar más fuentes (Reddit, foros, PDFs de laboratorios).
- Añadir modo de crawling más profundo con Playwright (cuando tengas tiempo).

---

**Recuerda**: Todo está pensado para que **tú controles** cuándo se ejecuta. No hay nada automático ni "vivo". Corre los comandos cuando te apetezca actualizar tu base de datos con información fresca de toda la web.

¡Disfruta el pipeline!
🌿 Cannabicultor

---

*Este documento está pensado para copiarlo fácilmente a Apple Pages o cualquier procesador de texto. Formato limpio y con tablas.*
