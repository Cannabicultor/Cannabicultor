# Agentes de datos de Cannabicultor

Estos flujos se importan **inactivos**. La instalación no incluye secretos, no aplica SQL, no envía Telegram ni habilita ninguna escritura.

## Arquitectura y límite de confianza

`Supabase/Postgres → n8n → Google Sheets` es el trayecto de publicación operativa. Supabase es la fuente canónica: una celda de la hoja nunca reemplaza un valor canónico existente. Las solicitudes editoriales entrantes se convierten en una revisión, no en un `UPDATE` directo.

`n8n → evidencia web → DeepSeek → RPC apply_deepseek_enrichment → Supabase` es el único trayecto de enriquecimiento. DeepSeek sólo extrae, normaliza y redacta sobre evidencia que recibe. La RPC es el límite de seguridad: no concedas a DeepSeek ni a un nodo de IA permisos de actualización directa.

`n8n → agent_alerts → Telegram` sólo publica alertas no enviadas y marca `sent_at` después de una entrega correcta.

## Instalación y credenciales

1. Copia `.env.example` como `.env` local. En n8n, define las mismas variables como variables de entorno o secretos del despliegue; no las pongas en nodos, exportaciones ni notas.
2. En Supabase SQL Editor, revisa y ejecuta manualmente, en orden, las dos migraciones de `supabase/migrations/`. La segunda es necesaria porque el esquema validado no tenía los campos editoriales. No hay ninguna migración ejecutada por este cambio.
3. En n8n, importa los cuatro JSON desde **Workflows → Import from File**. Permanecerán desactivados.
4. Crea credenciales separadas: `Supabase service role` como Header Auth (`apikey` y `Authorization: Bearer …`), Google Sheets OAuth2 con acceso exclusivo a la hoja indicada, DeepSeek Header Auth (`Authorization: Bearer …`) y Telegram Bot API. Nunca pegues las claves en un nodo Code.

La hoja operativa es `1M5EZ2-OFtar_i8l4BZEr8j0EzA3oFUGo00HJn_gUm_c`.

## Construcción exacta de los flujos

Los JSON son plantillas importables y deliberadamente no contienen nodos capaces de escribir. Añade los siguientes nodos sólo tras la prueba de lectura.

### 01-sync-sheet-supabase (diariamente, 03:00 Europe/Madrid)

Para cada pestaña con tabla canónica, usa un HTTP Request de lectura `GET $SUPABASE_URL/rest/v1/<tabla>?select=<columnas>&order=id.asc` con la credencial de Supabase, y después Google Sheets **Append or Update Row** usando `id` como clave. Antes de ese nodo filtra cualquier entrada cuya fila de Supabase tenga `editorial_status` `publicado` o `pendiente_revision`, o cuyo campo aparezca en `field_locks` con `is_locked=true`; esos valores siempre se exportan desde Supabase, nunca desde la hoja.

Si se habilita entrada desde la hoja, sólo permite que una acción humana cambie `editorial_status` a `pendiente_revision` y crea un `agent_jobs` de revisión. No conectes el resultado a una actualización de las tablas canónicas. `Tiendas_CBD` no se sincroniza: la base validada no tiene `public.tiendas_cbd`; el flujo debe crear una alerta `unmapped_sheet_tab:Tiendas_CBD` y detener esa rama.

### 02-enrichment-deepseek (martes, 03:30 Europe/Madrid)

1. Inserta trabajos `enrichment_deepseek` para filas `borrador` con alguno de sus campos permitidos vacío. Reclama como máximo cinco por RPC: `POST /rest/v1/rpc/claim_agent_jobs` con `{"p_worker":"n8n-deepseek","p_job_type":"enrichment_deepseek","p_limit":5}`.
2. Reúne URLs y fragmentos de fuentes. Si no hay una URL suficiente, no llames al modelo: marca el trabajo fallido y crea alerta.
3. Envía a DeepSeek (`$DEEPSEEK_MODEL`) este contrato: «Devuelve sólo JSON `{"changes":{"campo":"valor"},"evidence":{"campo":{"url":"https://…","excerpt":"…"}}}`. No completes ni infieras un dato sin evidencia textual. Campos permitidos: para `variedades`, `descripcion_tldr`, `tipo_semilla`, `linaje_padre`, `linaje_madre`, `maduracion_exterior`, `source_url`; para las demás tablas sólo `descripcion_tldr`, `source_url`.»
4. En un Code node valida que `changes` y `evidence` sean objetos, que toda clave esté permitida, los valores sean cadenas no vacías y cada evidencia tenga URL HTTPS. Si falla, marca el trabajo `failed` y alerta; no llames a la RPC.
5. La única escritura de contenido es `POST /rest/v1/rpc/apply_deepseek_enrichment` con `entity_table`, `entity_id`, `changes`, `evidence`. La RPC hace el bloqueo de fila, las comprobaciones y la actualización en una transacción. Marca el trabajo `succeeded` únicamente si su respuesta no informa `conflict_fields`; en conflicto, `failed` y no reintentes automáticamente.

### 03-alerts-telegram

Cada 30 minutos lee `agent_jobs` con `status=eq.failed&attempts=gte.3` y cada tabla canónica con `editorial_status=eq.pendiente_revision`. Crea `agent_alerts` con una clave determinista, por ejemplo `failed-job:<job-id>` o `review:<tabla>:<id>`. Consulta sólo alertas con `sent_at=is.null` y usa Telegram **Send Message** con `parse_mode=HTML`, por ejemplo `<b>Revisión requerida</b> variedades #42 — conflicto de evidencia`. Sólo tras éxito actualiza su `sent_at`; un error no modifica esa columna.

### 04-discover-growshops (viernes, 03:30 Europe/Madrid)

Este workflow parte siempre en `DRY_RUN`. Para convertirlo en agente operativo hace falta un proveedor de búsqueda permitido que entregue URL y fragmento de evidencia; no automatices scraping de Google Maps, Instagram o Facebook. Para cada candidato llama a `register_directory_candidate`. La función normaliza y compara nombre, teléfono, email, web e Instagram. Un duplicado no entra como alta: queda registrado como `duplicate` y genera una alerta deduplicada. Un candidato nuevo queda como `pending_review` hasta definir el RPC de alta canónica y el mapeo final de campos.

## Field Locking (norma obligatoria)

- Un lock `is_locked=true` bloquea cualquier propuesta de DeepSeek.
- Un valor canónico no nulo o no vacío también bloquea a DeepSeek, aunque no haya fila en `field_locks`.
- DeepSeek únicamente llena `NULL` o texto vacío.
- Si completa un campo, la RPC registra/actualiza `locked_by_source='agent_deepseek'`, `is_locked=false` y evidencia.
- Conflicto, clave no permitida o evidencia insuficiente: la entidad pasa a `pendiente_revision`, se inserta una alerta deduplicada y el valor existente permanece intacto.
- No implementes un «leer, decidir, actualizar» en nodos separados. Usa `apply_deepseek_enrichment`; el bloqueo de la fila y la condición `NULL/vacío` son atómicos.

## Mapeo de la hoja

| Pestaña | Tabla | Clave | Columnas Sheet → Supabase |
|---|---|---|---|
| Variedades | `variedades` | `id` | `Nombre→nombre`, `Slug→slug`, `Breeder ID→breeder_id`, `Tipo→tipo`, `THC→thc_pct`, `CBD→cbd_pct`, `Días floración→floracion_dias`, `Descripción→descripcion`, `TLDR→descripcion_tldr`, `Tipo semilla→tipo_semilla`, `Linaje padre→linaje_padre`, `Linaje madre→linaje_madre`, `Maduración exterior→maduracion_exterior`, `Fuente URL→source_url`, `Estado editorial→editorial_status`, `Indexable→indexable` |
| Breeders | `breeders` | `id` | `Nombre→breeder_name`, `Slug→slug`, `País→pais_origen`, `Año fundación→año_fundacion`, `Web→website`, `Descripción→descripcion`, `TLDR→descripcion_tldr`, `Fuente URL→source_url`, `Estado editorial→editorial_status`, `Indexable→indexable` |
| Growshops | `growshops` | `id` | `Nombre→nombre`, `Slug→slug`, `Descripción→descripcion`, `Dirección→direccion`, `Ciudad→ciudad`, `Provincia→provincia`, `CP→cp`, `Teléfono→telefono`, `Email→email`, `Web→web`, `Horario→horario`, `TLDR→descripcion_tldr`, `Fuente URL→source_url`, `Estado editorial→editorial_status`, `Indexable→indexable` |
| Asociaciones_CSC | `asociaciones` | `id` | igual que Growshops y `Acceso→acceso` |
| Tiendas_CBD | **sin tabla** | — | No hay mapeo seguro. Requiere decidir una tabla canónica o una ampliación explícita de `growshops`. |

Los nombres de cabecera son el contrato recomendado; adapta nodos de Google a los encabezados reales sólo después de comparar una exportación de lectura.

## Prueba, activación y reversión

Primero ejecuta manualmente cada plantilla en `READ_ONLY`, confirma que sus registros muestran el ID de hoja y no hay nodos de escritura. Añade después únicamente los `GET` a Supabase y Google Sheets Read; compara conteos e IDs. Exporta el resultado y revísalo antes de introducir nodos de escritura. Conecta Telegram a un chat de pruebas, nunca al chat real, durante esta fase.

Para activar, solicita confirmación del responsable, aplica las migraciones manualmente, habilita primero `01` en modo sólo exportación, luego `02` con lote 1 y finalmente `03` en chat de pruebas. Para detener, desactiva el workflow en n8n; para frenar trabajos ya en cola ejecuta `update public.agent_jobs set status='cancelled' where status='queued';`. Para revertir el comportamiento, desactiva los flujos y revierte con una migración nueva; no borres tablas, locks, alertas ni datos de catálogo.
