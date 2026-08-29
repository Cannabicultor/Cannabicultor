# AI Sales — historial de diseño

## 2026-08-29: v0.1 (extractor JSON + motor determinista) — RETIRADO

Construido inicialmente con Codex: endpoints `/ai-sales/recommend` y
`/ai-sales/chat`, un extractor JSON de requisitos + motor determinista de
reglas para un único caso de uso (indoor 120×120, coco, 4 plantas, parto de
cero). Quedó descartado como experiencia de cliente:

- Conversación rígida — en cuanto tenía los 2 campos bloqueantes (altura,
  semillas), disparaba la cesta y repetía la misma respuesta plantilla sin
  importar qué se preguntara después.
- El extractor LLM alucinó valores (`seeds_in_budget: false`) sin que el
  usuario los hubiera dicho, saltándose la pregunta de confirmación que el
  propio código exigía.
- No tenía ninguna noción de "vendedor" real: no argumentaba, no manejaba
  objeciones, no conversaba sobre lo ya propuesto.

Código eliminado el 2026-08-29 (`ai-sales.js`, rutas en
`worker-produccion.js`, páginas `ai-sales-test.html`/`ai-sales-chat.html`).
La tabla `ai_sales_runs` en Supabase se conserva con los datos históricos de
las pruebas, pero ya no recibe escrituras nuevas.

## 2026-08-29: Sales Agent multi-tenant (Claude tool use) — ACTIVO

Reemplazo completo. Un solo endpoint nuevo: `POST /sales-agent/chat`
(`sales-agent.js` + handlers en `worker-produccion.js`). Diseño:

- **Un cerebro, muchos inventarios aislados.** El vendedor es Claude con
  tool-use real (no un extractor JSON): decide libremente cuándo buscar
  productos, calcular una cesta o registrar demanda no cubierta, como haría
  un vendedor humano. Cada tool se ejecuta hard-scoped a un `tenant_id`
  resuelto server-side (por `tenant_slug` en el body por ahora; pendiente
  resolverlo por dominio/origin cuando haya más de un tenant real) — el
  modelo nunca ve ni controla ese valor, así que no puede filtrarse
  inventario de un growshop a otro aunque el catálogo maestro crezca a
  cientos de miles de productos.
- **Tablas**: `sales_tenants` (clientes growshop del SaaS, distinto del
  directorio `growshops` que es scraping de tiendas físicas),
  `product_intelligence` (catálogo maestro compartido — el "cerebro" que se
  enriquece con el tiempo, campo `needs_enrichment` para el agente de
  investigación), `sales_tenant_inventory` (inventario aislado por tenant,
  único lugar que las tools pueden leer), `sales_agent_turns` (auditoría de
  conversación y tool calls), `sales_missed_demand` (demanda no cubierta +
  contacto del cliente).
- **Nunca manda al cliente a buscar en otro lado.** Si algo no está en el
  inventario del tenant, el bot lo reconoce con honestidad, pide el email si
  hace falta, y registra la necesidad — sin prometer plazos. El cierre del
  loop (avisar al cliente cuando el dueño del growshop responde) queda
  fuera de alcance por ahora, es un paso manual.
- **Guardas anti-alucinación de datos reales**: precio/stock siempre vienen
  de una llamada a `calcular_cesta` justo antes de cerrar (nunca de memoria
  de turnos anteriores); un email de contacto solo se guarda si aparece
  literalmente en lo que el cliente escribió en ESA conversación — el
  modelo no puede "recordar" un contacto de otra sesión y afirmar que ya lo
  tiene.
- **Ritmo de conversación**: una pregunta por turno, respuestas cortas — los
  clientes no leen mensajes largos ni recuerdan varias preguntas a la vez.

Piloto actual: 10 SKU migrados (el caso 120×120/coco/parto-de-cero), tenant
único `demo-growshop-leaflife` (display_name "Growshop Demo"). Migrar el
catálogo completo (3.708 productos del demo, de los cuales solo 12 sin
descripción decente) y probar con un segundo tenant real (para validar el
aislamiento de inventario con datos reales, no solo por diseño de código)
son los siguientes pasos.

Búsqueda de catálogo: `buscar_productos` intenta primero la frase literal
del modelo contra nombre/categoría, y si no hay resultado expande
automáticamente a palabras sueltas + sinónimos del rubro (led/luz/
iluminación/foco/panel, extractor/extracción, etc.) antes de rendirse. Esto
corrigió un bug real donde el bot decía "no tengo LED" teniendo stock,
porque buscaba la frase completa "iluminación LED panel luz cultivo" que
nunca hace match literal contra "LED MJ3 RS 720w".

Idea de producto guardada para más adelante, no construida aún: un
dashboard para que cada growshop dueño hable con SU vendedor IA — pedirle
cosas como "recomienda más esto" o "vende esto en liquidación" — el dueño
como otro usuario que instruye al agente, no solo lo audita.

Decisión explícita del usuario: cada conversación del sales agent empieza
sin memoria de otras sesiones/días — no hay reconocimiento de "cliente
recurrente" todavía. Si se quiere en el futuro, requiere una tabla real de
clientes del growshop + identificación del visitante (cookie/login), nunca
que el modelo "recuerde" de su propio contexto entre conversaciones
distintas.
