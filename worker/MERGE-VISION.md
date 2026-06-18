# Activar análisis de fotos en el Worker de producción

El frontend ya envía imágenes en formato Anthropic Vision. Debes actualizar el Worker en Cloudflare.

## Opción A — Pegar el handler (recomendado si ya tienes auth/Brevo)

1. Abre [Cloudflare Dashboard](https://dash.cloudflare.com) → Workers → `growers-alliance-ai` → **Edit code**
2. Copia el contenido de `chat-handler.js` al inicio del worker (o impórtalo si usas módulos)
3. En la ruta `POST /` del chat, reemplaza la llamada a Anthropic por:

```js
import { handleChatRequest } from './chat-handler.js';
// ...
const result = await handleChatRequest(body, env);
return json(result.data, result.status, cors);
```

4. Asegúrate de que CORS permita el header `Authorization`
5. **Deploy**

## Opción B — Deploy completo con Wrangler

```bash
cd worker
npm i -g wrangler   # si no lo tienes
wrangler login
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put JWT_SECRET
wrangler deploy
```

**Nota:** `worker/index.js` solo incluye la ruta de chat. Si tu worker de producción tiene `/auth/*` y `/brevo-*`, fusiona `chat-handler.js` en ese archivo en lugar de reemplazar todo.

## Formato que envía el dashboard

```json
{
  "messages": [
    { "role": "user", "content": "texto anterior" },
    {
      "role": "user",
      "content": [
        { "type": "image", "source": { "type": "base64", "media_type": "image/jpeg", "data": "..." } },
        { "type": "text", "text": "¿Qué le pasa a esta hoja?" }
      ]
    }
  ],
  "perfil": { "plan": "libre", "cultivo": { ... } }
}
```