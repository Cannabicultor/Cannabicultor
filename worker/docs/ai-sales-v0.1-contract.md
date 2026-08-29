# Cannabicultor AI Sales v0.1 contract

`POST /ai-sales/recommend`

The endpoint is intentionally limited to an indoor 120×120 cm tent, four plants, coco and a maximum 900 € equipment budget. Seeds, electrical installation, advanced climate control and non-essential accessories are excluded.

```json
{
  "requirements": {
    "height_cm": 198,
    "seeds_in_budget": false,
    "budget_eur": 900
  }
}
```

The fixed scope values may optionally be sent and must equal: `tent_width_cm: 120`, `tent_depth_cm: 120`, `plant_count: 4`, `substrate: "coco"`. Unknown fields and values outside the scope return `400`.

If `height_cm` or `seeds_in_budget` is absent (or seeds are included), the endpoint returns `200` with `status: "needs_clarification"`, structured questions and no `selected_items`.

Successful responses contain `requirements`, `evidence`, `calculations`, `candidates_considered`, `discarded`, `selected_items` and `total_eur`. `selected_items` only contains `{sku, quantity, component, bundle}`; the storefront must re-query those SKU before invoking its existing cart API.

## Conversational entry point

`POST /ai-sales/chat` is separate from both `/ai-sales/recommend` and `/asesor`.
It accepts a short, client-held sequence of shopper-authored messages, the
current requirements state and the outstanding blocking field:

```json
{
  "messages": [{ "role": "user", "content": "Tengo 900 €, un espacio 120×120, quiero cuatro plantas en coco y parto de cero." }],
  "requirements": {},
  "pending_field": null
}
```

Only the shopper messages plus the minimal requirements state (budget,
dimensions, height, plant count, substrate and seed-budget confirmation) are
sent to the configured LLM provider. The model may only return requirement
updates; the Worker validates them with the same strict schema used by the
recommendation endpoint. The conversational text is never persisted. Once
the blocking fields are complete, the handler delegates to
`/ai-sales/recommend` logic; that final deterministic execution is the only
one recorded in `ai_sales_runs`.

## Curated profile and components

The versioned profile lives in `ai-sales.js`. Its source is `demo_growshop_productos` (`sku`, `nombre`, `descripcion_texto`, price and stock), checked on 2026-08-29; every SKU is revalidated on every request.

| Component | Curated SKU(s) | Rule |
| --- | --- | --- |
| Armario | `ASJDS120R4.00` | 120×120×198 cm |
| Iluminación | `ILED.066` | 720 W |
| Extracción | `XXT.110-150` | 272 m³/h >= calculated volume × 60 |
| Ventilación interior | `XXT.200` | 161 CFM |
| Macetas | `AMAC.84-19L` ×4 | one per plant |
| Coco | `SATA.041-100` | 100 L coco |
| Nutrición | `FATA.018-5A` + `FATA.018-5B` | declared A+B coco bundle |
| Medición básica | `MSG.003PH` + `MSG.002EC` | declared pH+EC bundle |

No fallback search exists. If any curated candidate is absent, exhausted, incompatible or makes the total exceed the budget, the response is blocked and records the structured reason.

---

## Nota de diseño (2026-08-29): pivote a Sales Agent multi-tenant

El AI Sales v0.1 (extractor JSON + motor determinista rígido, endpoints
`/ai-sales/recommend` y `/ai-sales/chat`) quedó descartado como experiencia de
cliente: no conversaba de verdad, repetía plantillas y se saltaba preguntas
bloqueantes por invención del LLM extractor. Se mantiene en el código sin
tocar (intacto, con sus 7 tests) como referencia y por si se quiere comparar,
pero no es el camino a producción.

El camino nuevo es `/sales-agent/chat` (`sales-agent.js` + handlers en
`worker-produccion.js`): un vendedor real con Claude tool-use, multi-tenant
desde el diseño:

- `sales_tenants`: clientes growshop del producto (SaaS), distinto del
  directorio `growshops` (scraping de tiendas físicas).
- `product_intelligence`: catálogo maestro compartido (cerebro), se enriquece
  con el tiempo (campo `needs_enrichment` para el agente de investigación).
- `sales_tenant_inventory`: inventario aislado por `tenant_id` — el bot NUNCA
  puede ver o vender productos de otro tenant, aunque el maestro crezca a
  cientos de miles de productos.
- `sales_agent_turns`: auditoría de conversación y tool calls por turno.
- `sales_missed_demand`: cuando un cliente pide algo que el growshop no
  tiene, el bot NUNCA lo manda a buscar a otro lado — registra la petición
  (+ email de contacto si lo consigue) para que el dueño decida si lo trae.
  Cierre del loop (avisar al cliente cuando el dueño responde) queda
  pendiente, deliberadamente fuera de alcance por ahora.

Piloto actual: solo 10 SKU migrados (el caso 120×120/coco/parto-de-cero),
tenant `demo-growshop-leaflife` (display_name "Growshop Demo"). Migrar el
catálogo completo (3.708 productos, de los cuales solo 12 sin descripción
decente) es el siguiente paso natural una vez validado el diseño.

Idea de producto guardada para más adelante, no construida aún: un dashboard
para que cada growshop dueño hable con SU vendedor IA — pedirle cosas como
"recomienda más esto" o "vende esto en liquidación" — es decir, el dueño
como otro usuario que instruye al agente, no solo lo audita.
