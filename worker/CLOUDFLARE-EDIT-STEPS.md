# Cloudflare Worker — pasos en la página Edit

## NO pegues `chat-vision.js`
Ese archivo va en tu **web** (`assets/chat-vision.js`), no en Cloudflare.

## NO borres todo el código
Tu worker tiene **login, registro y Brevo**. Solo actualizas la parte del **chat IA**.

---

## Paso 1 — CORS (importante)

Busca en tu código algo como:

```js
'Access-Control-Allow-Headers': 'Content-Type',
```

Cámbialo por:

```js
'Access-Control-Allow-Headers': 'Content-Type, Authorization',
```

---

## Paso 2 — Pega estas funciones ARRIBA del `export default`

(Copia todo el bloque de `worker/standalone-chat.js` excepto las últimas 3 líneas de comentario)

---

## Paso 3 — Reemplaza el bloque del chat con Anthropic

**Busca** el código que hace `fetch('https://api.anthropic.com/v1/messages'` dentro del handler del chat (POST `/`).

**Borra** desde `const systemPrompt = ...` (o similar) hasta `const reply = data.content...`

**Pon en su lugar:**

```js
      const reply = await handleChat(body, env);

      return new Response(JSON.stringify({ reply }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
```

(Si ya tienes `const body = await request.json()` antes, no lo dupliques.)

---

## Paso 4 — Deploy

Clic en **Deploy** (arriba a la derecha).

---

## Probar

1. Entra al dashboard en cannabicultor.com
2. Abre el chat
3. Adjunta una foto 📷 y envía