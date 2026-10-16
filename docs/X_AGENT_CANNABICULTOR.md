# Agente X de Cannabicultor — memoria técnica

Actualizado: 15 de octubre de 2026.

## Objetivo y estado

Panel independiente para generar borradores de posts de X con el RAG de Cannabicultor, aprobarlos manualmente y publicarlos en `@CannabicultorX`.

Estado actual:

- Generación: activa, DeepSeek con recuperación RAG.
- Aprobación: manual en el panel.
- Publicación: implementada, pero bloqueada hasta que se compren créditos de X API. La respuesta actual de X es `402 credits depleted`.
- Respuestas automáticas, búsqueda proactiva, seguimiento automático y mensajes directos: no implementados.

## Producción

- Worker: `growers-alliance-ai`.
- URL base: `https://growers-alliance-ai.nohumanclicks.workers.dev`.
- Panel: `/x-agent`.
- Código de entrada: `worker/worker-produccion.js`.
- Módulo del panel y API: `worker/x-agent-dashboard.js`.
- Despliegue: desde `worker/`, ejecutar `npx wrangler deploy`.

No guardar ni compartir enlaces de panel con parámetros privados, contraseñas, tokens OAuth o claves API.

## Rutas

| Método | Ruta | Uso |
| --- | --- | --- |
| GET | `/x-agent` | Interfaz privada del panel. |
| GET | `/x-agent/api/drafts` | Lista los últimos 30 borradores. |
| POST | `/x-agent/api/drafts` | Genera y guarda un borrador. Cuerpo: `{ "brief": "tema" }`. |
| POST | `/x-agent/api/approve` | Pasa un borrador a `approved`. Cuerpo: `{ "id": "uuid" }`. |
| POST | `/x-agent/api/publish` | Publica un borrador aprobado en X. Cuerpo: `{ "id": "uuid" }`. |

Las rutas API requieren la cabecera `X-X-Agent-Password`; el panel la añade tras iniciar sesión. La contraseña se compara en tiempo constante y vive solamente en el secreto `X_AGENT_DASHBOARD_PASSWORD`.

## Generación con RAG

El panel no debe llamar a DeepSeek directamente ni reutilizar `handleChat` para publicar. La ruta editorial correcta es:

1. `/x-agent/api/drafts` llama a `generateWithRag(brief)`.
2. `worker-produccion.js` inyecta `generateXDraftWithRag(topic, env)`.
3. Esta función usa `generarEmbeddingConsulta` (Voyage), `buscarChunksRelevantes` (`rpc/match_chunks_v2`) y `rerankChunks` (Cohere, cuando esté disponible).
4. Construye un contexto reducido de hasta cuatro fragmentos relevantes.
5. Llama exclusivamente a `callDeepSeek` con `deepseek-chat` y un prompt editorial de máximo 260 caracteres.
6. Se guarda como borrador en Supabase, truncado a 280 caracteres como salvaguarda.

No usar el flujo general `handleChat` para posts: su detección de intención/legalidad puede interpretar palabras de las instrucciones como la consulta del usuario y producir respuestas incorrectas.

## Datos y migraciones

Migración aplicada: `worker/sql/x_agent_drafts.sql`.

Tabla `public.x_agent_drafts`:

- `id` UUID.
- `text` (máximo 280 caracteres).
- `status`: `draft`, `approved`, `published` o `rejected`.
- `x_post_id`, `created_at`, `published_at`.

Migración OAuth aplicada previamente: `worker/sql/x_oauth_connections.sql` (conexiones y estados OAuth). El panel actual publica con el token de usuario guardado como secreto; aún no renueva tokens automáticamente.

## Secretos configurados

Los valores nunca deben aparecer en código, Notion, logs, capturas o documentación.

- `DEEPSEEK_API_KEY`
- `VOYAGE_API_KEY`
- `COHERE_API_KEY` (opcional, reranking)
- `SUPABASE_SERVICE_KEY`
- `X_USER_ACCESS_TOKEN`
- `X_USER_REFRESH_TOKEN`
- `X_CLIENT_ID`
- `X_CLIENT_SECRET`
- `X_TOKEN_ENCRYPTION_KEY`
- `X_AGENT_DASHBOARD_PASSWORD`

El token de X debe tener al menos `tweet.read`, `tweet.write`, `users.read` y `offline.access`.

## Publicación y costes de X

`POST /x-agent/api/publish` llama `POST https://api.x.com/2/tweets` con el token de usuario. Solo publica si el borrador está en estado `approved`.

El primer intento fue rechazado por X con `402 Payment Required` y `credits depleted`. Hay que comprar créditos en la consola de desarrolladores de X antes de reintentar. Según la tarifa vista el 15/10/2026, crear un post cuesta 0,015 USD; confirmar siempre la tarifa actual en X antes de presupuestar.

## Límites de automatización de X

- Publicaciones originales automáticas, útiles y no duplicadas: posibles tras cargar créditos.
- No automatizar seguimiento masivo, agresivo o indiscriminado.
- No responder automáticamente a publicaciones ajenas por búsqueda de palabras clave.
- Las respuestas automáticas solo pueden dirigirse a personas que hayan mostrado intención clara (por ejemplo, mencionar la cuenta o responder a un post), deben permitir exclusión fácil y limitarse a una respuesta por interacción.
- X exige aprobación previa, explícita y por escrito para bots de respuesta con IA.

Referencia: https://help.x.com/es/rules-and-policies/x-automation

## Próximos pasos seguros

1. Cargar créditos de X API y probar una publicación manual desde un borrador aprobado.
2. Implementar renovación segura del token usando `X_USER_REFRESH_TOKEN` y `x_oauth_connections` antes de depender del panel a diario.
3. Añadir calendario de posts propios con límite bajo, diversidad temática y registros de ejecución.
4. Añadir bandeja de menciones como borradores para revisión humana.
5. Solo después de la aprobación formal de X, evaluar respuestas automáticas con opt-in y mecanismo de baja.
