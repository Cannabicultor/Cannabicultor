/**
 * Pega este bloque en tu Worker de Cloudflare (ruta POST / del chat)
 * si no usas módulos ES. Reemplaza el handler de chat existente.
 */

const VISION_PROMPT = `
ANÁLISIS DE FOTOS:
- Si el usuario envía una imagen, examínala: hojas, manchas, plagas, mohos, deficiencias, estrés.
- Describe primero lo que VES (1-2 frases), luego diagnóstico y pasos siguientes.
- Si la foto no es clara, pide otra mejor. No inventes detalles invisibles.`;

function buildSystemPrompt(perfil) {
  let base = `Eres Cannabicultor IA de Growers Alliance. Tono: autoridad con calidez. Tuteo respetuoso.
Primera frase responde DIRECTAMENTE. Máx 8-12 líneas. Abre UNA puerta al final.
NUNCA inventes estudios ni legislación.${VISION_PROMPT}`;
  if (!perfil) return base;
  const t = typeof perfil === 'string' ? perfil : JSON.stringify(perfil, null, 2);
  return base + '\n\nPERFIL:\n' + t;
}

function normalizeMessages(messages) {
  return (messages || []).map((msg) => {
    const role = msg.role === 'assistant' ? 'assistant' : 'user';
    if (role === 'assistant') {
      return { role, content: String(msg.content || '') };
    }
    if (Array.isArray(msg.content)) {
      const blocks = msg.content.map((part) => {
        if (part.type === 'text') return { type: 'text', text: part.text || '' };
        if (part.type === 'image') {
          const src = part.source || part;
          return {
            type: 'image',
            source: { type: 'base64', media_type: src.media_type || 'image/jpeg', data: src.data }
          };
        }
        return null;
      }).filter(Boolean);
      if (blocks.length === 1 && blocks[0].type === 'text') {
        return { role: 'user', content: blocks[0].text };
      }
      return { role: 'user', content: blocks };
    }
    return { role: 'user', content: String(msg.content || '') };
  });
}

function hasVision(messages) {
  return messages.some((m) => Array.isArray(m.content) && m.content.some((p) => p.type === 'image'));
}

async function handleChat(body, env) {
  const { messages, perfil } = body;
  const anthropicMessages = normalizeMessages(messages);
  const withVision = hasVision(anthropicMessages);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: withVision ? 900 : 600,
      system: buildSystemPrompt(perfil),
      messages: anthropicMessages,
    }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }
  const data = await response.json();
  return data.content?.[0]?.text || 'Error al procesar la respuesta.';
}

// Uso en fetch():
// const reply = await handleChat(body, env);
// return new Response(JSON.stringify({ reply }), { headers: { ...cors, 'Content-Type': 'application/json' } });