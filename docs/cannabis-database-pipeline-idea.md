# Idea: Sistema de Monitoreo y Actualización de la Base de Datos Más Completa de Cannabis

**Proyecto:** Cannabicultor IA / Growers Alliance  
**Objetivo principal:** Crear un sistema automatizado de monitoreo de internet que mantenga una base de datos de **breeders** y **variedades** lo más actualizada, completa y estructurada posible, alimentando un dashboard vivo y un motor de búsqueda avanzado.

**Fecha de creación de este documento:** 2026-06-11  
**Estado:** Idea conceptual + primeros artefactos de infraestructura implementados (2026-06-13)

**Progreso real (actualizado 2026-06-13):**
- Enfoque cambiado a **ejecución local on-demand** (se ejecuta desde tu Mac cuando quieras, sin necesidad de VPS ni "vivo").
- **Descubrimiento general en toda la red** (no centrado en Seedfinder): sitemaps de múltiples fuentes + seeds de búsqueda + crawl básico de links.
- `pipeline/run-discovery.sh` (y atajo en raíz) — el comando principal que usas.
- `pipeline/discovery/discover.js` — Motor de descubrimiento amplio.
- `pipeline/sql/create_discovered_sources.sql` — Tabla para trackear todo lo que se encuentra en la web.
- `pipeline/lib/supabase-client.js` + `lib/extract.js` (lógica reutilizable de extracción).
- `pipeline/run-harvest.sh` + `pipeline/harvest.js` — Harvester que convierte descubrimientos en datos reales (breeders/variedades).
- `admin-breeders.html` mejorado para ver gaps y datos ricos.
- Docker/compose se mantienen como opción secundaria.

Ahora tienes un flujo completo local y on-demand: Discovery amplio → Harvest (procesamiento) → visualización en el dashboard.

---

## Visión General

Actualmente el proyecto cuenta con scripts Node.js monolíticos para enriquecer datos de breeders y variedades (principalmente desde Seedfinder y sitios oficiales). 

La meta es evolucionar hacia una **verdadera canalización de datos (data pipeline)** modular, tolerante a fallos y escalable. 

La industria del cannabis es extremadamente fragmentada: la información vive en webs de bancos de semillas, agregadores (Seedfinder, Leafly, Phylos), foros, laboratorios, PDFs, redes sociales y anuncios de lanzamientos nuevos. Un sistema manual o semi-manual no escala.

El sistema debe ser capaz de:
- **Descubrir** nuevas fuentes automáticamente.
- **Extraer** datos de forma robusta (incluso de sitios con JavaScript pesado).
- **Procesar** texto no estructurado y convertirlo en datos estructurados (terpenos, perfiles de cannabinoides, efectos, linaje, etc.) usando IA.
- **Deduplicar** y fusionar información de múltiples fuentes.
- **Mantener actualizada** la base de datos de forma continua.
- Alimentar un **dashboard vivo** y un **motor de búsqueda** potente.

---

## Arquitectura Propuesta (4 Fases)

### 1. Motor de Descubrimiento (Identificar nuevas fuentes)
- Monitores de búsqueda automatizados (Google Dorks vía SerpApi u otras APIs).
- Monitoreo de sitemaps (Seedfinder, Leafly, bancos grandes).
- Detección de menciones en Reddit, foros y noticias ("new strain release", "terpene profile", etc.).
- Registro de nuevas URLs en una cola de extracción.

### 2. Flota de Extracción (Scraping Diario)
- Orquestación con **n8n** (o sistema de colas) para tareas programadas (CRON).
- Scrapers dinámicos con **Playwright** o **Puppeteer** (manejo de banners +18, navegación, etc.).
- Rotación de proxies residenciales (imprescindible para actualizaciones diarias).
- Gestión de colas de URLs pendientes.

### 3. Cerebro de Procesamiento (Limpieza y Estructuración con IA)
- Uso de **LLM local** (Ollama) o modelos externos para parsear descripciones.
- Extracción estructurada a JSON: terpenos + porcentajes, THC/CBD, linaje, días de floración, efectos, aromas, etc.
- Técnica de "compresión semántica" en los prompts para optimizar inferencia.
- Lógica avanzada de **deduplicación** (manejar variaciones de nombres como "OG Kush - Dinafem" vs "O.G. Kush (Dinafem)").
- Enriquecimiento y fusión de datos de múltiples fuentes.

### 4. Almacenamiento y Sincronización
- Base de datos principal: **Supabase (PostgreSQL con JSONB)** (actualmente ya se usa).
- Tablas adicionales para: fuentes (`sources`), historial de actualizaciones, jobs de scraping, y provenance de datos.
- Webhooks o triggers para notificar al dashboard cuando hay actualizaciones.
- Invalidación de caché y actualización en tiempo real del frontend (admin-breeders.html y futuro motor de búsqueda).

**Infraestructura recomendada:** Docker (o Docker Compose) para aislar procesos. Despliegue inicial en VPS (Hetzner u similar) por estabilidad y ancho de banda. Posibilidad de mover partes a local más adelante.

---

## Stack Tecnológico Actual y Futuro

**Actual (2026):**
- Supabase (PostgreSQL + JSONB) – tablas `breeders` y `variedades`
- Scripts Node.js (`enrich-breeders.mjs`, `enrich-varieties-detailed.mjs`, etc.)
- Dashboard vanilla HTML/JS (`admin-breeders.html`)
- Enriquecimiento manual/semi-automático desde Seedfinder y webs oficiales

**Futuro deseado:**
- Docker + contenedores aislados
- n8n (o BullMQ + workers) para orquestación
- Playwright para scraping
- Ollama (LLM local) para procesamiento de texto
- Sistema de colas y descubrimiento
- Mejor tracking de fuentes y confianza de datos
- Motor de búsqueda avanzado (filtros por terpenos, efectos, floración, breeder, etc.)

---

## Riesgos y Consideraciones Importantes

- **Legal y ToS**: Scraping masivo puede violar términos de servicio de Leafly, Seedfinder y bancos. Usar proxies no elimina el riesgo.
- **Bloqueos y rate limits**: Rotación de proxies residenciales es casi obligatoria para actualizaciones frecuentes.
- **Calidad de datos**: Muchos sitios dan información poética o incompleta. El LLM ayuda, pero se necesita validación y deduplicación fuerte.
- **Complejidad**: Pasar de scripts simples a un pipeline completo es un salto grande. Recomendable hacerlo por fases.
- **Costo**: Proxies + LLM (incluso local) + VPS pueden sumar si se escala mucho.

---

## Prompt para Recuperar Esta Idea (Copia y Pega)

**Instrucciones para usar este prompt:**
Copia todo el texto de abajo (desde "--- INICIO DEL PROMPT ---" hasta "--- FIN DEL PROMPT ---") y pégalo en una nueva conversación conmigo (o con otro modelo) cuando quieras retomar el trabajo. Esto le dará al modelo el contexto completo de la idea.

---

### --- INICIO DEL PROMPT ---

Eres un ingeniero de software experto ayudando a desarrollar **Cannabicultor**, un proyecto que busca crear la base de datos más completa y actualizada de breeders y variedades de cannabis del mundo, alimentando un dashboard vivo y un motor de búsqueda avanzado.

**Contexto del proyecto actual:**
- Base de datos en Supabase (PostgreSQL con JSONB) con tablas `breeders` y `variedades`.
- Ya existen scripts Node.js para enriquecimiento (`enrich-breeders.mjs` y `enrich-varieties-detailed.mjs`).
- Hay un dashboard admin en HTML/JS (`admin-breeders.html`).
- El objetivo es pasar de scripts monolíticos a un **data pipeline modular** tolerante a fallos.

**Visión completa del sistema que se quiere construir:**

1. **Motor de Descubrimiento**
   - Monitores automáticos de búsqueda (Google Dorks, SerpApi, Reddit, etc.).
   - Monitoreo de sitemaps de Seedfinder, Leafly, bancos de semillas, etc.
   - Detección de nuevos lanzamientos y menciones.

2. **Flota de Extracción**
   - Orquestación con n8n o sistema de colas.
   - Scrapers con Playwright/Puppeteer para sitios con JavaScript pesado.
   - Rotación de proxies residenciales.
   - Manejo de banners de edad y navegación compleja.

3. **Cerebro de Procesamiento (IA)**
   - Uso de LLM local (Ollama) o similar para convertir texto no estructurado en datos estructurados.
   - Extracción de: terpenos con porcentajes, THC/CBD, linaje, días de floración, efectos, aromas, etc.
   - Deduplicación inteligente de variedades y breeders.
   - "Compresión semántica" de prompts para eficiencia.

4. **Almacenamiento y Sincronización**
   - Mantener y enriquecer datos en Supabase (usar JSONB donde sea necesario).
   - Tablas adicionales para rastrear fuentes, historial de actualizaciones y provenance.
   - Webhooks o triggers para actualizar el dashboard en tiempo real.

**Requisitos importantes:**
- Arquitectura modular y en contenedores (Docker recomendado).
- Empezar de forma incremental, aprovechando los scripts existentes.
- Ser consciente de riesgos legales (ToS de sitios), bloqueos y calidad de datos.
- El sistema debe ser capaz de mantener la base de datos "viva" y lo más completa posible.

**Tu tarea cuando te pase este prompt:**
- Recuerda todo este contexto.
- Ayúdame a diseñar, planificar o implementar partes del sistema.
- Propón soluciones pragmáticas y por fases.
- Pregunta qué parte quiere atacar primero (diseño de BD, Docker, prompts para LLM, script de descubrimiento, etc.).
- Mantén el enfoque en crear la base de datos de cannabis más completa y actualizada posible.

--- FIN DEL PROMPT ---

---

## Cómo usar este documento

1. Guárdalo en tu repositorio (ya está en `docs/cannabis-database-pipeline-idea.md`).
2. Cuando quieras retomar el trabajo, copia el bloque **"--- INICIO DEL PROMPT ---"** completo y pégalo en una nueva conversación.
3. Puedes agregar notas nuevas debajo de este documento a medida que avances.

---

**Próximos pasos sugeridos (cuando estés listo):**

- Diseñar las tablas adicionales en Supabase (`sources`, `scraping_jobs`, `data_provenance`).
- Crear un Docker Compose inicial que envuelva los scripts actuales.
- Implementar el primer "tentáculo": monitoreo de sitemaps.
- Diseñar los prompts para el LLM de estructuración de terpenos y perfiles.

¿Quieres que ahora mismo te genere alguna de estas cosas (por ejemplo el esquema de base de datos extendido o una primera versión del Docker Compose) para que ya esté lista cuando retomes? O prefieres dejar el documento así por ahora.

¡Cuando quieras volver a trabajar en "la base de datos más completa del cannabis", solo pega el prompt!